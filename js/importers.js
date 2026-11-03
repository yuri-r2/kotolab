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

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const tag = (src, name) => { const m = src.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`)); return m ? m[1].trim() : null; };
const decode = (s) => s && s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/**
 * Read an uncompressed MusicXML score (partwise), as exported by MuseScore,
 * Finale, Sibelius, Dorico and most notation apps. Takes one part, one voice
 * (the first), merges ties, keeps chords, the first verse of lyrics, the first
 * time signature and tempo, and pads a pickup bar so bar lines line up.
 * Works without a DOM, so it runs in the browser and in Node scripts.
 */
export function parseMusicXML(text, { part = 0 } = {}) {
  if (/<score-timewise\b/.test(text)) throw new Error('Timewise MusicXML is not supported; export as partwise.');
  if (!/<score-partwise\b/.test(text)) throw new Error('This is not a MusicXML score (compressed .mxl files need unzipping first).');
  const parts = [...text.matchAll(/<part\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/part>/g)];
  if (!parts.length) throw new Error('No parts found in this MusicXML file.');
  const partNames = [...text.matchAll(/<score-part\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/score-part>/g)].map((m) => decode(tag(m[2], 'part-name')) || m[1]);
  const body = parts[Math.min(part, parts.length - 1)][2];
  const title = decode(tag(text, 'work-title') || tag(text, 'movement-title') || '');
  const composer = decode((text.match(/<creator[^>]*type="composer"[^>]*>([^<]*)<\/creator>/) || [])[1] || '');
  let divisions = 1, timeSig = null, tempo = null, fifths = 0, voice = null;
  const events = [];
  let t = 0;          // in quarter notes
  let firstBarLen = null;
  let barStart = 0, barMax = 0;
  const measures = [...body.matchAll(/<measure\b([^>]*)>([\s\S]*?)<\/measure>/g)];
  measures.forEach((mm, mi) => {
    const attrs = mm[1];
    barStart = t; barMax = t;
    // walk the measure's children in order
    for (const el of mm[2].matchAll(/<(attributes|note|backup|forward|direction|sound)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/g)) {
      const kind = el[1];
      const inner = el[2] || '';
      if (kind === 'attributes') {
        const dv = tag(inner, 'divisions'); if (dv) divisions = Number(dv);
        const beats = tag(inner, 'beats'), bt = tag(inner, 'beat-type');
        if (beats && bt && !timeSig) timeSig = [Number(beats), Number(bt)];
        const f = tag(inner, 'fifths'); if (f != null && mi === 0) fifths = Number(f);
      } else if (kind === 'direction' || kind === 'sound') {
        const pm = (el[0].match(/tempo="([\d.]+)"/) || [])[1] || tag(inner, 'per-minute');
        if (pm && tempo == null) tempo = Math.round(Number(pm));
      } else if (kind === 'backup') {
        t -= Number(tag(inner, 'duration') || 0) / divisions;
      } else if (kind === 'forward') {
        t += Number(tag(inner, 'duration') || 0) / divisions;
        barMax = Math.max(barMax, t);
      } else if (kind === 'note') {
        if (/<grace\b/.test(inner) || /<cue\s*\/>/.test(inner)) continue;
        const v = tag(inner, 'voice') || '1';
        const isChord = /<chord\s*\/>/.test(inner);
        const d = Number(tag(inner, 'duration') || 0) / divisions;
        if (voice == null) voice = v;
        if (v !== voice) { if (!isChord) t += d; barMax = Math.max(barMax, t); continue; }
        const rest = /<rest\b/.test(inner);
        let pitch = null;
        if (!rest) {
          const p = tag(inner, 'pitch');
          if (p) {
            const step = tag(p, 'step'), oct = Number(tag(p, 'octave')), alter = Number(tag(p, 'alter') || 0);
            pitch = 12 * (oct + 1) + STEP[step] + Math.round(alter);
          }
        }
        const tieStop = /<tie\s+type="stop"/.test(inner);
        const lyricBlock = (inner.match(/<lyric\b[^>]*>([\s\S]*?)<\/lyric>/) || [])[1];
        const lyric = lyricBlock ? decode(tag(lyricBlock, 'text')) : null;
        if (isChord) {
          const prev = events[events.length - 1];
          if (prev && !prev.rest && pitch != null && !prev.notes.some((n) => n.pitch === pitch)) prev.notes.push({ pitch });
          continue;
        }
        const prev = events[events.length - 1];
        if (tieStop && prev && !prev.rest && pitch != null && prev.notes.some((n) => n.pitch === pitch) && Math.abs(prev.t + prev.d - t) < EPS) {
          prev.d += d;
        } else if (d > 0) {
          events.push({ t, d, rest: rest || pitch == null, notes: rest || pitch == null ? [] : [{ pitch }], techs: [], finger: null, shoga: lyric || null, token: null });
        }
        t += d;
        barMax = Math.max(barMax, t);
      }
    }
    t = Math.max(t, barMax);
    if (mi === 0) firstBarLen = t - barStart;
  });
  timeSig = timeSig || [4, 4];
  const bb = barBeats(timeSig);
  // pickup: a short first bar is padded at the front so the bars line up
  const pad = firstBarLen != null && firstBarLen < bb - EPS && firstBarLen > EPS ? bb - firstBarLen : 0;
  for (const ev of events) ev.t += pad;
  // merge consecutive rests
  const merged = [];
  for (const ev of events) {
    const prev = merged[merged.length - 1];
    if (ev.rest && prev && prev.rest && Math.abs(prev.t + prev.d - ev.t) < EPS) prev.d += ev.d;
    else merged.push(ev);
  }
  // drop leading whole bars of rest
  const firstNote = merged.find((e) => !e.rest);
  const shift = firstNote ? Math.floor(firstNote.t / bb + EPS) * bb : 0;
  const out = merged.filter((e) => !(e.rest && e.t + e.d <= shift + EPS)).map((e) => ({ ...e, t: e.t - shift }));
  if (!out.some((e) => !e.rest)) throw new Error('No notes found in the first voice of this part.');
  return { title, composer, tempo, timeSig, fifths, parts: partNames, lyrics: out.some((e) => e.shoga), events: normalizeEvents(out, timeSig) };
}
