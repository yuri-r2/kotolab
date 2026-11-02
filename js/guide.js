// Step-by-step tuning walkthrough: which bridges to move, in which direction,
// what each string should match, with reference tones. Every string is
// verified with the microphone: the walkthrough listens while you tune and
// moves on by itself once the string holds within a few cents of its target.

import { STRING_NAMES, STRING_READINGS, pitchName } from './tunings.js';
import { Tuner, centsOff, freqToMidi } from './tuner.js';

const INTERVALS = ['unison', 'minor second', 'major second', 'minor third', 'major third', 'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh', 'octave'];

/**
 * Plan the strings to tune. fromOpen = current open pitches, or null to tune
 * every string from scratch. Returns steps in the order to play them.
 */
export function planTuningSteps(fromOpen, toOpen) {
  let order;
  if (!fromOpen) {
    // reference string first, then its unison and octave, then the rest
    order = [1, 5, 10, 2, 3, 4, 6, 7, 8, 9, 11, 12, 13];
  } else {
    order = toOpen.map((p, i) => (p !== fromOpen[i] ? i + 1 : 0)).filter(Boolean);
  }
  const tuned = new Set(fromOpen ? toOpen.map((_, i) => i + 1).filter((s) => !order.includes(s)) : []);
  const steps = [];
  for (const s of order) {
    const to = toOpen[s - 1];
    const from = fromOpen ? fromOpen[s - 1] : null;
    let partner = null;
    // prefer a unison or octave with a string that is already in tune
    const candidates = [...tuned].map((t) => ({ string: t, diff: to - toOpen[t - 1] }));
    const octave = candidates.filter((c) => c.diff % 12 === 0).sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff))[0];
    if (octave) partner = octave;
    else {
      const near = candidates.filter((c) => Math.abs(c.diff) <= 12 && c.diff !== 0).sort((a, b) => Math.abs(a.diff) - Math.abs(b.diff) || a.diff - b.diff)[0];
      if (near) partner = near;
    }
    steps.push({ string: s, from, to, partner });
    tuned.add(s);
  }
  return steps;
}

export function describeRelation(partner) {
  if (!partner) return '';
  const name = `${STRING_NAMES[partner.string - 1]} (${STRING_READINGS[partner.string - 1]})`;
  const d = partner.diff;
  if (d === 0) return `It should sound exactly the same as ${name}.`;
  const abs = Math.abs(d);
  const dir = d > 0 ? 'above' : 'below';
  if (abs % 12 === 0) return `It should match ${name} ${abs === 12 ? 'an octave' : abs / 12 + ' octaves'} ${dir}.`;
  return `It is a ${INTERVALS[abs]} ${dir} ${name}.`;
}

export function describeCheck(step) {
  return `Pluck ${STRING_NAMES[step.string - 1]} (${STRING_READINGS[step.string - 1]}). It should be ${pitchName(step.to)}.`;
}

/** Steps for checking every string without moving any bridge. */
export function planCheckSteps(toOpen) {
  return toOpen.map((to, i) => ({ string: i + 1, from: to, to, partner: null, check: true }));
}

export function describeMove(step) {
  const name = `${STRING_NAMES[step.string - 1]} (${STRING_READINGS[step.string - 1]})`;
  if (step.from == null) return `Tune ${name} to ${pitchName(step.to)}.`;
  const d = step.to - step.from;
  const amount = Math.abs(d) === 1 ? 'a little (a half step)' : Math.abs(d) === 2 ? 'about twice as far as for a half step (a whole step)' : `${Math.abs(d)} half steps`;
  return d > 0
    ? `Slide the bridge of ${name} toward you, the end where you sit, ${amount}: from ${pitchName(step.from)} up to ${pitchName(step.to)}.`
    : `Slide the bridge of ${name} away from you, toward the far end, ${amount}: from ${pitchName(step.from)} down to ${pitchName(step.to)}.`;
}

