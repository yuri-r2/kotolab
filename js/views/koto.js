// The instrument seen from above: 13 strings, one movable bridge each.
// The player sits at the right (head) end; string 一 is farthest away (top).
// Bridge positions follow the string's pitch (higher → shorter vibrating
// length → bridge nearer the player). The scale is compressed so the diagram
// reads clearly; real bridges sit in a similar diagonal.

import { el, clear } from './svg.js';
import { STRING_NAMES, pitchName } from '../tunings.js';

const W = 1000;
const H = 272;
const HEAD = 900; // fixed bridge at the player's end
const TAIL = 64;
const Y0 = 44;
const DY = 15;

export function bridgeX(pitch) {
  // below G3 the real spacing would run off the instrument, so very low
  // custom pitches step down evenly toward the tail instead
  if (pitch < 55) return bridgeX(55) - (55 - pitch) * 5.5;
  const frac = Math.pow(2, (-(pitch - 52) / 12) * 0.62);
  return Math.min(HEAD - 30, HEAD - (HEAD - TAIL - 50) * frac);
}

let instances = 0;

export class KotoView {
  constructor(container, { onPluck } = {}) {
    this.container = container;
    this.onPluck = onPluck;
    this.uid = `k${instances++}`;
    this.build();
  }

  build() {
    clear(this.container);
    const svg = el('svg', { class: 'koto-svg', viewBox: `0 0 ${W} ${H}`, role: 'group', 'aria-label': 'Koto strings and bridges. Click a string to hear it; Shift-click for a half-step press, Alt-click for a whole step.' }, this.container);
    const defs = el('defs', {}, svg);
    const grad = el('linearGradient', { id: `${this.uid}-kiri`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    el('stop', { offset: '0', 'stop-color': '#d9b98c' }, grad);
    el('stop', { offset: '0.5', 'stop-color': '#c79e6b' }, grad);
    el('stop', { offset: '1', 'stop-color': '#a97f4e' }, grad);
    const grain = el('pattern', { id: `${this.uid}-grain`, width: 180, height: 22, patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M0 6 C 40 2, 80 10, 120 5 S 170 8, 180 6 M0 15 C 50 12, 90 19, 140 14 S 175 16, 180 15', class: 'grain' }, grain);
    // body
    el('path', { d: `M ${TAIL - 34} 24 L ${W - 26} 18 Q ${W - 6} 20 ${W - 8} 40 L ${W - 8} ${H - 34} Q ${W - 8} ${H - 16} ${W - 28} ${H - 16} L ${TAIL - 34} ${H - 22} Q ${TAIL - 46} ${H - 24} ${TAIL - 46} ${H - 40} L ${TAIL - 46} 40 Q ${TAIL - 46} 24 ${TAIL - 34} 24 Z`, class: 'koto-body', fill: `url(#${this.uid}-kiri)` }, svg);
    el('path', { d: `M ${TAIL - 34} 24 L ${W - 26} 18 Q ${W - 6} 20 ${W - 8} 40 L ${W - 8} ${H - 34} Q ${W - 8} ${H - 16} ${W - 28} ${H - 16} L ${TAIL - 34} ${H - 22} Q ${TAIL - 46} ${H - 24} ${TAIL - 46} ${H - 40} L ${TAIL - 46} 40 Q ${TAIL - 46} 24 ${TAIL - 34} 24 Z`, fill: `url(#${this.uid}-grain)`, opacity: 0.35 }, svg);
    // head (ryūkaku) and tail (kashiwaba) bridges
    el('rect', { x: HEAD - 3, y: Y0 - 12, width: 8, height: DY * 12 + 24, rx: 2, class: 'fixed-bridge' }, svg);
    el('rect', { x: TAIL - 6, y: Y0 - 12, width: 8, height: DY * 12 + 24, rx: 2, class: 'fixed-bridge' }, svg);
    el('text', { x: HEAD + 50, y: H - 4, class: 'koto-caption', 'text-anchor': 'middle', text: 'you sit here ↓' }, svg);
    el('text', { x: HEAD - 46, y: 14, class: 'koto-caption', 'text-anchor': 'middle', text: 'right hand' }, svg);
    el('text', { x: 300, y: 14, class: 'koto-caption', 'text-anchor': 'middle', text: 'left hand presses here, left of the bridges' }, svg);
    this.strings = [];
    for (let i = 0; i < 13; i++) {
      const y = Y0 + i * DY;
      const g = el('g', { class: 'kstring', 'data-s': i + 1 }, svg);
      const line = el('line', { x1: TAIL, x2: HEAD, y1: y, y2: y, class: 'kstring-line' }, g);
      const glow = el('line', { x1: TAIL, x2: HEAD, y1: y, y2: y, class: 'kstring-glow' }, g);
      const ghost = el('g', { class: 'kghost', visibility: 'hidden' }, g);
      el('path', { d: `M -7 ${y + 5} L -2 ${y - 3} L 2 ${y - 3} L 7 ${y + 5} Z`, class: 'kghost-shape' }, ghost);
      const arrow = el('line', { x1: 0, x2: 0, y1: y + 9, y2: y + 9, class: 'kmove-arrow', visibility: 'hidden' }, g);
      const bridge = el('g', { class: 'kbridge' }, g);
      el('path', { d: `M -7 ${y + 5} L -2 ${y - 3} L 2 ${y - 3} L 7 ${y + 5} Z`, class: 'kbridge-shape' }, bridge);
      const plabel = el('text', { x: 0, y: y - 4, class: 'kbridge-pitch', 'text-anchor': 'middle', text: '' }, bridge);
      const hand = el('g', { class: 'khand', visibility: 'hidden' }, g);
      const handC = el('circle', { cx: 0, cy: y, r: 6, class: 'khand-dot' }, hand);
      const handT = el('text', { x: 0, y: y + 3.4, class: 'khand-mark', 'text-anchor': 'middle', text: '' }, hand);
      const pick = el('g', { class: 'kpick', visibility: 'hidden' }, g);
      el('circle', { cx: HEAD - 46, cy: y, r: 6.5, class: 'kpick-dot' }, pick);
      const pickT = el('text', { x: HEAD - 46, y: y + 3.4, class: 'kpick-mark', 'text-anchor': 'middle', text: '' }, pick);
      el('text', { x: HEAD + 26, y: y + 4.5, class: 'kname', 'text-anchor': 'middle', text: STRING_NAMES[i] }, g);
      const hit = el('rect', { x: TAIL, y: y - DY / 2, width: HEAD - TAIL + 50, height: DY, class: 'khit', tabindex: 0, role: 'button', 'aria-label': `String ${STRING_NAMES[i]}` }, g);
      hit.addEventListener('pointerdown', (e) => {
        const press = e.altKey ? 2 : e.shiftKey ? 1 : 0;
        this.onPluck && this.onPluck(i + 1, press);
      });
      hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onPluck && this.onPluck(i + 1, 0); } });
      this.strings.push({ g, line, glow, ghost, arrow, bridge, plabel, hand, handC, handT, pick, pickT, y, x: 0 });
    }
    this.svg = svg;
  }

  setTuning(open, { showPitches = true, changed = [] } = {}) {
    this.open = open;
    open.forEach((p, i) => {
      const s = this.strings[i];
      s.x = bridgeX(p);
      s.bridge.style.transform = `translateX(${s.x}px)`;
      s.plabel.textContent = showPitches ? pitchName(p, { octave: false }) : '';
      s.bridge.classList.toggle('moved', changed.includes(i + 1));
    });
  }

  /** Show where bridges were before retuning (null hides the ghosts). */
  setGhost(fromOpen, focus = null) {
    this.strings.forEach((s, i) => {
      const from = fromOpen ? fromOpen[i] : null;
      const moving = from != null && from !== this.open?.[i];
      s.ghost.setAttribute('visibility', moving ? 'visible' : 'hidden');
      s.arrow.setAttribute('visibility', moving && (focus == null || focus === i + 1) ? 'visible' : 'hidden');
      if (moving) {
        const fx = bridgeX(from);
        s.ghost.style.transform = `translateX(${fx}px)`;
        s.arrow.setAttribute('x1', fx);
        s.arrow.setAttribute('x2', s.x + (s.x > fx ? -8 : 8));
      }
    });
  }

  /** Emphasise one string (1–13) and dim the rest; null clears. */
  focus(string) {
    this.strings.forEach((s, i) => {
      s.g.classList.toggle('focused', string === i + 1);
      s.g.classList.toggle('dimmed', string != null && string !== i + 1);
    });
  }

  /** Show what is being played: notes = [{string, press, finger}] */
  show(notes, { flash = true } = {}) {
    const by = new Map(notes.filter((n) => n.string).map((n) => [n.string, n]));
    this.strings.forEach((s, i) => {
      const n = by.get(i + 1);
      s.line.classList.toggle('playing', !!n);
      if (n && flash) {
        s.glow.classList.remove('flash');
        void s.glow.getBBox();
        s.glow.classList.add('flash');
      }
      if (n && n.press) {
        s.hand.setAttribute('visibility', 'visible');
        s.handC.setAttribute('cx', s.x - 40);
        s.handT.setAttribute('x', s.x - 40);
        s.handT.textContent = n.press === 1 ? 'ヲ' : n.press === 2 ? 'オ' : '³';
      } else s.hand.setAttribute('visibility', 'hidden');
      if (n) {
        s.pick.setAttribute('visibility', 'visible');
        s.pickT.textContent = n.finger === 'L' ? '左' : n.finger === 2 ? '2' : n.finger === 3 ? '3' : '1';
      } else s.pick.setAttribute('visibility', 'hidden');
    });
  }

  clearShow() {
    this.show([], { flash: false });
  }
}
