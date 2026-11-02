// Tab view: 13 string lanes (一 at the top, as the koto lies in front of you),
// wrapped into systems like Songsterr/Guitar Pro. Time runs left to right, or
// right to left (options.rtl) to match the direction koto scores are read in.
// RTL is drawn by laying out left to right and mirroring the whole drawing,
// then flipping each text label back so it reads normally.

import { el, clear } from './svg.js';
import { STRING_NAMES, pitchName } from '../tunings.js';
import { TECHNIQUES, FINGERS } from '../techniques.js';
import { barBeats, beatUnit } from '../notation.js';

const EPS = 1e-6;

// Layout sizes; narrow screens get a tighter layout so two bars fit per line.
const ROOMY = { lane: 15, gutter: 62, top: 46, rhythm: 40, minBeat: 46, pitchLabels: true };
const COMPACT = { lane: 13, gutter: 30, top: 40, rhythm: 32, minBeat: 30, pitchLabels: false };

export class TabView {
  constructor(container, { onSelect, onBar, onRange, onSeek, scrollBox } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onBar = onBar;
    this.onRange = onRange;
    this.onSeek = onSeek;
    this.scrollBox = scrollBox || container;
    this.selection = null;
    this.looping = false;
    this.drag = null;
    this.noteEls = new Map();
    this.systems = [];
    this.options = { pitches: false, syllables: true, rtl: false, zoom: 1 };
    this.L = ROOMY;
  }

