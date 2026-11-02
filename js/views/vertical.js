// Vertical score (縦譜) in the style of Ikuta-ryū printed koto music:
// read top to bottom, columns right to left, one square per beat, string
// names in kanji, finger numbers 2/3 (thumb unmarked), katakana for
// left-hand techniques, ○ for rests and a line for a note that keeps ringing.

import { el, clear } from './svg.js';
import { STRING_NAMES, pitchName } from '../tunings.js';
import { FINGERS } from '../techniques.js';
import { beatUnit } from '../notation.js';

const EPS = 1e-6;
const CELL = 46;

const TECH_SYMBOL = { hiki: 'ヒ', tsuki: 'ツ', yuri: 'ユ', hanashi: 'ハ', sukui: 'ス', keshi: 'ケ', suri: '→' };

export class VerticalView {
  constructor(container, { onSelect, onBar } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onBar = onBar;
    this.noteEls = new Map();
    this.cells = [];
    this.options = { syllables: true, pitches: false };
  }

  render(arr) {
    this.arr = arr;
    clear(this.container);
    this.noteEls.clear();
    this.cells = [];
    // one square per beat; in x/8 meters one square per eighth note
    const unit = arr.timeSig[1] === 8 ? 0.5 : beatUnit(arr.timeSig);
    const width = Math.max(320, this.container.clientWidth || 900);
    const colW = CELL + 40;
    const cols = Math.max(2, Math.floor((width - 20) / colW));
    // measures per column: aim for ~8 beat cells
    const cellsPerBar = Math.round(arr.measures[0]?.beats / unit) || 4;
    const barsPerCol = Math.max(1, Math.floor(8 / cellsPerBar));
    const columns = [];
    for (let i = 0; i < arr.measures.length; i += barsPerCol) columns.push(arr.measures.slice(i, i + barsPerCol));
    const pages = [];
    for (let i = 0; i < columns.length; i += cols) pages.push(columns.slice(i, i + cols));
    const colH = barsPerCol * cellsPerBar * CELL + 30;
    const height = pages.length * (colH + 30) + 10;
    const svg = el('svg', { class: 'vert-svg', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Vertical koto score' }, this.container);
    this.svg = svg;
    this.hl = el('rect', { class: 'cell-hl', x: 0, y: 0, width: CELL, height: CELL, visibility: 'hidden' }, svg);
    pages.forEach((page, pi) => {
      const top = pi * (colH + 30) + 22;
      page.forEach((col, ci) => {
        // right to left
        const x = width - 14 - (ci + 1) * colW + 12;
        let y = top;
        for (const m of col) {
          const nCells = Math.round(m.beats / unit);
          const num = el('text', { x: x + CELL + 4, y: y - 4, class: 'v-barnum', text: String(m.index + 1) }, svg);
          num.addEventListener('click', (e) => this.onBar && this.onBar(m.index, e.shiftKey));
          for (let c = 0; c < nCells; c++) {
            const cy = y + c * CELL;
            const start = m.start + c * unit;
            el('rect', { x, y: cy, width: CELL, height: CELL, class: 'v-cell' + (c === 0 ? ' first' : '') }, svg);
            this.cells.push({ start, end: start + unit, x, y: cy });
            this.renderCell(svg, m, start, unit, x, cy);
          }
          el('line', { x1: x - 2, x2: x + CELL + 2, y1: y, y2: y, class: 'v-bar' }, svg);
          y += nCells * CELL;
        }
        el('line', { x1: x - 2, x2: x + CELL + 2, y1: y, y2: y, class: 'v-bar' }, svg);
      });
    });
  }

  renderCell(svg, m, start, unit, x, y) {
    const evs = m.events.filter((e) => e.t >= start - EPS && e.t < start + unit - EPS);
    if (!evs.length) {
      // held from an earlier note?
      const holding = this.arr.events.some((e) => !e.rest && e.t < start - EPS && e.t + e.d > start + EPS);
      if (holding) el('line', { x1: x + CELL / 2, x2: x + CELL / 2, y1: y + CELL * 0.22, y2: y + CELL * 0.78, class: 'v-hold' }, svg);
      return;
    }
    const split = evs.length > 1 || evs[0].t > start + EPS;
    if (split) el('line', { x1: x, x2: x + CELL * 0.62, y1: y + CELL / 2, y2: y + CELL / 2, class: 'v-split' }, svg);
    for (const ev of evs) {
      const rel = (ev.t - start) / unit;
      const span = Math.min(unit - (ev.t - start), ev.d) / unit;
      const h = Math.max(span * CELL, CELL / 4);
      const cy = y + rel * CELL + h / 2;
      const size = Math.max(10, Math.min(26, h * 0.62));
      if (ev.rest) {
        el('circle', { cx: x + CELL / 2, cy, r: Math.max(3, size * 0.32), class: 'v-rest' }, svg);
        continue;
      }
      const grp = el('g', { class: 'v-note', 'data-idx': ev.idx, tabindex: 0, role: 'button' }, svg);
      grp.addEventListener('click', () => this.onSelect && this.onSelect(ev.idx));
      grp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onSelect && this.onSelect(ev.idx); } });
      const notes = ev.notes.filter((n) => n.string);
      const els = [];
      const sz = notes.length > 1 ? size * 0.72 : size;
      notes.forEach((n, i) => {
        const nx = x + CELL / 2 + (notes.length > 1 ? (i - (notes.length - 1) / 2) * sz * 0.95 : 0);
        const label = this.options.pitches ? pitchName(n.pitch, { octave: false }) : STRING_NAMES[n.string - 1];
        const t = el('text', { x: nx, y: cy + sz * 0.36, class: 'v-kanji' + (n.shifted ? ' shifted' : ''), 'font-size': this.options.pitches ? sz * 0.7 : sz, 'text-anchor': 'middle', text: label }, grp);
        els.push(t);
        const fm = FINGERS[n.finger]?.mark;
        if (fm) el('text', { x: nx + sz * 0.5, y: cy - sz * 0.18, class: 'v-finger', 'font-size': Math.max(8, sz * 0.42), text: fm }, grp);
        if (n.press) el('text', { x: nx + sz * 0.52, y: cy + sz * 0.5, class: 'v-press', 'font-size': Math.max(8, sz * 0.44), text: n.press === 1 ? 'ヲ' : 'オ' }, grp);
      });
      const marks = ev.techs.map((tch) => TECH_SYMBOL[tch]).filter(Boolean).join('');
      if (marks) el('text', { x: x + CELL - 2, y: cy + sz * 0.1, class: 'v-tech', 'font-size': Math.max(8, sz * 0.42), text: marks }, grp);
      if (ev.techs.includes('ato') || ev.techs.includes('ato1')) {
        el('text', { x: x + CELL / 2 + sz * 0.55, y: cy + sz * 0.95, class: 'v-press', 'font-size': Math.max(8, sz * 0.44), text: ev.techs.includes('ato') ? 'オ' : 'ヲ' }, grp);
      }
      if (ev.techs.includes('kaki') || ev.techs.includes('wari')) {
        el('path', { d: wave(x + CELL / 2 - sz * 0.75, cy - sz * 0.4, sz * 0.8), class: 'v-kaki' }, grp);
      }
      if (this.options.syllables && ev.shoga) {
        el('text', { x: x - 4, y: cy + 3, class: 'v-syllable', 'text-anchor': 'end', text: ev.shoga }, grp);
      }
      this.noteEls.set(ev.idx, els);
    }
  }

  setPlayhead(beat) {
    if (beat == null) { this.hl.setAttribute('visibility', 'hidden'); return null; }
    const c = this.cells.find((k) => beat >= k.start - EPS && beat < k.end - EPS);
    if (!c) return null;
    this.hl.setAttribute('visibility', 'visible');
    this.hl.setAttribute('x', c.x);
    this.hl.setAttribute('y', c.y);
    return { y0: c.y - 60, y1: c.y + CELL + 60 };
  }

  setActive(indices) {
    for (const [idx, els] of this.noteEls) for (const e of els) e.classList.toggle('on', indices.has(idx));
  }

  setSelected(idx) {
    this.svg?.querySelectorAll('.v-note.selected').forEach((n) => n.classList.remove('selected'));
    if (idx != null) this.svg?.querySelector(`.v-note[data-idx="${idx}"]`)?.classList.add('selected');
  }

  setLoop() {}
}

function wave(x, y, h) {
  const seg = h / 4;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < 4; i++) d += ` q ${i % 2 ? -3 : 3} ${seg / 2} 0 ${seg}`;
  return d;
}
