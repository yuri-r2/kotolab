// Sound: a Karplus–Strong plucked-string synth tuned for a bright, plectrum
// attack (works offline, no downloads), plus optional real koto samples from
// the FluidR3 General MIDI soundfont (CC BY 3.0, pre-rendered by Benjamin
// Gleitzman's midi-js-soundfonts) loaded on demand.
//
// Left-hand techniques are rendered as pitch curves on the source's `detune`
// parameter, so presses, after-presses, hiki-iro and vibrato bend smoothly.

import { midiToFreq } from './tunings.js';

const SAMPLE_URL = 'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/koto-mp3/';
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export class KotoAudio {
  constructor() {
    this.ctx = null;
    this.synthCache = new Map();
    this.sampleCache = new Map();
    this.mode = 'synth';
    this.a4 = 440;
    this.volume = 0.8;
    this.active = new Map(); // string -> { src, gain }
    this.sources = new Set();
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // a gentle body: low resonance and presence, then a short room
    const body1 = ctx.createBiquadFilter();
    body1.type = 'peaking'; body1.frequency.value = 240; body1.Q.value = 1.2; body1.gain.value = 4;
    const body2 = ctx.createBiquadFilter();
    body2.type = 'peaking'; body2.frequency.value = 2400; body2.Q.value = 0.9; body2.gain.value = 3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.input = ctx.createGain();
    this.input.connect(body1).connect(body2);
    const dry = ctx.createGain(); dry.gain.value = 0.85;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeRoom(1.6);
    body2.connect(dry).connect(comp);
    body2.connect(convolver).connect(wet).connect(comp);
    comp.connect(this.master).connect(ctx.destination);
    this.clickGain = ctx.createGain();
    this.clickGain.gain.value = 0.35;
    this.clickGain.connect(this.master);
    return ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  makeRoom(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  /** Karplus–Strong pluck at the exact pitch (fractional delay). */
  synthBuffer(midi) {
    const key = Math.round(midi * 100);
    if (this.synthCache.has(key)) return this.synthCache.get(key);
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const f = midiToFreq(midi, this.a4);
    const t60 = Math.max(1.4, Math.min(4.5, 5.2 - (midi - 55) * 0.1));
    const seconds = Math.min(5, t60 + 0.3);
    const n = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, n, sr);
    const y = buf.getChannelData(0);
    const D = sr / f - 0.5; // averaging filter adds half a sample
    const L = Math.floor(D);
    const frac = D - L;
    const g = Math.pow(0.001, 1 / (f * t60));
    // excitation: bright noise with a pick-position comb (plucked near the end)
    const exc = new Float32Array(L + 2);
    for (let i = 0; i < exc.length; i++) exc[i] = Math.random() * 2 - 1;
    const pick = Math.max(1, Math.round(L * 0.13));
    for (let i = exc.length - 1; i >= pick; i--) exc[i] -= 0.8 * exc[i - pick];
    let mean = 0;
    for (let i = 0; i < exc.length; i++) mean += exc[i];
    mean /= exc.length;
    const read = (idx) => (idx < 0 ? 0 : y[idx]);
    for (let i = 0; i < n; i++) {
      const x = i < exc.length ? (exc[i] - mean) * 0.6 : 0;
      const a = i - L;
      const d0 = (1 - frac) * read(a) + frac * read(a - 1);
      const d1 = (1 - frac) * read(a - 1) + frac * read(a - 2);
      y[i] = x + g * 0.5 * (d0 + d1);
    }
    // a little plectrum click
    for (let i = 0; i < Math.min(n, 220); i++) y[i] += (Math.random() * 2 - 1) * 0.25 * (1 - i / 220);
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
    const norm = 0.5 / (peak || 1);
    for (let i = 0; i < n; i++) y[i] *= norm;
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < fade; i++) y[n - 1 - i] *= i / fade;
    this.synthCache.set(key, buf);
    return buf;
  }

  async loadSamples(midis) {
    this.ensure();
    const wanted = [...new Set(midis.map((m) => Math.round(m)))];
    await Promise.all(wanted.map(async (m) => {
      if (this.sampleCache.has(m)) return;
      const name = FLAT_NAMES[m % 12] + (Math.floor(m / 12) - 1);
      const res = await fetch(SAMPLE_URL + name + '.mp3');
      if (!res.ok) throw new Error(`Sample ${name} not available (${res.status})`);
      const data = await res.arrayBuffer();
      this.sampleCache.set(m, await this.ctx.decodeAudioData(data));
    }));
  }

  /** Prepare buffers for a list of pitches. Falls back to synth if samples fail. */
  async prepare(midis) {
    this.ensure();
    if (this.mode === 'samples') {
      try {
        await this.loadSamples(midis);
        return 'samples';
      } catch (err) {
        console.warn('Koto samples unavailable, using synth', err);
        this.mode = 'synth';
        this.sampleError = err.message;
      }
    }
    for (const m of midis) this.synthBuffer(m);
    return 'synth';
  }

  setA4(a4) {
    if (a4 === this.a4) return;
    this.a4 = a4;
    this.synthCache.clear();
  }

  bufferFor(midi) {
    if (this.mode === 'samples') {
      const m = Math.round(midi);
      const buf = this.sampleCache.get(m);
      // samples are at A=440; shift them to the chosen reference pitch
      if (buf) return { buf, cents: (midi - m) * 100 + 1200 * Math.log2(this.a4 / 440) };
    }
    return { buf: this.synthBuffer(midi), cents: 0 };
  }

  /**
   * Play one string.
   * opts: { midi, when, dur, velocity, string, bends:[{at, cents, ramp}], vibrato:{from, depth}, damp, soft }
   */
  pluck(opts) {
    const ctx = this.ensure();
    const when = Math.max(opts.when ?? ctx.currentTime, ctx.currentTime);
    const { buf, cents } = this.bufferFor(opts.midi);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.detune.setValueAtTime(cents, when);
    let cur = cents;
    for (const b of opts.bends || []) {
      const at = when + b.at;
      src.detune.setValueAtTime(cur, at); // anchor the ramp start
      cur = cents + b.cents;
      src.detune.linearRampToValueAtTime(cur, at + (b.ramp || 0.08));
    }
    if (opts.vibrato) {
      const { from, depth = 30, rate = 5.5, until = 3 } = opts.vibrato;
      for (let t = from; t < until; t += 1 / (rate * 2)) {
        const k = Math.round((t - from) * rate * 2);
        src.detune.linearRampToValueAtTime(cents + (k % 2 ? -depth : depth), when + t);
      }
    }
    const gain = ctx.createGain();
    const v = (opts.velocity ?? 0.85) * (opts.soft ? 0.55 : 1);
    gain.gain.setValueAtTime(v, when);
    let out = gain;
    if (opts.soft) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1800;
      gain.connect(lp);
      out = lp;
    }
    src.connect(gain);
    out.connect(this.input);
    const hold = opts.damp ? Math.max(0.08, opts.dur) : Math.min(buf.duration, Math.max(opts.dur + 2.5, 1.5));
    gain.gain.setValueAtTime(v, when + hold);
    gain.gain.linearRampToValueAtTime(0.0001, when + hold + 0.06);
    src.start(when);
    src.stop(when + hold + 0.1);
    // re-plucking a string stops what it was still sounding
    if (opts.string) {
      const prev = this.active.get(opts.string);
      if (prev && prev.start < when) {
        prev.gain.gain.cancelScheduledValues(when);
        prev.gain.gain.setTargetAtTime(0.0001, when, 0.015);
      }
      this.active.set(opts.string, { src, gain, start: when });
    }
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    return src;
  }

  /** Suri-zume: a scraped noise sweep. */
  scrape(when, dur = 0.5) {
    const ctx = this.ensure();
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(900, when);
    bp.frequency.exponentialRampToValueAtTime(3500, when + dur);
    const g = ctx.createGain(); g.gain.value = 0.35;
    src.connect(bp).connect(g).connect(this.input);
    src.start(when);
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** A short two-note chime to confirm a string is in tune. */
  chime(when = this.now() + 0.02) {
    const ctx = this.ensure();
    [[1318.5, 0], [1975.5, 0.09]].forEach(([f, dt]) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when + dt);
      g.gain.exponentialRampToValueAtTime(0.28, when + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dt + 0.55);
      osc.connect(g).connect(this.master);
      osc.start(when + dt);
      osc.stop(when + dt + 0.6);
      this.sources.add(osc);
      osc.onended = () => this.sources.delete(osc);
    });
  }

  click(when, accent) {
    const ctx = this.ensure();
    const osc = ctx.createOscillator();
    osc.frequency.value = accent ? 1760 : 1180;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.5, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    osc.connect(g).connect(this.clickGain);
    osc.start(when);
    osc.stop(when + 0.06);
    this.sources.add(osc);
    osc.onended = () => this.sources.delete(osc);
  }

  stopAll() {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources.clear();
    this.active.clear();
  }
}

