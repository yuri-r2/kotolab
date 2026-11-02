// Importers: Standard MIDI files (via @tonejs/midi, MIT) and Humdrum
// **koto files (the encoding by Craig Sapp & Sachiko Deguchi used for the
// koto scores at kern.ccarh.org / koto.sapp.org).

import { normalizeEvents, barBeats } from './notation.js';

const MIDI_LIB = 'https://cdn.jsdelivr.net/npm/@tonejs/midi@2.0.28/+esm';
const EPS = 1e-6;

/** Read a MIDI file and return a list of tracks with their notes. */
export async function readMidi(arrayBuffer) {
  const { Midi } = await import(MIDI_LIB);
  const midi = new Midi(arrayBuffer);
  const ppq = midi.header.ppq;
  const tempo = Math.round(midi.header.tempos[0]?.bpm || 100);
  const ts = midi.header.timeSignatures[0]?.timeSignature || [4, 4];
  const tracks = midi.tracks
    .map((tr, i) => ({
      index: i,
      name: tr.name || tr.instrument?.name || `Track ${i + 1}`,
      percussion: tr.instrument?.percussion,
      notes: tr.notes.map((n) => ({ pitch: n.midi, start: n.ticks / ppq, dur: n.durationTicks / ppq, velocity: n.velocity })),
    }))
    .filter((t) => t.notes.length && !t.percussion);
  return { name: midi.name, tempo, timeSig: [ts[0], ts[1]], tracks };
}

/**
 * Convert MIDI notes to KotoLab events.
 * opts.voices: 1 = melody only (highest note), 2 = melody + one lower note.
 * opts.grid: quantize grid in beats (default ¼ = sixteenth notes).
 */
export function midiToEvents(notes, { voices = 1, grid = 0.25, timeSig = [4, 4] } = {}) {
  const q = (x) => Math.round(x / grid) * grid;
  const byStart = new Map();
  for (const n of notes) {
    const s = q(n.start);
    if (!byStart.has(s)) byStart.set(s, []);
    byStart.get(s).push({ ...n, start: s, dur: Math.max(grid, q(n.dur)) });
  }
  const starts = [...byStart.keys()].sort((a, b) => a - b);
  const bb = barBeats(timeSig);
  const events = [];
  starts.forEach((s, i) => {
    const group = byStart.get(s).sort((a, b) => b.pitch - a.pitch);
    const chosen = [group[0]];
    if (voices > 1) {
      const low = group.find((n) => group[0].pitch - n.pitch >= 3);
      if (low) chosen.push(low);
    }
    const next = i + 1 < starts.length ? starts[i + 1] : s + chosen[0].dur;
    const barEnd = (Math.floor(s / bb + EPS) + 1) * bb;
    const d = Math.max(grid, Math.min(chosen[0].dur, next - s, barEnd - s));
    events.push({ t: s, d, rest: false, notes: chosen.map((n) => ({ pitch: n.pitch })), techs: [], finger: null, shoga: null, token: null });
  });
  // drop a leading silence that is longer than a bar
  const first = events[0]?.t || 0;
  const shift = Math.floor(first / bb + EPS) * bb;
  for (const e of events) e.t -= shift;
  return normalizeEvents(events, timeSig);
}

const KERN_LETTER = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** "d" → D4, "G" → G3, "dd" → D5, "B-" → B♭3, "f#" → F♯4 */
export function kernPitch(tok) {
  const m = /^([a-gA-G])\1*([#-]*)$/.exec(tok.trim());
  if (!m) return null;
  const letters = tok.match(/^[a-gA-G]+/)[0];
  const lower = letters[0] === letters[0].toLowerCase();
  const octave = lower ? 3 + letters.length : 4 - letters.length;
  let v = KERN_LETTER[letters[0].toLowerCase()] + (octave + 1) * 12;
  for (const ch of m[2]) v += ch === '#' ? 1 : -1;
  return v;
}

const KOTO_STRING = { A: 10, B: 11, C: 12, D: 13 };

/**
 * Parse a Humdrum file containing a **koto spine.
 * Supported: string numbers 1–9/A–D, 0 rest, | (eighth) || (sixteenth),
 * "." augmentation dot, "+"/"-" continuation, # raise (press) per #,
 * s = sha (kaki-zume), a/b/c fingering, i = hiki-iro, o = ato-oshi.
 */
export function parseHumdrumKoto(text) {
  const lines = text.split(/\r?\n/);
  let spine = -1;
  let kuchi = -1;
  let tuning = null;
  let timeSig = [4, 4];
  let title = null;
  const events = [];
  let t = 0;
  let last = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('!!!OTL')) { title = title || line.split(':').slice(1).join(':').trim(); continue; }
    if (line.startsWith('!')) continue;
    const fields = line.split('\t');
    if (spine < 0) {
      spine = fields.findIndex((f) => f.trim() === '**koto');
      kuchi = fields.findIndex((f) => f.trim() === '**kuchi');
      continue;
    }
    const tok = (fields[spine] || '').trim();
    if (!tok || tok === '*-') continue;
    if (tok.startsWith('*')) {
      const tm = /^\*tune\[(.*)\]$/.exec(tok);
      if (tm) tuning = tm[1].split(':').map(kernPitch);
      const ms = /^\*M(\d+)\/(\d+)$/.exec(tok);
      if (ms) timeSig = [Number(ms[1]), Number(ms[2])];
      continue;
    }
    if (tok.startsWith('=')) continue;
    if (tok === '.') continue;
    const body = tok.replace(/[{}]/g, '');
    if (body.startsWith('-')) {
      // continuation of the previous note by one beat unit (quarter, or as beamed)
      const bars = (body.match(/\|/g) || []).length;
      const d = 1 / Math.pow(2, bars);
      if (last) last.d += d;
      t += d;
      continue;
    }
    const bars = (body.match(/\|/g) || []).length;
    let d = 1 / Math.pow(2, bars);
    if (body.includes('.')) d *= 1.5;
    const sm = /^([0-9A-D])/.exec(body);
    if (!sm) continue;
    const sym = sm[1];
    const ev = { t, d, rest: sym === '0', notes: [], techs: [], finger: null, shoga: null, token: null };
    if (!ev.rest) {
      const string = KOTO_STRING[sym] || Number(sym);
      const press = Math.min(3, (body.match(/#/g) || []).length);
      ev.notes.push({ string, press });
      if (/s/.test(body.slice(1))) ev.techs.push('kaki');
      if (/i/.test(body.slice(1))) ev.techs.push('hiki');
      if (/o/.test(body.slice(1))) ev.techs.push('ato');
      const f = /([abc])/.exec(body.slice(1));
      if (f) ev.finger = { a: 1, b: 2, c: 3 }[f[1]];
    }
    const syl = kuchi >= 0 ? (fields[kuchi] || '').trim() : '.';
    if (!ev.rest && syl && syl !== '.' && !syl.startsWith('*')) ev.shoga = syl;
    events.push(ev);
    if (!ev.rest) last = ev;
    t += d;
  }
  if (spine < 0) throw new Error('No **koto spine found in this file.');
  return { title, tuning, timeSig, events: normalizeEvents(events, timeSig) };
}