export const TOLERANCE_CENTS = 5;
const HOLD_READINGS = 8; // ~0.4 s of steady, in-tune readings
const MUTE_AFTER_STEP = 700; // ms: ignore the previous string still ringing

export class TuningGuide {
  constructor({ els, audio, kotoView, presets, bases, onTuned }) {
    this.els = els;
    this.audio = audio;
    this.koto = kotoView;
    this.presets = presets;
    this.bases = bases;
    this.onTuned = onTuned;
    this.tuner = new Tuner(audio);
    this.steps = [];
    this.index = -1;
    this.inTune = [];
    this.ignoreUntil = 0;
    this.micFailed = false;
    els.start.addEventListener('click', () => this.begin('tune'));
    els.check.addEventListener('click', () => this.begin('check'));
    els.back.addEventListener('click', () => this.go(this.index - 1));
    els.next.addEventListener('click', () => this.next());
    els.playTarget.addEventListener('click', () => this.playTarget());
    els.playCompare.addEventListener('click', () => this.playCompare());
    els.mic.addEventListener('click', () => this.toggleMic());
    els.again.addEventListener('click', () => this.begin('check'));
    els.micRetry.addEventListener('click', () => this.startMic());
    els.fromTuning.addEventListener('change', () => this.preview());
    els.fromBase.addEventListener('change', () => this.preview());
  }

