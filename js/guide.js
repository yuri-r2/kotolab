// Step-by-step tuning walkthrough: which bridges to move, in which direction,
// what each string should match, with reference tones. Every string is
// verified with the microphone: the walkthrough listens while you tune and
// moves on by itself once the string holds within a few cents of its target.

import { STRING_NAMES, STRING_READINGS, pitchName } from './tunings.js';
import { Tuner, centsOff, freqToMidi } from './tuner.js';
import { TunerGauge } from './views/gauge.js';

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
  // same order as tuning from scratch (一 first, then 五, 十 …) so each string
  // can be compared with one that is already right
  return planTuningSteps(null, toOpen).map((s) => ({ ...s, from: s.to, check: true }));
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

/**
 * Setting bridges on a koto whose bridges are off. With the bridge removed,
 * a string vibrates along its whole length between the two fixed bridges
 * (龍角 ryūkaku at the player's end, 雲角 unkaku at the far end). For an
 * ideal string at fixed tension, frequency is inversely proportional to the
 * vibrating length, so if the bare string sounds f0 over length L, the bridge
 * for a target frequency f goes at L·f0/f from the player's fixed bridge.
 */
export function bridgeDistance(f0, targetMidi, length, a4 = 440) {
  return (length * f0) / midiToFreqLocal(targetMidi, a4);
}

/** Without a measurement: assume the lowest target string's bridge sits at 90% of the length. */
export function estimateBareFreq(targetOpen, a4 = 440) {
  return midiToFreqLocal(Math.min(...targetOpen), a4) * 0.9;
}

/** 'ok', 'tight' (bridge would have to go past the far end) or 'slack' (very close to the player's end). */
export function placementStatus(distance, length) {
  if (distance > length * 0.97) return 'tight';
  if (distance < length * 0.18) return 'slack';
  return 'ok';
}

/*
 * Bare strings (no bridges at all). Every string runs the same length between
 * the two fixed bridges and the 13 strings are normally the same gauge, so
 * strings at equal tension all sound the same note when bare. KotoLab aims that
 * note three half steps below the lowest note of the tuning: the lowest
 * string's bridge then sits about 84% of the way to the far end and the
 * highest strings still have room near your end.
 */
export const BARE_TOLERANCE_CENTS = 15; // the bridges do the fine tuning
export const EVEN_CENTS = 50;           // knotted strings this close to the others count as even

export function bareTargetMidi(targetOpen) {
  const lo = Math.min(...targetOpen);
  const hi = Math.max(...targetOpen);
  let bare = lo - 3;
  // a very wide tuning: raise the bare note so the top bridge is not crammed against your end
  if (hi - bare > 29) bare = Math.min(lo - 1, hi - 29);
  return bare;
}

/** Fold a reading into the octave of a reference (a bare string's overtone can read an octave up). */
export function foldToOctave(freq, refFreq) {
  return freq * Math.pow(2, -Math.round(Math.log2(freq / refFreq)));
}

/**
 * Knotted strings: compare each measured bare string with the median of all.
 * measured: [{ string, f0 | null }] → { median, rows: [{ string, f0, offCents, verdict }] },
 * verdict 'even' | 'slack' | 'tight' | 'unmeasured'.
 */
export function surveyTension(measured) {
  const fs = measured.filter((m) => m.f0).map((m) => m.f0).sort((a, b) => a - b);
  if (!fs.length) return { median: null, rows: measured.map((m) => ({ ...m, offCents: null, verdict: 'unmeasured' })) };
  const n = fs.length;
  const median = n % 2 ? fs[(n - 1) / 2] : Math.sqrt(fs[n / 2 - 1] * fs[n / 2]);
  const rows = measured.map((m) => {
    if (!m.f0) return { ...m, offCents: null, verdict: 'unmeasured' };
    const off = 1200 * Math.log2(m.f0 / median);
    return { ...m, offCents: off, verdict: Math.abs(off) <= EVEN_CENTS ? 'even' : off < 0 ? 'slack' : 'tight' };
  });
  return { median, rows };
}

