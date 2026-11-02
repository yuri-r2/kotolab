// KotoLab score text format.
//
//   s7q s7q s8h |            string 七 quarter, 七 quarter, 八 half
//   s9p2e                    string 九 pressed a whole step (p1 half, p2 whole, p3 1½), eighth
//   E4q F#4e Bb3h            pitches (for songs that KotoLab arranges for any tuning)
//   s1+s5q                   chord (合せ爪)
//   rq                       quarter rest
//   s5h@hiki ~te-n           technique and kuchi-shōga
//   s3e@kaki#2               finger: #1 thumb, #2 index, #3 middle, #L left hand
//   s5q -h                   "-" extends the previous note
//   % comment                ignored to end of line
//
// Durations (in quarter-note beats): w 4, h 2, q 1, e ½, s ¼, t ⅛.
// Add "." for dotted, ".." double dotted, "3" for a triplet value (e3 = ⅓).
// If a duration is omitted the previous one is reused.

import { parsePitch } from './tunings.js';
import { TECHNIQUE_ALIASES } from './techniques.js';

const DUR = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 0.125 };
const EPS = 1e-6;

const ITEM = String.raw`(?:s\d{1,2}(?:p[123])?|[A-G](?:#|b|♯|♭)*-?\d|r)`;
const TOKEN_RE = new RegExp(String.raw`^(${ITEM}(?:\+${ITEM})*)([whqest](?:\.{1,2}|3)?)?(.*)$`);

export class ScoreError extends Error {
  constructor(message, token, index) {
    super(message);
    this.token = token;
    this.index = index;
  }
}

function parseDuration(code) {
  let d = DUR[code[0]];
  const rest = code.slice(1);
  if (rest === '.') d *= 1.5;
  else if (rest === '..') d *= 1.75;
  else if (rest === '3') d *= 2 / 3;
  return d;
}

function parseItem(item) {
  if (item === 'r') return { rest: true };
  if (item[0] === 's') {
    const m = /^s(\d{1,2})(?:p([123]))?$/.exec(item);
    const string = Number(m[1]);
    if (string < 1 || string > 13) throw new Error(`String number ${string} is outside 1–13`);
    return { string, press: m[2] ? Number(m[2]) : 0 };
  }
  const pitch = parsePitch(item.replace('♯', '#').replace('♭', 'b'));
  if (pitch == null) throw new Error(`“${item}” is not a pitch`);
  return { pitch };
}

function parseModifiers(text, ev) {
  const re = /@([a-z0-9]+)|#([123L])|~([^\s@#~]+)/gy;
  let pos = 0;
  while (pos < text.length) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) throw new Error(`Unexpected “${text.slice(pos)}”`);
    if (m[1]) {
      const tech = TECHNIQUE_ALIASES[m[1]];
      if (!tech) throw new Error(`Unknown technique @${m[1]}`);
      ev.techs.push(tech);
    } else if (m[2]) {
      ev.finger = m[2] === 'L' ? 'L' : Number(m[2]);
    } else if (m[3]) {
      ev.shoga = m[3];
    }
    pos = re.lastIndex;
  }
}

/**
 * Parse score text into a list of events.
 * Each event: { t, d, rest, notes:[{string?, press?, pitch?}], techs, finger, shoga, token }.
 */
export function parseScore(text) {
  const events = [];
  const warnings = [];
  let t = 0;
  let lastDur = 1;
  const lines = text.split('\n').map((l) => l.replace(/%.*$/, ''));
  const tokens = lines.join(' ').split(/\s+/).filter(Boolean);
  tokens.forEach((tok, index) => {
    if (tok === '|' || tok === '||' || tok === '|]') return;
    if (/^\[.*\]$/.test(tok)) return; // reserved for directives
    try {
      if (tok[0] === '-') {
        const dcode = tok.slice(1);
        const d = dcode ? parseDuration(dcode) : lastDur;
        if (dcode && !/^[whqest](\.{1,2}|3)?$/.test(dcode)) throw new Error(`Bad duration “${dcode}”`);
        const prev = events[events.length - 1];
        if (!prev) throw new Error('“-” needs a note before it');
        prev.d += d;
        t += d;
        return;
      }
      const m = TOKEN_RE.exec(tok);
      if (!m) throw new Error(`Cannot read “${tok}”`);
      const items = m[1].split('+').map(parseItem);
      const d = m[2] ? parseDuration(m[2]) : lastDur;
      lastDur = d;
      const rest = items.every((it) => it.rest);
      const ev = { t, d, rest, notes: rest ? [] : items.filter((it) => !it.rest), techs: [], finger: null, shoga: null, token: index };
      parseModifiers(m[3] || '', ev);
      events.push(ev);
      t += d;
    } catch (err) {
      throw new ScoreError(err.message, tok, index);
    }
  });
  return { events, totalBeats: t, warnings };
}