  render(arr) {
    this.arr = arr;
    clear(this.container);
    this.noteEls.clear();
    const zoom = this.options.zoom || 1;
    const outer = Math.max(280, this.container.clientWidth || 900);
    const width = outer / zoom; // lay out in logical units, then scale the drawing
    this.L = width < 560 ? COMPACT : ROOMY;
    const bb = barBeats(arr.timeSig);
    const measures = arr.measures;
    const minBeat = this.L.minBeat;
    const usable = width - this.L.gutter - 8;
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
    const sysH = this.L.top + this.L.lane * 13 + this.L.rhythm + 18;
    const logicalH = systems.length * sysH + 10;
    const svg = el('svg', { class: 'tab-svg', width: outer, height: logicalH * zoom, viewBox: `0 0 ${width} ${logicalH}`, role: 'img', 'aria-label': 'Koto tablature' }, this.container);
    this.zoom = zoom;
    this.svg = svg;
    const root = el('g', { class: 'tab-root' }, svg);
    this.root = root;
    this.systems = [];
    const fullBeats = Math.max(...systems.map((s) => s.reduce((a, m) => a + m.beats, 0)));
    systems.forEach((sys, si) => {
      const y0 = si * sysH + 6;
      const totalBeats = sys.reduce((a, m) => a + m.beats, 0);
      const isLast = si === systems.length - 1;
      const beatPx = isLast && systems.length > 1 ? Math.min(usable / totalBeats, usable / fullBeats) : usable / totalBeats;
      const g = el('g', { class: 'system' }, root);
      this.sylRows = [-Infinity, -Infinity];
      const laneY = (s) => y0 + this.L.top + (s - 1) * this.L.lane + this.L.lane / 2;
      const xEnd = this.L.gutter + totalBeats * beatPx;
      // lane labels and lines
      for (let s = 1; s <= 13; s++) {
        const y = laneY(s);
        el('line', { x1: this.L.gutter, x2: xEnd, y1: y, y2: y, class: 'lane' + (s === 5 || s === 10 ? ' lane-mark' : '') }, g);
        const ln = el('text', { x: this.L.pitchLabels ? 6 : this.L.gutter / 2 - 2, y: y + 4.5, class: 'lane-name', 'text-anchor': this.L.pitchLabels ? 'start' : 'middle', text: STRING_NAMES[s - 1] }, g);
        ln.dataset.tip = `String ${STRING_NAMES[s - 1]} · open ${pitchName(arr.open[s - 1])}`;
        if (this.L.pitchLabels) el('text', { x: this.L.gutter - 6, y: y + 3.5, class: 'lane-pitch', 'text-anchor': 'end', text: pitchName(arr.open[s - 1], { octave: false }) }, g);
      }
      let x = this.L.gutter;
      const sysInfo = { y0, y1: y0 + sysH, x0: this.L.gutter, beatPx, start: sys[0].start, end: sys[sys.length - 1].start + sys[sys.length - 1].beats };
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
    this.playhead = el('line', { class: 'playhead', x1: 0, x2: 0, y1: 0, y2: 0, visibility: 'hidden' }, root);
    // selection band sits under the notes; its grips sit on top
    this.selLayer = el('g', { class: 'sel-layer' }, null);
    root.insertBefore(this.selLayer, root.firstChild);
    this.gripLayer = el('g', { class: 'sel-grips' }, root);
    if (this.options.rtl) this.mirror(root, width);
    this.bindPointer(svg);
    this.setSelection(this.selection, { looping: this.looping });
    void bb;
  }

  // ------------------------------------------------------------ selection

  /** Convert a pointer event to layout coordinates (handles zoom and RTL). */
  toLocal(e) {
    const m = this.root.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: pt.x, y: pt.y };
  }

  beatAtPoint(p) {
    if (!this.systems.length) return 0;
    let sys = this.systems.find((s) => p.y >= s.y0 && p.y < s.y1);
    if (!sys) sys = p.y < this.systems[0].y0 ? this.systems[0] : this.systems[this.systems.length - 1];
    const beat = sys.start + (p.x - sys.x0) / sys.beatPx;
    return Math.max(sys.start, Math.min(sys.end - 1e-3, beat));
  }

  /** The note or rest column containing a beat. */
  columnAt(beat) {
    const evs = this.arr.events;
    for (const e of evs) if (beat >= e.t - EPS && beat < e.t + e.d - EPS) return e;
    return beat < evs[0].t ? evs[0] : evs[evs.length - 1];
  }

  rangeBetween(a, b) {
    const ca = this.columnAt(Math.min(a, b));
    const cb = this.columnAt(Math.max(a, b));
    return { start: ca.t, end: cb.t + cb.d };
  }

  barRange(beat) {
    const m = this.arr.measures.find((x) => beat >= x.start - EPS && beat < x.start + x.beats - EPS) || this.arr.measures[0];
    return { start: m.start, end: m.start + m.beats };
  }

  bindPointer(svg) {
    const DRAG_PX = 5;
    const LONG_PRESS = 380;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const grip = e.target.closest('.sel-grip');
      const p = this.toLocal(e);
      if (!p) return;
      const beat = this.beatAtPoint(p);
      if (grip && this.selection) {
        // drag one edge of the existing selection
        e.preventDefault();
        const which = grip.dataset.edge;
        const anchor = which === 'start' ? this.selection.end - 1e-3 : this.selection.start;
        this.drag = { mode: 'select', anchor, pointerId: e.pointerId, moved: true, grip: true };
        svg.setPointerCapture(e.pointerId);
        svg.classList.add('selecting');
        return;
      }
      this.drag = { mode: 'pending', anchor: beat, x: e.clientX, y: e.clientY, pointerId: e.pointerId, touch: e.pointerType === 'touch', shift: e.shiftKey, moved: false };
      if (this.drag.touch) {
        // on touch, a long press starts a selection; a quick swipe still scrolls
        this.drag.timer = setTimeout(() => {
          if (!this.drag || this.drag.mode !== 'pending') return;
          this.drag.mode = 'select';
          this.drag.moved = true;
          try { svg.setPointerCapture(this.drag.pointerId); } catch { /* pointer gone */ }
          svg.classList.add('selecting');
          try { navigator.vibrate?.(12); } catch { /* unsupported */ }
          this.emitRange(this.rangeBetween(beat, beat), false);
        }, LONG_PRESS);
      }
    });
    svg.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      if (d.mode === 'pending') {
        const far = Math.hypot(e.clientX - d.x, e.clientY - d.y) > (d.touch ? 10 : DRAG_PX);
        if (!far) return;
        if (d.touch) { clearTimeout(d.timer); this.drag = null; return; } // it's a scroll
        d.mode = 'select';
        d.moved = true;
        svg.setPointerCapture(e.pointerId);
        svg.classList.add('selecting');
      }
      if (d.mode !== 'select') return;
      e.preventDefault();
      d.lastClient = { x: e.clientX, y: e.clientY };
      const p = this.toLocal(e);
      if (p) this.emitRange(this.rangeBetween(d.anchor, this.beatAtPoint(p)), false);
      this.autoScroll(e.clientY);
    });
    const end = (e) => {
      const d = this.drag;
      if (!d || e.pointerId !== d.pointerId) return;
      clearTimeout(d.timer);
      cancelAnimationFrame(this.scrollRaf);
      this.scrollRaf = null;
      svg.classList.remove('selecting');
      this.drag = null;
      if (d.mode === 'select') {
        this.suppressClick = true;
        setTimeout(() => { this.suppressClick = false; }, 0);
        if (this.selection) this.emitRange(this.selection, true);
        return;
      }
      if (e.type === 'pointercancel') return;
      // a plain click / tap
      if (e.target.closest('.bar-num')) return; // bar numbers have their own handler
      const p = this.toLocal(e);
      if (!p) return;
      const beat = this.beatAtPoint(p);
      if (d.shift && this.selection) {
        const anchor = this.selection.start;
        this.suppressClick = true;
        setTimeout(() => { this.suppressClick = false; }, 0);
        this.emitRange(this.rangeBetween(anchor, beat), true);
        return;
      }
      if (!e.target.closest('.note-group')) {
        this.emitRange(null, true);
        this.onSeek && this.onSeek(this.columnAt(beat).t);
      }
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    // stop the note's own click from firing after a drag
    svg.addEventListener('click', (e) => { if (this.suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
    // keep a long-press drag from scrolling the page on touch screens
    svg.addEventListener('touchmove', (e) => { if (this.drag && this.drag.mode === 'select') e.preventDefault(); }, { passive: false });
    svg.addEventListener('dblclick', (e) => {
      const p = this.toLocal(e);
      if (!p || e.target.closest('.bar-num')) return;
      e.preventDefault();
      this.emitRange(this.barRange(this.beatAtPoint(p)), true);
    });
    svg.addEventListener('contextmenu', (e) => { if (this.drag && this.drag.touch) e.preventDefault(); });
  }

  emitRange(sel, final) {
    this.setSelection(sel, { looping: this.looping });
    this.onRange && this.onRange(sel, { final });
  }

  /** While dragging near the top or bottom of the scroll box, scroll it. */
  autoScroll(clientY) {
    const box = this.scrollBox;
    const r = box.getBoundingClientRect();
    const zone = 36;
    const speed = clientY < r.top + zone ? -(r.top + zone - clientY) : clientY > r.bottom - zone ? clientY - (r.bottom - zone) : 0;
    if (!speed) { cancelAnimationFrame(this.scrollRaf); this.scrollRaf = null; return; }
    if (this.scrollRaf) return;
    const tick = () => {
      if (!this.drag || this.drag.mode !== 'select') { this.scrollRaf = null; return; }
      box.scrollTop += Math.max(-18, Math.min(18, speed / 2));
      const c = this.drag.lastClient;
      if (c) {
        const p = this.toLocal({ clientX: c.x, clientY: c.y });
        if (p) this.emitRange(this.rangeBetween(this.drag.anchor, this.beatAtPoint(p)), false);
      }
      this.scrollRaf = requestAnimationFrame(tick);
    };
    this.scrollRaf = requestAnimationFrame(tick);
  }

  /** Draw the selection band across every system it covers. */
  setSelection(sel, { looping = false } = {}) {
    this.selection = sel;
    this.looping = looping;
    if (!this.selLayer) return;
    clear(this.selLayer);
    clear(this.gripLayer);
    if (!sel) return;
    const L = this.L;
    const parts = this.systems.filter((s) => sel.end > s.start + EPS && sel.start < s.end - EPS);
    parts.forEach((s, i) => {
      const a = Math.max(sel.start, s.start), b = Math.min(sel.end, s.end);
      const x1 = s.x0 + (a - s.start) * s.beatPx, x2 = s.x0 + (b - s.start) * s.beatPx;
      const y1 = s.y0 + L.top - 14, y2 = s.y0 + L.top + L.lane * 13 + L.rhythm - 2;
      el('rect', { x: x1, y: y1, width: Math.max(2, x2 - x1), height: y2 - y1, rx: 4, class: 'sel-band' + (looping ? ' looping' : '') }, this.selLayer);
      if (i === 0) this.addGrip(x1, y1, 'start');
      if (i === parts.length - 1) this.addGrip(x2, y2, 'end');
    });
  }

  addGrip(x, y, edge) {
    const g = el('g', { class: 'sel-grip', 'data-edge': edge, role: 'presentation' }, this.gripLayer);
    const top = edge === 'start';
    el('line', { x1: x, x2: x, y1: top ? y : y - 30, y2: top ? y + 30 : y, class: 'sel-grip-line' }, g);
    el('circle', { cx: x, cy: y, r: 11, class: 'sel-grip-hit' }, g);
    el('circle', { cx: x, cy: y, r: 5.5, class: 'sel-grip-dot' }, g);
  }

  mirror(root, width) {
    root.setAttribute('transform', `translate(${width} 0) scale(-1 1)`);
    const swap = { start: 'end', end: 'start', middle: 'middle' };
    for (const t of root.querySelectorAll('text')) {
      const x = Number(t.getAttribute('x')) || 0;
      t.setAttribute('transform', `translate(${2 * x} 0) scale(-1 1)`);
      t.setAttribute('text-anchor', swap[t.getAttribute('text-anchor') || 'start']);
    }
  }

  renderMeasure(g, m, x0, beatPx, laneY, y0, unit) {
    const rhythmY = laneY(13) + 16;
    const groups = new Map();
    for (const ev of m.events) {
      const x = x0 + (ev.t - m.start) * beatPx + 3;
      const w = Math.max(this.L.pitchLabels ? 18 : 16, Math.min(26, beatPx * ev.d * 0.9));
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
          el('text', { x: x + 8, y: y0 + this.L.top - 6, class: 'omitted', text: '✕', 'text-anchor': 'middle' }, grp);
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
      const topY = y0 + this.L.top - 8;
      if (tech) el('text', { x: x + w / 2, y: topY, class: 'tech-top', 'text-anchor': 'middle', text: tech }, grp);
      if (this.options.syllables && ev.shoga) {
        const w2 = ev.shoga.length * 5.6 + 3;
        const row = this.sylRows[0] <= x ? 0 : this.sylRows[1] <= x ? 1 : 0;
        this.sylRows[row] = x + w2;
        el('text', { x: x + 1, y: y0 + 23 + row * 10, class: 'syllable' + (row ? ' alt' : ''), text: ev.shoga }, grp);
      }
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
    return { x: sys.x0 + (beat - sys.start) * sys.beatPx, y0: sys.y0 + this.L.top - 6, y1: sys.y0 + this.L.top + this.L.lane * 13 + 4, sys };
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

  setLoop() {}
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