  /** target: { open, label, base }; current: saved koto tuning or null */
  setTarget(target, current) {
    this.target = target;
    this.current = current;
    const sel = this.els.fromTuning;
    sel.innerHTML = '';
    const add = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); };
    if (current) add('saved', `As I last tuned it: ${current.label}`);
    for (const t of this.presets) add(t.id, t.user ? `${t.name} (my tuning)` : `${t.name} ${t.jp}`);
    add('scratch', 'Not tuned yet (new strings or unsure)');
    sel.value = current ? 'saved' : 'hira';
    if (!this.els.fromBase.options.length) {
      for (const b of this.bases) { const o = document.createElement('option'); o.value = b.offset; o.textContent = b.name; this.els.fromBase.appendChild(o); }
    }
    this.els.fromBase.value = String(target.base ?? 0);
    this.els.target.textContent = target.label;
    this.stopMic();
    this.showStart();
  }

  fromOpen() {
    const v = this.els.fromTuning.value;
    const t = this.presets.find((p) => p.id === v);
    this.els.fromBase.disabled = v === 'saved' || v === 'scratch' || !!t?.user;
    if (v === 'scratch') return null;
    if (v === 'saved') return this.current.open;
    return t.strings.map((p) => p + (t.user ? t.base : Number(this.els.fromBase.value)));
  }

  preview() {
    const from = this.fromOpen();
    const steps = planTuningSteps(from, this.target.open);
    this.koto.setTuning(this.target.open, { changed: steps.map((s) => s.string) });
    this.koto.setGhost(from);
    this.koto.focus(null);
    const n = steps.length;
    this.els.start.textContent = n ? (from ? `Walk me through it (${n} string${n > 1 ? 's' : ''})` : 'Tune all 13 strings') : 'Nothing to move';
    this.els.start.disabled = n === 0;
    this.els.intro.textContent = n === 0
      ? `Your koto should already be in ${this.target.label}. Check it with the microphone to be sure.`
      : from
        ? `${n} bridge${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} to move. Dashed outlines show where the bridges are now; the arrow shows where each one goes. The microphone listens as you tune and confirms each string.`
        : 'String 一 is tuned to a reference pitch first, then every other string against strings already in tune. The microphone confirms each one.';
  }

  showStart() {
    this.index = -1;
    this.els.step.hidden = true;
    this.els.finish.hidden = true;
    this.els.startBox.hidden = false;
    this.els.chips.hidden = true;
    this.preview();
  }

  async begin(mode) {
    this.mode = mode;
    this.steps = (mode === 'check' ? planCheckSteps(this.target.open) : planTuningSteps(this.fromOpen(), this.target.open))
      .map((s) => ({ ...s, status: 'pending', cents: null }));
    if (!this.steps.length) return;
    if (mode === 'check') { this.koto.setTuning(this.target.open, { changed: [] }); }
    this.els.startBox.hidden = true;
    this.els.finish.hidden = true;
    this.renderChips();
    this.go(0);
    this.els.chips.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    await this.startMic();
  }

  renderChips() {
    const box = this.els.chips;
    box.hidden = false;
    box.innerHTML = '';
    this.steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = `chip-step ${s.status}${i === this.index ? ' current' : ''}`;
      b.textContent = STRING_NAMES[s.string - 1];
      const st = s.status === 'verified' ? `in tune (${fmtCents(s.cents)})` : s.status === 'ear' ? 'checked by ear' : s.status === 'skipped' ? 'skipped' : 'not checked yet';
      b.setAttribute('aria-label', `String ${STRING_NAMES[s.string - 1]}: ${st}`);
      b.title = st;
      b.addEventListener('click', () => this.go(i));
      box.appendChild(b);
    });
  }

  go(i) {
    clearTimeout(this.advanceTimer);
    if (i < 0) { this.stopMic(); this.showStart(); return; }
    if (i >= this.steps.length) { this.finish(); return; }
    this.index = i;
    this.inTune = [];
    this.ignoreUntil = performance.now() + MUTE_AFTER_STEP;
    const step = this.steps[i];
    const e = this.els;
    e.step.hidden = false;
    e.finish.hidden = true;
    e.progress.textContent = `${this.mode === 'check' ? 'Checking' : 'Tuning'} string ${i + 1} of ${this.steps.length}`;
    e.kanji.textContent = STRING_NAMES[step.string - 1];
    e.what.textContent = step.check ? describeCheck(step) : describeMove(step);
    let hint = describeRelation(step.partner);
    if (step.string === 1 && step.from == null) hint = 'String 一 is the reference for every other string, so take your time with it.';
    if (step.check) hint = 'If the microphone says it is off, slide the bridge as it suggests.';
    e.hint.textContent = hint;
    e.playTarget.textContent = `Play ${pitchName(step.to)}`;
    e.playCompare.hidden = !step.partner;
    if (step.partner) e.playCompare.textContent = `Play with ${STRING_NAMES[step.partner.string - 1]}`;
    e.step.classList.toggle('in-tune', step.status === 'verified');
    this.updateNextButton();
    e.readout.textContent = step.status === 'verified'
      ? `Verified: in tune (${fmtCents(step.cents)}).`
      : this.tuner.running ? `Listening… pluck ${STRING_NAMES[step.string - 1]}.` : this.micMessage();
    this.setNeedle(step.status === 'verified' ? step.cents : null);
    this.renderChips();
    this.koto.focus(step.string);
    if (step.check) this.koto.setGhost(null);
    else this.koto.setGhost(step.from == null ? null : this.steps.slice(i).reduce((open, s) => { open[s.string - 1] = s.from; return open; }, this.target.open.slice()), step.string);
  }

  micMessage() {
    return this.micFailed
      ? 'The microphone is off, so tune by ear against the reference tone and press “Tuned by ear” when it matches.'
      : 'Turn on the microphone so KotoLab can check this string.';
  }

  updateNextButton() {
    const step = this.steps[this.index];
    const last = this.index === this.steps.length - 1;
    const e = this.els;
    if (step.status === 'verified') e.next.textContent = last ? 'Finish' : 'Next string';
    else if (this.micFailed || !this.tuner.running) e.next.textContent = last ? 'Tuned by ear, finish' : 'Tuned by ear, next';
    else e.next.textContent = last ? 'Skip and finish' : 'Skip this string';
    e.next.classList.toggle('primary', step.status === 'verified');
  }

  next() {
    const step = this.steps[this.index];
    if (step && step.status !== 'verified') step.status = this.tuner.running ? 'skipped' : 'ear';
    this.go(this.index + 1);
  }

  finish() {
    clearTimeout(this.advanceTimer);
    this.stopMic();
    this.index = -1;
    this.renderChips();
    const verified = this.steps.filter((s) => s.status === 'verified');
    const others = this.steps.filter((s) => s.status !== 'verified');
    const e = this.els;
    e.step.hidden = true;
    e.finish.hidden = false;
    e.finish.classList.toggle('partial', others.length > 0);
    if (!others.length) {
      e.finishText.textContent = `All ${this.steps.length} string${this.steps.length > 1 ? 's' : ''} verified with the microphone. Your koto is in ${this.target.label}.`;
    } else {
      const list = (arr) => arr.map((s) => STRING_NAMES[s.string - 1]).join(' ');
      e.finishText.textContent = `${verified.length} of ${this.steps.length} strings verified. Not verified: ${list(others)}. Check them again before you play.`;
    }
    this.koto.focus(null);
    this.koto.setGhost(null);
    this.onTuned && this.onTuned(this.target, { verified: !others.length });
  }

  muteFor(seconds) {
    this.ignoreUntil = Math.max(this.ignoreUntil, performance.now() + seconds * 1000);
    this.inTune = [];
  }

  playTarget() {
    const step = this.steps[this.index];
    if (!step) return;
    const ctx = this.audio.ensure();
    // don't let the speaker's reference tone count as the string being in tune
    this.muteFor(2.9);
    this.audio.prepare([step.to]).then(() => {
      for (let k = 0; k < 2; k++) this.audio.pluck({ midi: step.to, when: ctx.currentTime + 0.05 + k * 1.1, dur: 1, string: 99, damp: true });
    });
  }

  playCompare() {
    const step = this.steps[this.index];
    if (!step?.partner) return;
    const other = this.target.open[step.partner.string - 1];
    const ctx = this.audio.ensure();
    this.muteFor(3.6);
    this.audio.prepare([step.to, other]).then(() => {
      this.audio.pluck({ midi: other, when: ctx.currentTime + 0.05, dur: 0.7, string: 98, damp: true });
      this.audio.pluck({ midi: step.to, when: ctx.currentTime + 0.8, dur: 0.7, string: 99, damp: true });
      this.audio.pluck({ midi: other, when: ctx.currentTime + 1.6, dur: 1.2, string: 98, damp: true });
      this.audio.pluck({ midi: step.to, when: ctx.currentTime + 1.6, dur: 1.2, string: 97, damp: true });
    });
  }

  async startMic() {
    if (this.tuner.running) return true;
    try {
      await this.tuner.start((f, level) => this.onPitch(f, level));
      this.micFailed = false;
      this.els.micAlert.hidden = true;
      this.els.mic.textContent = 'Microphone on';
      this.els.mic.setAttribute('aria-pressed', 'true');
      const step = this.steps[this.index];
      if (step && step.status !== 'verified') this.els.readout.textContent = `Listening… pluck ${STRING_NAMES[step.string - 1]}.`;
      if (this.index >= 0) this.updateNextButton();
      return true;
    } catch (err) {
      this.micFailed = true;
      this.els.mic.textContent = 'Use microphone';
      this.els.mic.setAttribute('aria-pressed', 'false');
      this.els.micAlert.hidden = false;
      this.els.micAlertText.textContent = micErrorMessage(err);
      this.els.readout.textContent = 'Without the microphone, tune by ear against “Play” and press “Tuned by ear”.';
      if (this.index >= 0) this.updateNextButton();
      return false;
    }
  }

  toggleMic() {
    if (this.tuner.running) {
      this.stopMic();
      if (this.index >= 0) { this.els.readout.textContent = this.micMessage(); this.updateNextButton(); }
    } else this.startMic();
  }

  stopMic() {
    this.tuner.stop();
    this.els.mic.textContent = 'Use microphone';
    this.els.mic.setAttribute('aria-pressed', 'false');
    this.setNeedle(null);
    this.setLevel(0);
  }

  setNeedle(cents) {
    const n = this.els.needle;
    if (cents == null) { n.style.opacity = '0.25'; n.style.left = '50%'; return; }
    const c = Math.max(-50, Math.min(50, cents));
    n.style.opacity = '1';
    n.style.left = `${50 + c}%`;
  }

  setLevel(level) {
    if (this.els.level) this.els.level.style.width = `${Math.round(level * 100)}%`;
  }

  onPitch(freq, level = 0) {
    this.setLevel(level);
    const step = this.steps[this.index];
    if (!step || this.els.step.hidden || step.status === 'verified') return;
    if (performance.now() < this.ignoreUntil) return;
    if (!freq) { this.inTune = []; return; }
    const a4 = this.audio.a4;
    const cents = foldOctave(centsOff(freq, step.to, a4));
    const r = Math.round(cents);
    if (Math.abs(cents) > 80) {
      this.inTune = [];
      this.setNeedle(null);
      const heard = Math.round(freqToMidi(freq, a4));
      const others = this.target.open.map((p, i) => i).filter((i) => i + 1 !== step.string && Math.abs(centsOff(freq, this.target.open[i], a4)) < 35);
      this.els.readout.textContent = others.length && Math.abs(cents) > 150
        ? `That sounds like ${others.map((i) => STRING_NAMES[i]).join(' or ')} (${pitchName(this.target.open[others[0]])}). Pluck ${STRING_NAMES[step.string - 1]}.`
        : `Hearing ${pitchName(heard)}, ${Math.abs(r) > 1200 ? 'far' : Math.abs(r) + ' cents'} ${cents < 0 ? 'low: slide the bridge toward you' : 'high: slide the bridge away from you'}.`;
      return;
    }
    this.setNeedle(cents);
    if (Math.abs(cents) <= TOLERANCE_CENTS) {
      this.inTune.push(cents);
      this.els.readout.textContent = `In tune (${fmtCents(cents)}). Hold it…`;
      if (this.inTune.length >= HOLD_READINGS) this.verify();
    } else {
      this.inTune = [];
      this.els.readout.textContent = cents < 0
        ? `${-r} cents low: slide the bridge toward you.`
        : `${r} cents high: slide the bridge away from you.`;
    }
  }

  verify() {
    const step = this.steps[this.index];
    step.status = 'verified';
    step.cents = this.inTune.reduce((a, b) => a + b, 0) / this.inTune.length;
    this.inTune = [];
    this.els.step.classList.add('in-tune');
    this.els.readout.textContent = `Verified: ${STRING_NAMES[step.string - 1]} is in tune (${fmtCents(step.cents)}).`;
    this.setNeedle(step.cents);
    this.renderChips();
    this.updateNextButton();
    const at = this.index;
    this.advanceTimer = setTimeout(() => { if (this.index === at) this.go(at + 1); }, 1100);
  }
}

function micErrorMessage(err) {
  const name = err?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked, so KotoLab can’t hear your koto. Click the lock or site-settings icon next to the address bar, allow the microphone for this site, then press “Try the microphone again”. Some in-app browsers never allow the microphone: if nothing changes, open this page in Chrome, Safari, Edge or Firefox.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Connect one (or enable your computer’s built-in microphone), then press “Try the microphone again”.';
  }
  if (name === 'NotReadableError') {
    return 'The microphone is in use by another app. Close that app, then press “Try the microphone again”.';
  }
  return `The microphone couldn’t start (${err?.message || 'unknown error'}). Press “Try the microphone again”, or tune by ear.`;
}

/** Compare in the nearest octave so a strong harmonic doesn't read as far off. */
function foldOctave(cents) {
  const oct = Math.round(cents / 1200);
  if (oct !== 0 && Math.abs(cents - oct * 1200) < 60) return cents - oct * 1200;
  return cents;
}

function fmtCents(c) {
  const r = Math.round(c);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)} cents`;
}