function midiToFreqLocal(midi, a4) {
  return a4 * Math.pow(2, (midi - 69) / 12);
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
    this.gauge = new TunerGauge(els.gauge, { tolerance: TOLERANCE_CENTS });
    els.check.addEventListener('click', () => this.begin('check'));
    els.bridges.addEventListener('click', () => this.begin('bridges'));
    els.pegs.addEventListener('click', () => this.begin('pegs'));
    els.knots.addEventListener('click', () => this.begin('knots'));
    els.bridgesNow.addEventListener('click', () => this.begin('bridges', { useBare: true }));
    els.back.addEventListener('click', () => this.go(this.index - 1));
    els.exit.addEventListener('click', () => { clearTimeout(this.advanceTimer); this.stopMic(); this.showStart(); });
    els.next.addEventListener('click', () => this.next());
    els.playTarget.addEventListener('click', () => this.playTarget());
    els.playCompare.addEventListener('click', () => this.playCompare());
    els.mic.addEventListener('click', () => this.toggleMic());
    els.again.addEventListener('click', () => this.begin(this.againMode || 'check'));
    els.micRetry.addEventListener('click', () => this.startMic());
    els.length.addEventListener('change', () => { this.stringLength = clampLength(Number(els.length.value)); els.length.value = this.stringLength; });
    this.stringLength = clampLength(Number(els.length.value) || 170);
  }

  /** target: { open, label, base } — the tuning the current song needs. */
  setTarget(target) {
    this.target = target;
    this.els.target.textContent = target.label;
    this.stopMic();
    this.showStart();
  }

  preview() {
    this.koto.setTuning(this.target.open, { changed: [] });
    this.koto.setGhost(null);
    this.koto.focus(null);
    this.koto.setBridgesVisible(null);
    this.els.intro.textContent = 'Pick how to start. Either way the microphone listens to each string and moves on by itself once it is in tune.';
  }

  showStart() {
    this.index = -1;
    this.els.step.hidden = true;
    this.els.finish.hidden = true;
    this.els.startBox.hidden = false;
    this.els.chips.hidden = true;
    this.preview();
  }

  /**
   * mode: 'check' (bridges on), 'bridges' (place bridges on bare strings),
   * 'pegs' / 'knots' (no bridges at all: even out, or measure, the bare-string tension).
   */
  async begin(mode, { useBare = false } = {}) {
    this.mode = mode;
    this.tension = mode === 'pegs' || mode === 'knots';
    if (!useBare && !this.tension) this.bareKnown = null;
    if (this.tension) {
      this.bareMidi = bareTargetMidi(this.target.open);
      this.steps = this.target.open.map((_, i) => ({
        string: i + 1, from: null, to: this.bareMidi, status: 'pending', cents: null, phase: 'bare', f0: null, partner: null,
      }));
    } else {
      this.steps = (mode === 'check' ? planCheckSteps(this.target.open) : planTuningSteps(null, this.target.open))
        .map((s) => ({ ...s, status: 'pending', cents: null, phase: mode === 'bridges' ? 'measure' : 'tune', f0: null, distance: null }));
    }
    this.bareFreqs = [];
    if (!this.steps.length) return;
    // bare pitches just measured or set: no need to measure them again
    if (mode === 'bridges' && useBare && this.bareKnown) {
      for (const st of this.steps) { const f0 = this.bareKnown.get(st.string); if (f0) this.computeBare(st, f0); }
    }
    this.koto.setTuning(this.target.open, { changed: [] });
    this.koto.setBridgesVisible(mode === 'check' ? null : new Set());
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
      b.className = `chip-step ${s.status}${i === this.index ? ' current' : ''}${s.justVerified ? ' pop' : ''}`;
      b.textContent = STRING_NAMES[s.string - 1];
      const st = s.status === 'verified' ? `in tune (${fmtCents(s.cents)})` : s.status === 'measured' ? `measured ${pitchName(Math.round(freqToMidi(s.f0, this.audio.a4)))}` : s.status === 'ear' ? 'checked by ear' : s.status === 'skipped' ? 'skipped' : 'not checked yet';
      if (s.status === 'measured' && s.off != null && Math.abs(s.off) > EVEN_CENTS) b.classList.add('uneven');
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
    e.progress.textContent = this.tension
      ? `${this.mode === 'pegs' ? 'Evening out' : 'Measuring'} bare string ${i + 1} of ${this.steps.length}`
      : `${this.mode === 'check' ? 'Checking' : this.mode === 'bridges' ? 'Setting up' : 'Tuning'} string ${i + 1} of ${this.steps.length}`;
    this.gauge.setTolerance(this.mode === 'pegs' ? BARE_TOLERANCE_CENTS : TOLERANCE_CENTS);
    e.kanji.textContent = STRING_NAMES[step.string - 1];
    e.what.textContent = step.check ? describeCheck(step) : describeMove(step);
    e.place.hidden = true;
    e.playTarget.hidden = false;
    e.meter.hidden = false;
    let hint = describeRelation(step.partner);
    if (step.string === 1 && step.from == null) hint = 'String 一 is the reference for every other string, so take your time with it.';
    if (step.check) hint = step.partner ? `${describeRelation(step.partner)} If the microphone says it is off, slide the bridge the way it shows.` : 'String 一 is the reference for the others. If the microphone says it is off, slide the bridge the way it shows.';
    e.hint.textContent = hint;
    e.playTarget.textContent = `Play ${pitchName(step.to)}`;
    e.playCompare.hidden = !step.partner;
    if (step.partner) e.playCompare.textContent = `Play with ${STRING_NAMES[step.partner.string - 1]}`;
    e.step.classList.toggle('in-tune', step.status === 'verified');
    this.updateNextButton();
    e.readout.textContent = step.status === 'verified'
      ? `Verified: in tune (${fmtCents(step.cents)}).`
      : this.tuner.running ? `Listening… pluck ${STRING_NAMES[step.string - 1]}.` : this.micMessage();
    this.gauge.setTarget(pitchName(step.to), step.status === 'verified' ? '' : `Pluck ${STRING_NAMES[step.string - 1]}`);
    if (step.status === 'verified') this.gauge.celebrate(`${STRING_NAMES[step.string - 1]} is in tune`);
    e.readout.dataset.state = step.status === 'verified' ? 'done' : 'idle';
    this.renderChips();
    this.koto.focus(step.string);
    if (this.tension) {
      this.koto.setGhost(null);
      this.koto.setBridgesVisible(new Set());
      this.showBare(step);
      return;
    }
    if (this.mode === 'bridges') {
      this.koto.setGhost(null);
      this.koto.setBridgesVisible(this.placedBridges());
      this.showPhase(step);
      return;
    }
    if (step.check) this.koto.setGhost(null);
    else this.koto.setGhost(step.from == null ? null : this.steps.slice(i).reduce((open, s) => { open[s.string - 1] = s.from; return open; }, this.target.open.slice()), step.string);
  }

  /** Bridges already standing: earlier strings, and the current one once it has a spot. */
  placedBridges() {
    return new Set(this.steps.filter((s, k) => k < this.index || (k === this.index && s.phase === 'tune')).map((s) => s.string));
  }

  /** No bridges at all: turn a peg to the shared bare note, or just measure a knotted string. */
  showBare(step) {
    const e = this.els;
    const name = `${STRING_NAMES[step.string - 1]} (${STRING_READINGS[step.string - 1]})`;
    const kanji = STRING_NAMES[step.string - 1];
    const note = pitchName(this.bareMidi);
    e.place.hidden = true;
    if (this.mode === 'pegs') {
      e.what.textContent = `Pluck the bare ${name} near your end and turn its peg until it sounds ${note}.`;
      const tips = [];
      if (step.string === 1) tips.push('Take any bridges out, then lift off the cover over the pegs (on kotos with pegs it sits at one end) and fit the tuning key if your koto has one.');
      tips.push(step.string > 1
        ? `It should sound exactly the same as 一: with every bare string on ${note}, all 13 carry the same tension.`
        : `Every bare string goes to this same note, so all 13 carry the same tension.`);
      tips.push('Turn a little at a time and come up to the note from below so the string holds. If the pitch moves the wrong way, turn the other way.');
      e.hint.textContent = tips.join(' ');
      this.updateNextButton();
      return;
    }
    e.what.textContent = `Pluck the bare ${name} near your end and let it ring.`;
    e.hint.textContent = step.string === 1
      ? 'Knotted strings are tied off at the tail end (龍尾 ryūbi), so there is nothing to turn here. Take any bridges out; KotoLab measures how tight each string is compared with the others.'
      : 'KotoLab compares it with the strings measured so far.';
    e.playTarget.hidden = true;
    e.playCompare.hidden = true;
    e.meter.hidden = true;
    e.readout.dataset.state = step.status === 'measured' ? 'done' : 'idle';
    e.readout.textContent = step.status === 'measured' ? this.knotResult(step)
      : this.tuner.running ? `Listening for the bare ${kanji} string…` : 'Turn on the microphone to measure the bare string.';
    this.updateNextButton();
  }

  knotResult(step) {
    const kanji = STRING_NAMES[step.string - 1];
    const heard = pitchName(Math.round(freqToMidi(step.f0, this.audio.a4)));
    if (step.off == null) return `✓ ${kanji}: ${heard}`;
    const even = Math.abs(step.off) <= EVEN_CENTS;
    return `✓ ${kanji}: ${heard}, ${even ? 'even with the others' : `${Math.round(Math.abs(step.off))} cents ${step.off < 0 ? 'slacker' : 'tighter'} than the others`}`;
  }

  onKnotPitch(step, freq) {
    const last = this.inTune[this.inTune.length - 1];
    if (last && Math.abs(1200 * Math.log2(freq / last)) > 20) this.inTune = [];
    this.inTune.push(freq);
    this.els.readout.textContent = `Measuring the bare string… ${pitchName(Math.round(freqToMidi(freq, this.audio.a4)))}`;
    if (this.inTune.length < HOLD_READINGS) return;
    const sorted = this.inTune.slice().sort((a, b) => a - b);
    const others = this.steps.filter((s) => s !== step && s.f0).map((s) => s.f0);
    const ref = others.length ? surveyTension(others.map((f0) => ({ f0 }))).median : midiToFreqLocal(this.bareMidi, this.audio.a4);
    step.f0 = foldToOctave(sorted[Math.floor(sorted.length / 2)], ref);
    step.off = others.length ? 1200 * Math.log2(step.f0 / ref) : null;
    step.status = 'measured';
    this.inTune = [];
    this.els.readout.dataset.state = 'done';
    this.els.readout.textContent = this.knotResult(step);
    this.muteFor(1.2);
    this.audio.chime();
    try { navigator.vibrate?.(30); } catch { /* not supported */ }
    this.renderChips();
    this.updateNextButton();
    const at = this.index;
    this.advanceTimer = setTimeout(() => { if (this.index === at) this.go(at + 1); }, 1100);
  }

  showPhase(step) {
    const e = this.els;
    const name = `${STRING_NAMES[step.string - 1]} (${STRING_READINGS[step.string - 1]})`;
    if (step.phase === 'measure') {
      e.what.textContent = `Take the bridge out from under ${name} if one is there. Pluck the bare string near your end and let it ring.`;
      e.hint.textContent = 'The microphone measures the bare string so KotoLab can work out where the bridge goes. No microphone? Press “Skip measuring” for an estimate.';
      e.readout.textContent = this.tuner.running ? `Listening for the bare ${STRING_NAMES[step.string - 1]} string…` : 'Turn on the microphone to measure the bare string, or skip for an estimate.';
      e.playCompare.hidden = true;
      e.playTarget.hidden = true;
      e.meter.hidden = true;
      this.updateNextButton();
      return;
    }
    e.playTarget.hidden = false;
    e.meter.hidden = false;
    const cm = Math.round(step.distance);
    const L = this.stringLength;
    e.what.textContent = `Stand the bridge under ${name} about ${cm} cm from the fixed bridge at your end (龍角 ryūkaku), then pluck and slide it until it is in tune at ${pitchName(step.to)}.`;
    const notes = [];
    if (step.estimated) notes.push('This position is an estimate, so expect to slide the bridge a little further.');
    if (step.octaveFixed) notes.push('The microphone caught an overtone of the bare string; KotoLab corrected for it.');
    const status = placementStatus(step.distance, L);
    if (status === 'tight') notes.push('This string is too tight for this note: even without a bridge it sounds higher. Its tension needs lowering before it can be tuned this low (a koto shop can re-tension strings).');
    if (status === 'slack') notes.push('The bridge has to sit very close to your end, so this string is quite slack for this note. It will sound weak; the string may need re-tensioning.');
    if (step.tension) notes.push(step.tension);
    const rel = describeRelation(step.partner);
    e.hint.textContent = [...notes, rel].filter(Boolean).join(' ');
    e.place.hidden = false;
    const frac = Math.max(0, Math.min(1, step.distance / L));
    e.placeMarker.style.right = `${frac * 100}%`;
    e.placeLabel.textContent = `${cm} cm of ${Math.round(L)} cm`;
    e.playCompare.hidden = !step.partner;
    e.readout.textContent = step.status === 'verified' ? `Verified: in tune (${fmtCents(step.cents)}).` : this.tuner.running ? `Listening… pluck ${STRING_NAMES[step.string - 1]}.` : this.micMessage();
    this.gauge.setTarget(pitchName(step.to), step.status === 'verified' ? '' : `Pluck ${STRING_NAMES[step.string - 1]}`);
    if (step.status === 'verified') this.gauge.celebrate(`${STRING_NAMES[step.string - 1]} is in tune`);
    e.readout.dataset.state = step.status === 'verified' ? 'done' : 'idle';
    this.updateNextButton();
  }

  onBarePitch(step, freq) {
    const last = this.inTune[this.inTune.length - 1];
    if (last && Math.abs(1200 * Math.log2(freq / last)) > 20) this.inTune = [];
    this.inTune.push(freq);
    this.els.readout.textContent = `Measuring the bare string… ${pitchName(Math.round(freqToMidi(freq, this.audio.a4)))}`;
    if (this.inTune.length >= HOLD_READINGS) {
      const sorted = this.inTune.slice().sort((a, b) => a - b);
      this.setBare(step, sorted[Math.floor(sorted.length / 2)]);
    }
  }

  /** Record the bare-string pitch (or estimate it) and move on to placing and tuning. */
  setBare(step, freq) {
    this.computeBare(step, freq);
    this.inTune = [];
    // let the bare string die away before listening for the bridged note
    this.ignoreUntil = performance.now() + 1500;
    this.koto.setBridgesVisible(this.placedBridges());
    this.showPhase(step);
  }

  /** Work out where the bridge goes from the bare-string pitch (null = estimate). */
  computeBare(step, freq) {
    const a4 = this.audio.a4;
    const L = this.stringLength;
    step.estimated = freq == null;
    step.octaveFixed = false;
    let f0 = freq ?? estimateBareFreq(this.target.open, a4);
    let d = bridgeDistance(f0, step.to, L, a4);
    if (!step.estimated && d > L * 0.97 && d / 2 >= L * 0.18) { f0 /= 2; d /= 2; step.octaveFixed = true; }
    step.f0 = f0;
    step.distance = d;
    step.tension = '';
    if (!step.estimated) {
      const others = this.bareFreqs.filter((x) => x.string !== step.string).map((x) => x.f0);
      if (others.length >= 2) {
        const median = others.slice().sort((a, b) => a - b)[Math.floor(others.length / 2)];
        const off = 1200 * Math.log2(f0 / median);
        if (Math.abs(off) > 150) step.tension = `The bare string sounds ${Math.round(Math.abs(off))} cents ${off < 0 ? 'lower' : 'higher'} than the others, so it is noticeably ${off < 0 ? 'slacker' : 'tighter'}. That is fine for tuning, but if it keeps drifting the string may need re-tensioning.`;
      }
      this.bareFreqs = this.bareFreqs.filter((x) => x.string !== step.string).concat({ string: step.string, f0 });
    }
    step.phase = 'tune';
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
    if (this.mode === 'bridges' && step.phase === 'measure') {
      e.next.textContent = 'Skip measuring (use an estimate)';
      e.next.classList.remove('primary');
      return;
    }
    if (this.mode === 'knots') {
      const done = step.status === 'measured';
      e.next.textContent = done ? (last ? 'Finish' : 'Next string') : last ? 'Skip and finish' : 'Skip this string';
      e.next.classList.toggle('primary', done);
      return;
    }
    if (step.status === 'verified') e.next.textContent = last ? 'Finish' : 'Next string';
    else if (this.micFailed || !this.tuner.running) e.next.textContent = last ? 'Tuned by ear, finish' : 'Tuned by ear, next';
    else e.next.textContent = last ? 'Skip and finish' : 'Skip this string';
    e.next.classList.toggle('primary', step.status === 'verified');
  }

  next() {
    const step = this.steps[this.index];
    if (step && this.mode === 'bridges' && step.phase === 'measure') { this.setBare(step, null); return; }
    if (step && this.mode === 'knots') { if (step.status !== 'measured') step.status = 'skipped'; }
    else if (step && step.status !== 'verified') step.status = this.tuner.running ? 'skipped' : 'ear';
    this.go(this.index + 1);
  }

  finish() {
    clearTimeout(this.advanceTimer);
    this.stopMic();
    this.index = -1;
    this.renderChips();
    const e = this.els;
    e.step.hidden = true;
    e.finish.hidden = false;
    this.koto.focus(null);
    this.koto.setGhost(null);
    if (this.tension) { this.finishTension(); return; }
    e.toPlay.hidden = false;
    e.bridgesNow.hidden = true;
    e.finishList.hidden = true;
    e.again.textContent = 'Check all strings again';
    this.againMode = 'check';
    const verified = this.steps.filter((s) => s.status === 'verified');
    const others = this.steps.filter((s) => s.status !== 'verified');
    e.finish.classList.toggle('partial', others.length > 0);
    if (!others.length) {
      e.finishText.textContent = `All ${this.steps.length} string${this.steps.length > 1 ? 's' : ''} verified with the microphone. Your koto is in ${this.target.label}.`;
    } else {
      const list = (arr) => arr.map((s) => STRING_NAMES[s.string - 1]).join(' ');
      e.finishText.textContent = `${verified.length} of ${this.steps.length} strings verified. Not verified: ${list(others)}. Check them again before you play.`;
    }
    this.onTuned && this.onTuned(this.target, { verified: !others.length });
  }

  /** Summary after the bare-string pass, then on to placing the bridges. */
  finishTension() {
    const e = this.els;
    const a4 = this.audio.a4;
    const list = (arr) => arr.map((s) => STRING_NAMES[s.string - 1]).join(' ');
    const bareFreq = midiToFreqLocal(this.bareMidi, a4);
    const note = pitchName(this.bareMidi);
    this.againMode = this.mode;
    e.toPlay.hidden = true;
    e.bridgesNow.hidden = false;
    this.bareKnown = new Map();
    let text;
    if (this.mode === 'pegs') {
      e.finishList.hidden = true;
      e.again.textContent = 'Go through the pegs again';
      for (const s of this.steps) {
        if (s.status === 'verified') this.bareKnown.set(s.string, s.f0);
        else if (s.status === 'ear') this.bareKnown.set(s.string, bareFreq);
      }
      const done = this.steps.filter((s) => s.status === 'verified');
      const rest = this.steps.filter((s) => s.status !== 'verified');
      text = rest.length
        ? `${done.length} of ${this.steps.length} bare strings are on ${note}. Not set with the microphone: ${list(rest)}.`
        : `All ${this.steps.length} bare strings are on ${note}, so the tension is even.`;
      text += ' Tightening one string can pull the others slightly, so go through the pegs once more, then place the bridges.';
    } else {
      e.again.textContent = 'Measure again';
      const { median, rows } = surveyTension(this.steps.map((s) => ({ string: s.string, f0: s.f0 })));
      for (const r of rows) if (r.f0) this.bareKnown.set(r.string, r.f0);
      if (!median) {
        e.finishList.hidden = true;
        text = 'No strings were measured. Turn on the microphone and measure again, or place the bridges using an estimate.';
      } else {
        const slack = rows.filter((r) => r.verdict === 'slack');
        const tight = rows.filter((r) => r.verdict === 'tight');
        const centre = pitchName(Math.round(freqToMidi(median, a4)));
        text = `The bare strings centre on ${centre}.`;
        if (!slack.length && !tight.length) {
          text += ` Every measured string is within ${EVEN_CENTS} cents of the others, so the tension is even and nothing needs re-tying.`;
        } else {
          if (slack.length) text += ` Slacker: ${list(slack)}.`;
          if (tight.length) text += ` Tighter: ${list(tight)}.`;
          text += ' Up to about a half step makes little difference: those bridges just stand a little further along. A string much slacker sounds weak and can buzz, and one much tighter is under strain; a koto shop can even them out by re-tying the strings (糸締め itojime).';
        }
        const overall = 1200 * Math.log2(median / bareFreq);
        if (overall < -400) text += ' Overall the strings are slack for this tuning, so the low strings’ bridges will stand close to the far end.';
        if (overall > 400) text += ' Overall the strings are tight for this tuning, so the high strings’ bridges will stand close to your end.';
        e.finishList.hidden = false;
        e.finishList.innerHTML = '';
        for (const r of rows) {
          const li = document.createElement('li');
          li.className = r.verdict;
          const k = document.createElement('b');
          k.textContent = STRING_NAMES[r.string - 1];
          const v = document.createElement('span');
          v.textContent = r.f0 ? `${pitchName(Math.round(freqToMidi(r.f0, a4)))} ${r.verdict === 'even' ? '✓' : fmtCents(r.offCents).replace(' cents', '¢')}` : '–';
          li.title = r.f0 ? `${r.verdict === 'even' ? 'even' : r.verdict} (${fmtCents(r.offCents)} from the middle)` : 'not measured';
          li.append(k, v);
          e.finishList.appendChild(li);
        }
      }
    }
    e.finish.classList.toggle('partial', false);
    e.finishText.textContent = text;
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
      if (step && step.status !== 'verified' && step.status !== 'measured') {
        this.els.readout.textContent = (this.mode === 'bridges' && step.phase === 'measure') || this.mode === 'knots'
          ? `Listening for the bare ${STRING_NAMES[step.string - 1]} string…`
          : `Listening… pluck ${STRING_NAMES[step.string - 1]}.`;
      }
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
    this.gauge.update(null);
    this.setLevel(0);
  }

  /** Same text for the gauge (visual) and the live region (screen readers). */
  say(text) {
    this.els.readout.dataset.state = this.gauge.svg.dataset.state;
    if (this.els.readout.textContent !== text) this.els.readout.textContent = text;
  }

  setLevel(level) {
    if (this.els.level) this.els.level.style.width = `${Math.round(level * 100)}%`;
  }

  onPitch(freq, level = 0) {
    this.setLevel(level);
    const step = this.steps[this.index];
    if (!step || this.els.step.hidden || step.status === 'verified') return;
    if (performance.now() < this.ignoreUntil) return;
    if (step.status === 'measured') return;
    const measuring = (this.mode === 'bridges' && step.phase === 'measure') || this.mode === 'knots';
    if (!freq) {
      this.inTune = [];
      this.silentSince = this.silentSince || performance.now();
      if (performance.now() - this.silentSince > 350 && this.gauge.active) {
        this.gauge.update(null);
        this.gauge.setHold(0);
        if (!measuring) this.say(`Pluck ${STRING_NAMES[step.string - 1]}`);
      }
      return;
    }
    this.silentSince = 0;
    if (this.mode === 'knots') { this.onKnotPitch(step, freq); return; }
    if (this.mode === 'bridges' && step.phase === 'measure') { this.onBarePitch(step, freq); return; }
    const a4 = this.audio.a4;
    const pegs = this.mode === 'pegs';
    const tol = pegs ? BARE_TOLERANCE_CENTS : TOLERANCE_CENTS;
    const up = pegs ? 'tighten the peg' : 'slide the bridge toward you';
    const down = pegs ? 'loosen the peg' : 'slide the bridge away from you';
    const cents = foldOctave(centsOff(freq, step.to, a4));
    const r = Math.round(cents);
    const heard = pitchName(Math.round(freqToMidi(freq, a4)));
    const name = STRING_NAMES[step.string - 1];
    if (Math.abs(cents) > 80) {
      this.inTune = [];
      this.gauge.setHold(0);
      const others = this.target.open.map((p, i) => i).filter((i) => i + 1 !== step.string && Math.abs(centsOff(freq, this.target.open[i], a4)) < 35);
      const wrong = !pegs && others.length > 0 && Math.abs(cents) > 150;
      const cue = wrong
        ? `That sounds like ${others.map((i) => STRING_NAMES[i]).join(' or ')}. Pluck ${name}.`
        : cents < 0 ? `Much too low · ${up}` : `Much too high · ${down}`;
      this.gauge.update({ cents, heard, wrong });
      this.say(cue);
      return;
    }
    const abs = Math.abs(cents);
    let cue;
    if (abs <= tol) {
      this.inTune.push(cents);
      cue = 'In tune · hold it…';
    } else if (abs <= tol * 2 && this.inTune.length) {
      // a brief wobble just outside the window doesn't throw away the hold
      cue = 'Almost · hold it…';
    } else {
      this.inTune = [];
      cue = cents < 0 ? `↑ ${-r}¢ low · ${up}` : `↓ ${r}¢ high · ${down}`;
    }
    this.gauge.update({ cents, heard });
    this.gauge.setHold(this.inTune.length / HOLD_READINGS);
    this.say(cue);
    if (this.inTune.length >= HOLD_READINGS) this.verify();
  }

  verify() {
    const step = this.steps[this.index];
    step.status = 'verified';
    step.cents = this.inTune.reduce((a, b) => a + b, 0) / this.inTune.length;
    if (this.mode === 'pegs') step.f0 = midiToFreqLocal(step.to, this.audio.a4) * Math.pow(2, step.cents / 1200);
    step.justVerified = true;
    this.inTune = [];
    const name = STRING_NAMES[step.string - 1];
    this.els.step.classList.add('in-tune');
    this.gauge.celebrate(`${name} is in tune`);
    this.say(`✓ ${name} is in tune (${fmtCents(step.cents)})`);
    // confirmation: chime (the detector is muted so it can't hear itself), buzz, and the string lights up
    this.muteFor(1.2);
    this.audio.chime();
    try { navigator.vibrate?.(45); } catch { /* not supported */ }
    this.koto.markTuned(step.string);
    this.renderChips();
    step.justVerified = false;
    this.updateNextButton();
    const at = this.index;
    this.advanceTimer = setTimeout(() => { if (this.index === at) this.go(at + 1); }, 1300);
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

function clampLength(cm) {
  return Number.isFinite(cm) ? Math.max(100, Math.min(200, Math.round(cm))) : 170;
}
