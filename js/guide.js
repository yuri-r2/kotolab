// Step-by-step tuning walkthrough: which bridges to move, in which direction,
// what each string should match, with reference tones and a microphone tuner.

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

export function describeMove(step) {
  const name = `${STRING_NAMES[step.string - 1]} (${STRING_READINGS[step.string - 1]})`;
  if (step.from == null) return `Tune ${name} to ${pitchName(step.to)}.`;
  const d = step.to - step.from;
  const amount = Math.abs(d) === 1 ? 'a little (a half step)' : Math.abs(d) === 2 ? 'about twice as far as for a half step (a whole step)' : `${Math.abs(d)} half steps`;
  return d > 0
    ? `Slide the bridge of ${name} toward you, the end where you sit, ${amount}: from ${pitchName(step.from)} up to ${pitchName(step.to)}.`
    : `Slide the bridge of ${name} away from you, toward the far end, ${amount}: from ${pitchName(step.from)} down to ${pitchName(step.to)}.`;
}

export class TuningGuide {
  /**
   * els: { root, intro, fromTuning, fromBase, target, start, done, step, kanji, progress, what, hint,
   *        playTarget, playCompare, mic, needle, readout, back, next, finish, finishText }
   */
  constructor({ els, audio, kotoView, presets, bases, onFinish, onTuned }) {
    this.els = els;
    this.audio = audio;
    this.koto = kotoView;
    this.presets = presets;
    this.bases = bases;
    this.onFinish = onFinish;
    this.onTuned = onTuned;
    this.tuner = new Tuner(audio);
    this.steps = [];
    this.index = -1;
    this.inTuneCount = 0;
    els.start.addEventListener('click', () => this.begin());
    els.back.addEventListener('click', () => this.go(this.index - 1));
    els.next.addEventListener('click', () => this.go(this.index + 1));
    els.playTarget.addEventListener('click', () => this.playTarget());
    els.playCompare.addEventListener('click', () => this.playCompare());
    els.mic.addEventListener('click', () => this.toggleMic());
    els.fromTuning.addEventListener('change', () => this.preview());
    els.fromBase.addEventListener('change', () => this.preview());
  }

  /** target: { open, label }; current: saved koto tuning or null */
  setTarget(target, current) {
    this.target = target;
    this.current = current;
    const sel = this.els.fromTuning;
    sel.innerHTML = '';
    const add = (value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; sel.appendChild(o); };
    if (current) add('saved', `As I last tuned it: ${current.label}`);
    for (const t of this.presets) add(t.id, `${t.name} ${t.jp}`);
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
    this.els.fromBase.disabled = v === 'saved' || v === 'scratch';
    if (v === 'scratch') return null;
    if (v === 'saved') return this.current.open;
    const t = this.presets.find((p) => p.id === v);
    return t.strings.map((p) => p + Number(this.els.fromBase.value));
  }

  preview() {
    const from = this.fromOpen();
    const steps = planTuningSteps(from, this.target.open);
    this.koto.setTuning(this.target.open, { changed: steps.map((s) => s.string) });
    this.koto.setGhost(from);
    this.koto.focus(null);
    const n = steps.length;
    this.els.start.textContent = n ? (from ? `Walk me through it (${n} string${n > 1 ? 's' : ''})` : 'Tune all 13 strings') : 'Nothing to change';
    this.els.start.disabled = n === 0;
    this.els.intro.textContent = n === 0
      ? `Your koto is already in ${this.target.label}.`
      : from
        ? `${n} bridge${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} to move. Dashed outlines show where the bridges are now; the arrow shows where each one goes.`
        : 'We will tune string 一 to a reference pitch first, then tune every other string against strings that are already in tune.';
  }

  showStart() {
    this.index = -1;
    this.els.step.hidden = true;
    this.els.finish.hidden = true;
    this.els.startBox.hidden = false;
    this.preview();
  }

  begin() {
    this.steps = planTuningSteps(this.fromOpen(), this.target.open);
    this.els.startBox.hidden = true;
    this.go(0);
  }

