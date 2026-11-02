// Microphone tuner: autocorrelation pitch detection with parabolic
// interpolation, covering C2–D7 so custom tunings and presses are heard.

export class Tuner {
  constructor(audio) {
    this.audio = audio;
    this.running = false;
    this.history = [];
  }

  async start(onPitch) {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use the microphone.');
    const ctx = this.audio.ensure();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.source = ctx.createMediaStreamSource(this.stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.source.connect(this.analyser);
    this.buf = new Float32Array(this.analyser.fftSize);
    this.running = true;
    this.onPitch = onPitch;
    const loop = () => {
      if (!this.running) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0;
      for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
      const level = Math.min(1, Math.sqrt(sum / this.buf.length) * 8);
      const f = detectPitch(this.buf, ctx.sampleRate);
      if (f) {
        // a new note (more than ~60 cents away) starts a fresh history
        const last = this.history[this.history.length - 1];
        if (last && Math.abs(1200 * Math.log2(f / last)) > 60) this.history = [];
        this.history.push(f);
        if (this.history.length > 5) this.history.shift();
        const sorted = this.history.slice().sort((a, b) => a - b);
        this.onPitch(sorted[Math.floor(sorted.length / 2)], level);
      } else {
        this.history = [];
        this.onPitch(null, level);
      }
      this.timer = setTimeout(loop, 50);
    };
    loop();
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    try { this.source?.disconnect(); } catch { /* ignore */ }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.history = [];
  }
}

/** Returns frequency in Hz, or null when there is no clear pitch. */
export function detectPitch(buf, sampleRate, { minHz = 60, maxHz = 2400 } = {}) {
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.008) return null;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(n / 2));
  const size = n - maxLag;
  const corr = new Float32Array(maxLag + 2);
  let energy0 = 0;
  for (let i = 0; i < size; i++) energy0 += buf[i] * buf[i];
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let sum = 0, energy = 0;
    for (let i = 0; i < size; i++) {
      sum += buf[i] * buf[i + lag];
      energy += buf[i + lag] * buf[i + lag];
    }
    corr[lag] = sum / Math.sqrt(energy0 * energy || 1);
  }
  // first strong peak (avoids octave errors from picking a later, equal peak)
  let best = -1, bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > best) { best = corr[lag]; bestLag = lag; }
  if (best < 0.8) return null;
  const threshold = best * 0.92;
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (corr[lag] >= threshold && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { bestLag = lag; break; }
  }
  const a = corr[bestLag - 1] || 0, b = corr[bestLag], c = corr[bestLag + 1] || 0;
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  return sampleRate / (bestLag + (Number.isFinite(shift) ? shift : 0));
}

/** Cents between a frequency and a target MIDI note. */
export function centsOff(freq, midi, a4 = 440) {
  const target = a4 * Math.pow(2, (midi - 69) / 12);
  return 1200 * Math.log2(freq / target);
}

export function freqToMidi(freq, a4 = 440) {
  return 69 + 12 * Math.log2(freq / a4);
}
