// Tuner gauge in the spirit of clip-on and phone tuners: a needle that swings
// smoothly over a ±50 cent arc, a big note readout that turns green when in
// tune, a ring that fills while you hold the pitch, and a confirmation pop.

import { el, clear } from './svg.js';

const CX = 160, CY = 150, R = 118;
const SPAN = 62; // degrees either side of centre for ±50 cents

const angleFor = (cents) => (Math.max(-50, Math.min(50, cents)) / 50) * SPAN;
const polar = (deg, r) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const arc = (from, to, r) => {
  const [x1, y1] = polar(from, r);
  const [x2, y2] = polar(to, r);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

export class TunerGauge {
  constructor(container, { tolerance = 5 } = {}) {
    this.container = container;
    this.tolerance = tolerance;
    this.angle = 0;
    this.velocity = 0;
    this.targetAngle = 0;
    this.active = false;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.build();
  }

  build() {
    clear(this.container);
    const svg = el('svg', { class: 'gauge-svg', viewBox: '0 0 320 214', role: 'img', 'aria-label': 'Tuning meter' }, this.container);
    // zones: red edges, amber, green centre
    const tol = angleFor(this.tolerance);
    const amber = angleFor(20);
    el('path', { d: arc(-SPAN, -amber, R), class: 'g-zone g-far' }, svg);
    el('path', { d: arc(-amber, -tol, R), class: 'g-zone g-near' }, svg);
    el('path', { d: arc(-tol, tol, R), class: 'g-zone g-in' }, svg);
    el('path', { d: arc(tol, amber, R), class: 'g-zone g-near' }, svg);
    el('path', { d: arc(amber, SPAN, R), class: 'g-zone g-far' }, svg);
    for (let c = -50; c <= 50; c += 5) {
      const a = angleFor(c);
      const major = c % 25 === 0;
      const [x1, y1] = polar(a, R - 14);
      const [x2, y2] = polar(a, R - (major ? 30 : c % 10 === 0 ? 24 : 19));
      el('line', { x1, y1, x2, y2, class: 'g-tick' + (major ? ' major' : '') }, svg);
    }
    const lab = (c, t) => { const [x, y] = polar(angleFor(c), R + 14); el('text', { x, y: y + 4, class: 'g-scale', 'text-anchor': 'middle', text: t }, svg); };
    lab(-50, '−50'); lab(-25, '−25'); lab(0, '0'); lab(25, '+25'); lab(50, '+50');
    el('text', { x: CX - R + 6, y: CY + 30, class: 'g-side', 'text-anchor': 'start', text: '♭ low' }, svg);
    el('text', { x: CX + R - 6, y: CY + 30, class: 'g-side', 'text-anchor': 'end', text: 'high ♯' }, svg);
    // needle
    this.needle = el('g', { class: 'g-needle' }, svg);
    el('line', { x1: CX, y1: CY, x2: CX, y2: CY - R + 8, class: 'g-needle-line' }, this.needle);
    el('circle', { cx: CX, cy: CY - R + 8, r: 4, class: 'g-needle-tip' }, this.needle);
    // hub with hold ring and note
    this.ringBg = el('circle', { cx: CX, cy: CY, r: 40, class: 'g-ring-bg' }, svg);
    this.ring = el('circle', { cx: CX, cy: CY, r: 40, class: 'g-ring', transform: `rotate(-90 ${CX} ${CY})` }, svg);
    this.ringLen = 2 * Math.PI * 40;
    this.ring.setAttribute('stroke-dasharray', `${this.ringLen}`);
    this.ring.setAttribute('stroke-dashoffset', `${this.ringLen}`);
    this.hub = el('circle', { cx: CX, cy: CY, r: 34, class: 'g-hub' }, svg);
    this.note = el('text', { x: CX, y: CY + 2, class: 'g-note', 'text-anchor': 'middle', text: '' }, svg);
    this.cents = el('text', { x: CX, y: CY + 20, class: 'g-cents', 'text-anchor': 'middle', text: '' }, svg);
    this.check = el('path', { d: `M ${CX - 15} ${CY + 1} l 10 10 l 20 -22`, class: 'g-check' }, svg);
    this.svg = svg;
    this.cue = document.createElement('p');
    this.cue.className = 'g-cue';
    this.container.appendChild(this.cue);
    this.setState('idle');
  }

  setState(state) {
    this.svg.dataset.state = state;
    this.container.dataset.state = state;
  }

  /** Target note shown when nothing is heard. */
  setTarget(label, cue = '') {
    this.targetLabel = label;
    this.reset(cue);
  }

  reset(cue = '') {
    this.active = false;
    this.targetAngle = 0;
    this.note.textContent = this.targetLabel || '';
    this.cents.textContent = 'target';
    this.cue.textContent = cue;
    this.setHold(0);
    this.setState('idle');
    this.kick();
  }

  /**
   * reading: { cents, heard, cue } or null for silence.
   * cents is relative to the target (already folded to the right octave).
   */
  update(reading) {
    if (!reading) {
      if (this.active) {
        this.active = false;
        this.setState('idle');
        this.note.textContent = this.targetLabel || '';
        this.cents.textContent = 'target';
      }
      this.targetAngle = 0;
      this.kick();
      return;
    }
    this.active = true;
    const { cents, heard, cue, wrong } = reading;
    const abs = Math.abs(cents);
    this.targetAngle = wrong ? (cents < 0 ? -SPAN - 6 : SPAN + 6) : angleFor(cents);
    this.note.textContent = heard;
    const rc = Math.round(cents);
    this.cents.textContent = wrong ? 'other string' : `${rc > 0 ? '+' : rc < 0 ? '−' : '±'}${Math.abs(rc)}¢`;
    this.cue.textContent = cue || '';
    this.setState(wrong ? 'far' : abs <= this.tolerance ? 'in' : abs <= 20 ? 'near' : 'far');
    this.kick();
  }

  setHold(fraction) {
    const f = Math.max(0, Math.min(1, fraction));
    this.ring.setAttribute('stroke-dashoffset', `${this.ringLen * (1 - f)}`);
  }

  /** In tune and held: pop the check mark. */
  celebrate(text = 'In tune') {
    this.setHold(1);
    this.targetAngle = 0;
    this.cents.textContent = '';
    this.cue.textContent = text;
    this.setState('done');
    this.kick();
  }

  // needle physics: a lightly damped spring, like an analogue meter
  kick() {
    if (this.raf) return;
    const step = () => {
      if (this.reduced) {
        this.angle = this.targetAngle;
        this.velocity = 0;
      } else {
        this.velocity += (this.targetAngle - this.angle) * 0.18;
        this.velocity *= 0.62;
        this.angle += this.velocity;
      }
      this.needle.setAttribute('transform', `rotate(${this.angle.toFixed(2)} ${CX} ${CY})`);
      if (Math.abs(this.targetAngle - this.angle) > 0.05 || Math.abs(this.velocity) > 0.05) this.raf = requestAnimationFrame(step);
      else this.raf = null;
    };
    this.raf = requestAnimationFrame(step);
  }
}