export function barBeats(timeSig) {
  return (timeSig[0] * 4) / timeSig[1];
}

/** Beat unit for grouping: a dotted quarter in compound meters (6/8, 9/8, 12/8). */
export function beatUnit(timeSig) {
  return timeSig[1] === 8 && timeSig[0] % 3 === 0 ? 1.5 : 4 / timeSig[1];
}

/** Insert rests in gaps and pad the final bar so every bar is complete. */
export function normalizeEvents(events, timeSig) {
  const out = [];
  let t = 0;
  for (const ev of events.slice().sort((a, b) => a.t - b.t)) {
    if (ev.t > t + EPS) out.push(restEvent(t, ev.t - t));
    out.push(ev);
    t = Math.max(t, ev.t + ev.d);
  }
  const bb = barBeats(timeSig);
  const end = Math.ceil(t / bb - EPS) * bb;
  if (end > t + EPS) out.push(restEvent(t, end - t));
  return out;
}

function restEvent(t, d) {
  return { t, d, rest: true, notes: [], techs: [], finger: null, shoga: null, token: null };
}

/** Group events into bars. Returns [{ index, start, beats, events }]. */
export function toMeasures(events, timeSig) {
  const bb = barBeats(timeSig);
  const measures = [];
  for (const ev of events) {
    const index = Math.floor(ev.t / bb + EPS);
    while (measures.length <= index) measures.push({ index: measures.length, start: measures.length * bb, beats: bb, events: [] });
    measures[index].events.push(ev);
  }
  return measures;
}

export function barWarnings(events, timeSig) {
  const bb = barBeats(timeSig);
  const warnings = [];
  for (const ev of events) {
    const startBar = Math.floor(ev.t / bb + EPS);
    const endBar = Math.floor((ev.t + ev.d) / bb - EPS);
    if (endBar > startBar && !ev.rest) warnings.push(`Bar ${startBar + 1}: a note runs across the bar line.`);
  }
  return warnings;
}

const DUR_CODES = [
  [4, 'w'], [3, 'h.'], [2, 'h'], [1.5, 'q.'], [1, 'q'], [0.75, 'e.'], [0.5, 'e'], [0.375, 's.'], [0.25, 's'], [0.125, 't'],
];

function durationCode(d) {
  for (const [v, c] of DUR_CODES) if (Math.abs(v - d) < EPS) return [c];
  // decompose into tied parts
  const parts = [];
  let left = d;
  for (const [v, c] of DUR_CODES) {
    while (left >= v - EPS) { parts.push(c); left -= v; }
  }
  return parts.length ? parts : ['t'];
}

function pitchText(p) {
  const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  return names[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1);
}

/** Serialise events back to score text. mode: 'pitch' or 'strings'. */
export function eventsToText(events, timeSig, mode = 'pitch') {
  const bb = barBeats(timeSig);
  const out = [];
  let bar = 0;
  let line = [];
  for (const ev of events) {
    const b = Math.floor(ev.t / bb + EPS);
    while (b > bar) { line.push('|'); bar++; if (bar % 4 === 0) { out.push(line.join(' ')); line = []; } }
    const [first, ...ties] = durationCode(ev.d);
    let items;
    if (ev.rest) items = 'r';
    else if (mode === 'strings') items = ev.notes.map((n) => `s${n.string}${n.press ? 'p' + n.press : ''}`).join('+');
    else items = ev.notes.map((n) => pitchText(n.pitch)).join('+');
    let tok = items + first;
    for (const tech of ev.techs) tok += '@' + Object.keys(TECHNIQUE_ALIASES).find((k) => TECHNIQUE_ALIASES[k] === tech);
    if (ev.finger) tok += '#' + ev.finger;
    if (ev.shoga) tok += '~' + ev.shoga;
    line.push(tok, ...ties.map((c) => '-' + c));
  }
  line.push('|');
  out.push(line.join(' '));
  return out.join('\n');
}