  go(i) {
    if (i < 0) { this.stopMic(); this.showStart(); return; }
    if (i >= this.steps.length) { this.finish(); return; }
    this.index = i;
    this.inTuneCount = 0;
    const step = this.steps[i];
    const e = this.els;
    e.step.hidden = false;
    e.finish.hidden = true;
    e.progress.textContent = `String ${i + 1} of ${this.steps.length}`;
    e.kanji.textContent = STRING_NAMES[step.string - 1];
    e.what.textContent = describeMove(step);
    let hint = describeRelation(step.partner);
    if (step.string === 1 && step.from == null) hint = 'String 一 is the reference. Use the microphone tuner or match the tone from “Play”. A clip-on tuner works too.';
    e.hint.textContent = hint;
    e.playTarget.textContent = `Play ${pitchName(step.to)}`;
    e.playCompare.hidden = !step.partner;
    if (step.partner) e.playCompare.textContent = `Play with ${STRING_NAMES[step.partner.string - 1]}`;
    e.next.textContent = i === this.steps.length - 1 ? 'Finish' : 'Next string';
    e.step.classList.remove('in-tune');
    e.readout.textContent = this.tuner.running ? `Pluck ${STRING_NAMES[step.string - 1]}…` : 'Listen to the reference, or turn on the microphone to see how close you are.';
    this.setNeedle(null);
    this.koto.focus(step.string);
    this.koto.setGhost(step.from == null ? null : this.steps.slice(i).reduce((open, s) => { open[s.string - 1] = s.from; return open; }, this.target.open.slice()), step.string);
  }

  finish() {
    this.stopMic();
    this.els.step.hidden = true;
    this.els.finish.hidden = false;
    this.els.finishText.textContent = `Your koto is now in ${this.target.label}.`;
    this.koto.focus(null);
    this.koto.setGhost(null);
    this.onTuned && this.onTuned(this.target);
  }

  playTarget() {
    const step = this.steps[this.index];
    const ctx = this.audio.ensure();
    this.audio.prepare([step.to]).then(() => {
      for (let k = 0; k < 2; k++) this.audio.pluck({ midi: step.to, when: ctx.currentTime + 0.05 + k * 1.1, dur: 1, string: 99 });
    });
  }

  playCompare() {
    const step = this.steps[this.index];
    if (!step.partner) return;
    const other = this.target.open[step.partner.string - 1];
    const ctx = this.audio.ensure();
    this.audio.prepare([step.to, other]).then(() => {
      this.audio.pluck({ midi: other, when: ctx.currentTime + 0.05, dur: 1, string: 98 });
      this.audio.pluck({ midi: step.to, when: ctx.currentTime + 0.75, dur: 1, string: 99 });
      this.audio.pluck({ midi: other, when: ctx.currentTime + 1.6, dur: 1.4, string: 98 });
      this.audio.pluck({ midi: step.to, when: ctx.currentTime + 1.6, dur: 1.4, string: 97 });
    });
  }

  async toggleMic() {
    if (this.tuner.running) { this.stopMic(); return; }
    try {
      await this.tuner.start((f) => this.onPitch(f));
      this.els.mic.textContent = 'Stop microphone';
      this.els.mic.setAttribute('aria-pressed', 'true');
      const step = this.steps[this.index];
      if (step) this.els.readout.textContent = `Pluck ${STRING_NAMES[step.string - 1]}…`;
    } catch (err) {
      this.els.readout.textContent = `The microphone is not available (${err.message}). Use the reference tones instead.`;
    }
  }

  stopMic() {
    this.tuner.stop();
    this.els.mic.textContent = 'Use microphone';
    this.els.mic.setAttribute('aria-pressed', 'false');
    this.setNeedle(null);
  }

  setNeedle(cents) {
    const n = this.els.needle;
    if (cents == null) { n.style.opacity = '0.25'; n.style.left = '50%'; return; }
    const c = Math.max(-50, Math.min(50, cents));
    n.style.opacity = '1';
    n.style.left = `${50 + c}%`;
  }

  onPitch(freq) {
    const step = this.steps[this.index];
    if (!step || this.els.step.hidden) return;
    if (!freq) { this.setNeedle(null); return; }
    const a4 = this.audio.a4;
    // compare in the nearest octave so harmonics don't confuse the reading
    let cents = centsOff(freq, step.to, a4);
    const octaves = Math.round(cents / 1200);
    if (Math.abs(octaves) === 1 && Math.abs(cents - octaves * 1200) < 60) cents -= octaves * 1200;
    const heard = pitchName(Math.round(freqToMidi(freq, a4)));
    if (Math.abs(cents) > 250) {
      this.setNeedle(null);
      this.els.readout.textContent = `Hearing ${heard}. Is that ${STRING_NAMES[step.string - 1]}? It should be ${pitchName(step.to)}.`;
      this.inTuneCount = 0;
      return;
    }
    this.setNeedle(cents);
    const r = Math.round(cents);
    if (Math.abs(cents) <= 6) {
      this.inTuneCount++;
      this.els.readout.textContent = `In tune (${r >= 0 ? '+' : ''}${r} cents).`;
      if (this.inTuneCount >= 6) {
        this.els.step.classList.add('in-tune');
        this.els.next.focus({ preventScroll: true });
      }
    } else {
      this.inTuneCount = 0;
      this.els.readout.textContent = cents < 0
        ? `${-r} cents low: slide the bridge toward you.`
        : `${r} cents high: slide the bridge away from you.`;
    }
  }
}
