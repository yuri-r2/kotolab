// Tab view: 13 string lanes (一 at the top, as the koto lies in front of you),
// time running left to right, wrapped into systems like Songsterr/Guitar Pro.

import { el, clear } from './svg.js';
import { STRING_NAMES, pitchName } from '../tunings.js';
import { TECHNIQUES, FINGERS } from '../techniques.js';
import { barBeats, beatUnit } from '../notation.js';

const LANE = 15;
const GUTTER = 62;
const TOP = 46;
const RHYTHM = 40;
const EPS = 1e-6;

export class TabView {
  constructor(container, { onSelect, onBar } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onBar = onBar;
    this.noteEls = new Map();
    this.systems = [];
    this.options = { pitches: false, syllables: true };
  }

  render(arr) {
    this.arr = arr;
    clear(this.container);
    this.noteEls.clear();
    const width = Math.max(320, this.container.clientWidth || 900);
    const bb = barBeats(arr.timeSig);
    const measures = arr.measures;
    const minBeat = width < 600 ? 40 : 46;
    const usable = width - GUTTER - 8;
    // group measures into systems
    const systems = [];
    let cur = [];
    let beats = 0;
    for (const m of measures) {
      if (cur.length && (beats + m.beats) * minBeat > usable) {
        systems.push(cur);
        cur = [];
        beats = 0;
      }
      cur.push(m);
      beats += m.beats;
    }
    if (cur.length) systems.push(cur);
    const sysH = TOP + LANE * 13 + RHYTHM + 18;
    const svg = el('svg', { class: 'tab-svg', width, height: systems.length * sysH + 10, viewBox: `0 0 ${width} ${systems.length * sysH + 10}`, role: 'img', 'aria-label': 'Koto tablature' }, this.container);
    this.svg = svg;
    this.systems = [];
    const fullBeats = Math.max(...systems.map((s) => s.reduce((a, m) => a + m.beats, 0)));
    systems.forEach((sys, si) => {
      const y0 = si * sysH + 6;
      const totalBeats = sys.reduce((a, m) => a + m.beats, 0);
      const isLast = si === systems.length - 1;
      const beatPx = isLast && systems.length > 1 ? Math.min(usable / totalBeats, usable / fullBeats) : usable / totalBeats;
      const g = el('g', { class: 'system' }, svg);
      const laneY = (s) => y0 + TOP + (s - 1) * LANE + LANE / 2;
      const xEnd = GUTTER + totalBeats * beatPx;
      // lane labels and lines
      for (let s = 1; s <= 13; s++) {
        const y = laneY(s);
        el('line', { x1: GUTTER, x2: xEnd, y1: y, y2: y, class: 'lane' + (s === 5 || s === 10 ? ' lane-mark' : '') }, g);
        el('text', { x: 6, y: y + 4.5, class: 'lane-name', text: STRING_NAMES[s - 1] }, g);
        el('text', { x: GUTTER - 6, y: y + 3.5, class: 'lane-pitch', 'text-anchor': 'end', text: pitchName(arr.open[s - 1], { octave: false }) }, g);
      }
      let x = GUTTER;
      const sysInfo = { y0, y1: y0 + sysH, x0: GUTTER, beatPx, start: sys[0].start, end: sys[sys.length - 1].start + sys[sys.length - 1].beats };
      this.systems.push(sysInfo);
      for (const m of sys) {
        // bar line + number
        el('line', { x1: x, x2: x, y1: laneY(1) - 6, y2: laneY(13) + 6, class: 'barline' }, g);
        const num = el('text', { x: x + 3, y: y0 + 10, class: 'bar-num', text: String(m.index + 1) }, g);
        num.addEventListener('click', (e) => this.onBar && this.onBar(m.index, e.shiftKey));
        // beat ticks
        const unit = beatUnit(arr.timeSig);
        for (let b = unit; b < m.beats - EPS; b += unit) {
          const bx = x + b * beatPx;
          el('line', { x1: bx, x2: bx, y1: laneY(13) + 8, y2: laneY(13) + 12, class: 'beat-tick' }, g);
        }
        this.renderMeasure(g, m, x, beatPx, laneY, y0, unit);
        x += m.beats * beatPx;
      }
      el('line', { x1: x, x2: x, y1: laneY(1) - 6, y2: laneY(13) + 6, class: 'barline' + (isLast ? ' final' : '') }, g);
    });
    this.playhead = el('line', { class: 'playhead', x1: 0, x2: 0, y1: 0, y2: 0, visibility: 'hidden' }, svg);
    this.loopRect = el('rect', { class: 'loop-band', x: 0, y: 0, width: 0, height: 0, visibility: 'hidden' }, svg);
    svg.insertBefore(this.loopRect, svg.firstChild);
    void bb;
  }

