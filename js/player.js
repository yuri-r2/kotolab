// Transport: look-ahead scheduler (Web Audio clock) with tempo scaling,
// A–B looping, metronome and count-in.

import { eventToPlucks } from './audio.js';
import { barBeats, beatUnit } from './notation.js';

const LOOKAHEAD = 0.15;
const EPS = 1e-6;

export class Player {
  constructor(audio, { onTick, onState } = {}) {
    this.audio = audio;
    this.onTick = onTick;
    this.onState = onState;
    this.speed = 1;
    this.loop = null;
    this.stopAt = null; // beat to stop at when playing a selection once
    this.metronome = false;
    this.countIn = false;
    this.playing = false;
    this.position = 0;
    this.timer = null;
    this.raf = null;
  }

  load(arr) {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.arr = arr;
    this.total = arr.measures.length * barBeats(arr.timeSig);
    this.position = Math.min(this.position, this.total);
    if (wasPlaying) this.play();
  }

  get secPerBeat() {
    return 60 / (this.arr.tempo * this.speed);
  }

  async play(from = this.position, { countIn = this.countIn } = {}) {
    if (!this.arr) return;
    const ctx = this.audio.ensure();
    const pitches = [];
    for (const ev of this.arr.events) for (const n of ev.notes) if (n.string) { pitches.push(n.pitch); if (n.string < 13) pitches.push(this.arr.open[n.string]); }
    await this.audio.prepare(pitches);
    if (this.loop && (from < this.loop.start - EPS || from >= this.loop.end - EPS)) from = this.loop.start;
    if (from >= this.total - EPS) from = 0;
    let start = ctx.currentTime + 0.08;
    if (countIn) {
      const bb = barBeats(this.arr.timeSig);
      const unit = beatUnit(this.arr.timeSig);
      for (let b = 0; b < bb - EPS; b += unit) this.audio.click(start + b * this.secPerBeat, b === 0);
      start += bb * this.secPerBeat;
    }
    this.segments = [{ time: start, beat: from }];
    this.schedBeat = from;
    this.playing = true;
    this.onState && this.onState('playing');
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
    const frame = () => {
      if (!this.playing) return;
      this.position = this.beatAt(this.audio.now());
      this.onTick && this.onTick(this.position);
      const endAt = this.stopAt ?? this.total;
      if (!this.loop && this.position >= endAt + 0.25) {
        const back = this.stopAt != null ? this.rangeStart : null;
        this.stop(true);
        if (back != null) { this.position = back; this.onTick && this.onTick(back); }
        return;
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  beatAt(time) {
    let seg = this.segments[0];
    for (const s of this.segments) if (s.time <= time + EPS) seg = s;
    if (time < seg.time) return seg.beat;
    return seg.beat + (time - seg.time) / this.secPerBeat;
  }

  timeOfBeat(beat) {
    const seg = this.segments[this.segments.length - 1];
    return seg.time + (beat - seg.beat) * this.secPerBeat;
  }

  schedule() {
    const now = this.audio.now();
    const horizon = now + LOOKAHEAD;
    let guard = 0;
    while (guard++ < 8) {
      const seg = this.segments[this.segments.length - 1];
      const horizonBeat = seg.beat + (horizon - seg.time) / this.secPerBeat;
      const end = this.loop ? this.loop.end : this.stopAt ?? this.total;
      const upto = Math.min(horizonBeat, end);
      if (upto > this.schedBeat + EPS) this.scheduleRange(this.schedBeat, upto);
      this.schedBeat = Math.max(this.schedBeat, upto);
      if (this.loop && horizonBeat >= this.loop.end - EPS) {
        const t = this.timeOfBeat(this.loop.end);
        this.segments.push({ time: t, beat: this.loop.start });
        if (this.segments.length > 6) this.segments.splice(0, this.segments.length - 6);
        this.schedBeat = this.loop.start;
        continue;
      }
      break;
    }
  }

  scheduleRange(a, b) {
    const spb = this.secPerBeat;
    for (const ev of this.arr.events) {
      if (ev.rest || ev.t < a - EPS || ev.t >= b - EPS) continue;
      const when = this.timeOfBeat(ev.t);
      for (const p of eventToPlucks(ev, spb, this.arr.open)) {
        if (p.scrape) this.audio.scrape(when + p.delay, p.scrape);
        else this.audio.pluck({ ...p.opts, when: when + p.delay });
      }
    }
    if (this.metronome) {
      const unit = beatUnit(this.arr.timeSig);
      const bb = barBeats(this.arr.timeSig);
      const first = Math.ceil(a / unit - EPS) * unit;
      for (let beat = first; beat < b - EPS; beat += unit) {
        this.audio.click(this.timeOfBeat(beat), Math.abs(beat / bb - Math.round(beat / bb)) < EPS);
      }
    }
  }

  pause() {
    if (!this.playing) return;
    this.position = Math.max(0, this.beatAt(this.audio.now()));
    this.halt();
    this.onState && this.onState('paused');
  }

  stop(ended = false) {
    this.halt();
    this.position = this.loop ? this.loop.start : 0;
    this.onTick && this.onTick(null);
    this.onState && this.onState(ended ? 'ended' : 'stopped');
  }

  halt() {
    this.playing = false;
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.audio.stopAll();
  }

  seek(beat) {
    const was = this.playing;
    if (was) this.halt();
    this.position = Math.max(0, Math.min(beat, this.total));
    this.onTick && this.onTick(this.position);
    if (was) this.play(this.position, { countIn: false });
  }

  setSpeed(speed) {
    if (this.playing) {
      const beat = this.beatAt(this.audio.now());
      this.halt();
      this.speed = speed;
      this.play(beat, { countIn: false });
    } else this.speed = speed;
  }
}