/**
 * Turn an arranged event into pluck calls (techniques → timing and bends).
 * Returns a list of { delay, opts } relative to the event start.
 */
export function eventToPlucks(ev, secPerBeat, open) {
  const dur = ev.d * secPerBeat;
  const out = [];
  const techs = new Set(ev.techs);
  const notes = ev.notes.filter((n) => n.string && !n.omitted);
  for (const n of notes) {
    const base = { midi: n.pitch, dur, string: n.string, velocity: n.finger === 3 ? 0.9 : 0.8 };
    if (techs.has('sukui')) base.velocity = 0.5;
    if (techs.has('left') || n.finger === 'L') base.soft = true;
    if (techs.has('keshi')) { base.damp = true; base.dur = dur * 0.5; }
    const bends = [];
    const late = Math.min(dur * 0.45, 0.4);
    if (techs.has('ato')) bends.push({ at: late, cents: 200, ramp: 0.12 });
    if (techs.has('ato1')) bends.push({ at: late, cents: 100, ramp: 0.1 });
    if (techs.has('hanashi')) bends.push({ at: late, cents: -100 * (n.press || 1), ramp: 0.12 });
    if (techs.has('hiki')) bends.push({ at: dur * 0.3, cents: -70, ramp: Math.max(0.2, dur * 0.4) });
    if (techs.has('tsuki')) {
      bends.push({ at: 0.07, cents: 110, ramp: 0.05 });
      bends.push({ at: 0.13, cents: 0, ramp: 0.12 });
    }
    if (techs.has('yuri')) base.vibrato = { from: Math.min(0.25, dur * 0.25), depth: 35, until: Math.max(dur, 0.8) + 0.8 };
    base.bends = bends;
    out.push({ delay: 0, opts: base });
    if ((techs.has('kaki') || techs.has('wari')) && n.string < 13 && open) {
      out.push({ delay: 0.045, opts: { midi: open[n.string], dur, string: n.string + 1, velocity: 0.8 } });
    }
  }
  // chords: tiny spread so they sound plucked rather than mechanical
  if (notes.length > 1) out.forEach((p, i) => { p.delay += i * 0.008; });
  if (techs.has('suri')) out.push({ delay: 0, scrape: Math.min(dur, 0.6) });
  return out;
}