  renderMeasure(g, m, x0, beatPx, laneY, y0, unit) {
    const rhythmY = laneY(13) + 16;
    const groups = new Map();
    for (const ev of m.events) {
      const x = x0 + (ev.t - m.start) * beatPx + 3;
      const w = Math.max(18, Math.min(26, beatPx * ev.d * 0.9));
      if (ev.rest) {
        el('text', { x: x + 8, y: laneY(7) + 4, class: 'rest', text: '○', 'text-anchor': 'middle' }, g);
        continue;
      }
      const grp = el('g', { class: 'note-group', 'data-idx': ev.idx, tabindex: 0, role: 'button', 'aria-label': describe(ev) }, g);
      grp.addEventListener('click', () => this.onSelect && this.onSelect(ev.idx));
      grp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onSelect && this.onSelect(ev.idx); } });
      const els = [];
      for (const n of ev.notes) {
        if (n.omitted || !n.string) {
          el('text', { x: x + 8, y: y0 + TOP - 6, class: 'omitted', text: '✕', 'text-anchor': 'middle' }, grp);
          continue;
        }
        const y = laneY(n.string);
        // sustain line
        const tail = (ev.d * beatPx) - w - 4;
        if (tail > 4) el('line', { x1: x + w, x2: x + w + tail, y1: y, y2: y, class: 'sustain' }, grp);
        const cls = 'note' + (n.press ? ' pressed' : '') + (n.shifted ? ' shifted' : '');
        const r = el('rect', { x, y: y - 7, width: w, height: 14, rx: 3, class: cls }, grp);
        els.push(r);
        el('text', { x: x + w / 2, y: y + 4.6, class: 'note-label', 'text-anchor': 'middle', text: this.options.pitches ? pitchName(n.pitch, { octave: false }) : STRING_NAMES[n.string - 1] }, grp);
        if (n.press) el('text', { x: x + w / 2, y: y - 8.5, class: 'press-mark', 'text-anchor': 'middle', text: n.press === 1 ? '△' : n.press === 2 ? '▲' : '◬' }, grp);
        const fm = FINGERS[n.finger]?.mark;
        if (fm) el('text', { x: x + w + 1, y: y - 3, class: 'finger-mark', text: fm }, grp);
        if (ev.techs.includes('kaki') || ev.techs.includes('wari')) {
          const y2 = laneY(n.string + 1);
          el('rect', { x: x + 5, y: y2 - 5, width: w - 6, height: 10, rx: 2, class: 'note ghost' }, grp);
          el('text', { x: x - 3, y: (y + y2) / 2 + 4, class: 'tech-mark', 'text-anchor': 'end', text: '≀' }, grp);
        }
      }
      const tech = ev.techs.filter((t) => t !== 'kaki' && t !== 'wari').map((t) => TECHNIQUES[t]?.tab).filter(Boolean).join('');
      const topY = y0 + TOP - 8;
      if (tech) el('text', { x: x + w / 2, y: topY, class: 'tech-top', 'text-anchor': 'middle', text: tech }, grp);
      if (this.options.syllables && ev.shoga) el('text', { x: x + 1, y: y0 + 25, class: 'syllable', text: ev.shoga }, grp);
      this.noteEls.set(ev.idx, els);
      // rhythm stems
      const sx = x + w / 2;
      const beatKey = Math.floor((ev.t - m.start) / unit + EPS);
      if (!groups.has(beatKey)) groups.set(beatKey, []);
      groups.get(beatKey).push({ x: sx, d: ev.d });
      if (ev.d >= 4 - EPS) {
        el('ellipse', { cx: sx, cy: rhythmY + 16, rx: 4, ry: 3, class: 'rh-open' }, g);
      } else {
        el('line', { x1: sx, x2: sx, y1: rhythmY, y2: rhythmY + 18, class: 'stem' }, g);
        if (ev.d >= 2 - EPS) el('ellipse', { cx: sx, cy: rhythmY + 20, rx: 3.5, ry: 2.6, class: 'rh-open' }, g);
      }
      if (isDotted(ev.d)) el('circle', { cx: sx + 5, cy: rhythmY + 16, r: 1.6, class: 'rh-dot' }, g);
    }
    // beams within each beat
    for (const items of groups.values()) {
      const beamed = items.filter((i) => i.d < 1 - EPS);
      if (!beamed.length) continue;
      const levels = (d) => (d <= 0.125 + EPS ? 3 : d <= 0.25 + EPS ? 2 : d < 1 - EPS ? 1 : 0);
      if (beamed.length === 1) {
        const it = beamed[0];
        for (let l = 0; l < levels(baseDur(it.d)); l++) el('line', { x1: it.x, x2: it.x + 6, y1: rhythmY + 18 - l * 4, y2: rhythmY + 14 - l * 4, class: 'beam flag' }, g);
        continue;
      }
      const maxL = Math.max(...beamed.map((i) => levels(baseDur(i.d))));
      for (let l = 0; l < maxL; l++) {
        for (let k = 0; k < beamed.length - 1; k++) {
          const a = beamed[k], b = beamed[k + 1];
          if (levels(baseDur(a.d)) > l && levels(baseDur(b.d)) > l) el('line', { x1: a.x, x2: b.x, y1: rhythmY + 18 - l * 4, y2: rhythmY + 18 - l * 4, class: 'beam' }, g);
          else if (l > 0 && levels(baseDur(a.d)) > l) el('line', { x1: a.x, x2: a.x + 5, y1: rhythmY + 18 - l * 4, y2: rhythmY + 18 - l * 4, class: 'beam' }, g);
          else if (l > 0 && k === beamed.length - 2 && levels(baseDur(b.d)) > l) el('line', { x1: b.x - 5, x2: b.x, y1: rhythmY + 18 - l * 4, y2: rhythmY + 18 - l * 4, class: 'beam' }, g);
        }
      }
    }
  }

  beatToXY(beat) {
    const sys = this.systems.find((s) => beat >= s.start - EPS && beat < s.end - EPS) || this.systems[this.systems.length - 1];
    if (!sys) return null;
    return { x: sys.x0 + (beat - sys.start) * sys.beatPx, y0: sys.y0 + TOP - 6, y1: sys.y0 + TOP + LANE * 13 + 4, sys };
  }

  setPlayhead(beat) {
    if (!this.playhead) return;
    if (beat == null) { this.playhead.setAttribute('visibility', 'hidden'); return; }
    const p = this.beatToXY(beat);
    if (!p) return;
    this.playhead.setAttribute('visibility', 'visible');
    this.playhead.setAttribute('x1', p.x);
    this.playhead.setAttribute('x2', p.x);
    this.playhead.setAttribute('y1', p.y0);
    this.playhead.setAttribute('y2', p.y1);
    return p.sys;
  }

  setActive(indices) {
    for (const [idx, els] of this.noteEls) {
      const on = indices.has(idx);
      for (const e of els) e.classList.toggle('on', on);
    }
  }

  setSelected(idx) {
    this.svg?.querySelectorAll('.note-group.selected').forEach((n) => n.classList.remove('selected'));
    if (idx != null) this.svg?.querySelector(`.note-group[data-idx="${idx}"]`)?.classList.add('selected');
  }

  setLoop(loop) {
    if (!this.loopRect) return;
    if (!loop) { this.loopRect.setAttribute('visibility', 'hidden'); return; }
    // highlight only within the first system that contains the loop start (simple, readable)
    const a = this.beatToXY(loop.start);
    const b = this.beatToXY(Math.max(loop.start, loop.end - 1e-3));
    if (!a || !b) return;
    if (a.sys === b.sys) {
      this.loopRect.setAttribute('x', a.x); this.loopRect.setAttribute('width', b.x - a.x + 2);
      this.loopRect.setAttribute('y', a.sys.y0); this.loopRect.setAttribute('height', a.sys.y1 - a.sys.y0 - 14);
    } else {
      this.loopRect.setAttribute('x', a.x); this.loopRect.setAttribute('width', a.sys.x0 + (a.sys.end - a.sys.start) * a.sys.beatPx - a.x);
      this.loopRect.setAttribute('y', a.sys.y0); this.loopRect.setAttribute('height', b.sys.y1 - a.sys.y0 - 14);
    }
    this.loopRect.setAttribute('visibility', 'visible');
  }
}

function isDotted(d) {
  return [3, 1.5, 0.75, 0.375].some((v) => Math.abs(v - d) < EPS);
}

function baseDur(d) {
  return isDotted(d) ? d / 1.5 : d;
}

export function describe(ev) {
  if (ev.rest) return 'Rest';
  return ev.notes.map((n) => (n.string ? `String ${STRING_NAMES[n.string - 1]}${n.press ? `, pressed +${n.press}` : ''}, ${pitchName(n.pitch)}` : 'Omitted note')).join(' and ');
}
