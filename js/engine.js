// Arrangement engine: maps a melody onto the 13 strings of a koto in a given
// tuning, choosing strings, left-hand presses (押し手) and right-hand fingers
// so the result is realistic to play.
//
// Model
//  * A note of pitch p can be played on string s if p − open(s) is 0 (open),
//    1 (ヲ half press), 2 (オ whole press) or, if allowed, 3. Presses only
//    raise the pitch, so a note below the lowest string can't be reached.
//  * The left hand can hold only one press at a time, and needs time to move
//    between strings. Chords may contain at most one pressed string.
//  * The right hand prefers small moves; big leaps in fast passages cost more.
//  * A dynamic-programming (Viterbi) search picks the cheapest path through
//    all candidate string choices, and an outer search tries transpositions.

import { STRING_NAMES, BRIDGE_RANGE, hiraPitches, pitchName } from './tunings.js';

export const PRESS_COST = [0, 1.6, 2.2, 7];

/** Five learning levels from the difficulty score (1–10). */
export const LEVEL_TIERS = [
  { number: 1, name: 'First pieces', max: 2.6, about: 'Open strings or almost; slow and steady.' },
  { number: 2, name: 'Beginner', max: 3.4, about: 'A few presses and quicker notes.' },
  { number: 3, name: 'Intermediate', max: 4.4, about: 'Regular presses, techniques such as kaki-zume and after-presses.' },
  { number: 4, name: 'Upper intermediate', max: 5.4, about: 'Busy left hand, fast passages and leaps.' },
  { number: 5, name: 'Advanced', max: 99, about: 'Chromatic lines, many presses at speed.' },
];

export function levelFor(difficulty) {
  return LEVEL_TIERS.find((l) => difficulty <= l.max) || LEVEL_TIERS[LEVEL_TIERS.length - 1];
}
const OCTAVE_SHIFT_COST = 10;
const OMIT_COST = 40;
const LH_TECHS = new Set(['ato', 'ato1', 'hiki', 'tsuki', 'yuri', 'hanashi']);
const MAX_COMBOS = 64;

const sec = (beats, tempo) => (beats * 60) / tempo;

/** Fill in note.pitch for string-notated events using the tuning they were written for. */
export function resolvePitches(events, openPitches) {
  return events.map((ev) => ({
    ...ev,
    notes: ev.notes.map((n) => (n.pitch != null ? { ...n } : { ...n, authoredString: n.string, authoredPress: n.press || 0, pitch: openPitches[n.string - 1] + (n.press || 0) })),
  }));
}

function noteCandidates(pitch, open, ev, maxPress, keep) {
  const kaki = ev.techs.includes('kaki') || ev.techs.includes('wari');
  const needsPress = ev.techs.includes('hanashi');
  const ato = ev.techs.includes('ato') ? 2 : ev.techs.includes('ato1') ? 1 : 0;
  const list = [];
  const tryPitch = (p, extra, shifted) => {
    for (let s = 0; s < 13; s++) {
      const d = p - open[s];
      if (d < 0 || d > maxPress) continue;
      if (kaki && (d > 0 || s === 12)) continue;
      if (ato && d + ato > maxPress) continue;
      if (needsPress && d === 0) continue;
      let cost = PRESS_COST[d] + extra + (s === 0 ? 0.01 : 0);
      list.push({ string: s + 1, press: d, pitch: p, cost, shifted });
    }
  };
  if (keep && keep.string && open[keep.string - 1] + keep.press === pitch) {
    return [{ string: keep.string, press: keep.press, pitch, cost: PRESS_COST[keep.press] || 0, shifted: 0 }];
  }
  tryPitch(pitch, 0, 0);
  if (!list.length) {
    tryPitch(pitch + 12, OCTAVE_SHIFT_COST, 12);
    tryPitch(pitch - 12, OCTAVE_SHIFT_COST, -12);
  }
  if (!list.length && needsPress) {
    // fall back to a plain note if no pressed option exists
    return noteCandidates(pitch, open, { ...ev, techs: ev.techs.filter((t) => t !== 'hanashi') }, maxPress, keep);
  }
  if (!list.length) list.push({ string: null, press: 0, pitch, cost: OMIT_COST, omitted: true, shifted: 0 });
  return list;
}

function comboCost(notes) {
  let cost = 0;
  const strings = new Set();
  let pressed = 0;
  let lo = 99, hi = -1;
  for (const n of notes) {
    cost += n.cost;
    if (n.string != null) {
      if (strings.has(n.string)) return Infinity;
      strings.add(n.string);
      lo = Math.min(lo, n.string);
      hi = Math.max(hi, n.string);
    }
    if (n.press > 0) pressed++;
  }
  if (pressed > 1) cost += 12;
  if (notes.length > 1) {
    const span = hi - lo;
    if (span > 9) cost += (span - 9) * 2;
    if (notes.length > 3) cost += 3 * (notes.length - 3);
  }
  return cost;
}

function eventCombos(ev, open, opts) {
  const per = ev.notes.map((n) => noteCandidates(n.pitch + opts.transpose, open, ev, opts.maxPress, opts.keepStrings && n.authoredString ? { string: n.authoredString, press: n.authoredPress } : null));
  let combos = [[]];
  for (const cands of per) {
    const next = [];
    for (const c of combos) for (const cand of cands) next.push([...c, cand]);
    next.sort((a, b) => a.reduce((s, n) => s + n.cost, 0) - b.reduce((s, n) => s + n.cost, 0));
    combos = next.slice(0, MAX_COMBOS);
  }
  const valid = combos
    .map((notes) => ({ notes, cost: comboCost(notes), center: center(notes), lh: leftHandStrings(notes, ev) }))
    .filter((c) => Number.isFinite(c.cost));
  if (valid.length) return valid;
  // no way to play every note of this chord on separate strings (e.g. two
  // notes that only one string can reach): keep the top note, drop the rest
  return per[0].map((cand) => {
    const notes = [cand, ...per.slice(1).map((c) => ({ string: null, press: 0, pitch: c[0].pitch, cost: OMIT_COST / 4, omitted: true, shifted: 0 }))];
    return { notes, cost: comboCost(notes), center: center(notes), lh: leftHandStrings(notes, ev) };
  });
}

function center(notes) {
  const s = notes.filter((n) => n.string != null).map((n) => n.string);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

function leftHandStrings(notes, ev) {
  const lhTech = ev.techs.some((t) => LH_TECHS.has(t));
  return notes.filter((n) => n.string != null && (n.press > 0 || lhTech)).map((n) => n.string);
}

function transitionCost(prev, cur, dt) {
  let cost = 0;
  if (prev.center != null && cur.center != null) {
    const move = Math.abs(cur.center - prev.center);
    cost += 0.06 * move;
    if (dt < 0.35 && move > 5) cost += 0.3 * (move - 5);
  }
  for (const s of cur.lh) {
    if (prev.lh.includes(s)) continue;
    if (prev.lh.length) {
      const dist = Math.min(...prev.lh.map((p) => Math.abs(p - s)));
      const base = dt < 0.2 ? 4 : dt < 0.4 ? 1.8 : dt < 0.8 ? 0.6 : 0.2;
      cost += base * (dist > 3 ? 1.3 : 1);
    } else if (dt < 0.12) {
      cost += 0.8;
    }
  }
  return cost;
}

/**
 * Arrange events for one tuning and transposition.
 * opts: { open: number[13], transpose, tempo, maxPress, keepStrings }
 * Returns { events, cost, stats, issues, transpose }.
 */
export function fitArrangement(events, opts) {
  const o = { transpose: 0, tempo: 80, maxPress: 2, keepStrings: false, ...opts };
  const sounding = events.filter((e) => !e.rest && e.notes.length);
  const layers = sounding.map((ev) => eventCombos(ev, o.open, o));
  const cost = layers.map((l) => l.map((c) => c.cost));
  const back = layers.map((l) => l.map(() => -1));
  for (let i = 1; i < layers.length; i++) {
    const dt = sec(sounding[i].t - sounding[i - 1].t, o.tempo);
    for (let j = 0; j < layers[i].length; j++) {
      let best = Infinity, arg = -1;
      for (let k = 0; k < layers[i - 1].length; k++) {
        const c = cost[i - 1][k] + transitionCost(layers[i - 1][k], layers[i][j], dt);
        if (c < best) { best = c; arg = k; }
      }
      cost[i][j] += best;
      back[i][j] = arg;
    }
  }
  const path = new Array(layers.length);
  let total = 0;
  if (layers.length) {
    const last = layers.length - 1;
    let arg = 0;
    cost[last].forEach((c, j) => { if (c < cost[last][arg]) arg = j; });
    total = cost[last][arg];
    for (let i = last; i >= 0; i--) { path[i] = arg; arg = back[i][arg]; }
  }
  const chosen = new Map();
  sounding.forEach((ev, i) => chosen.set(ev, layers[i][path[i]]));
  const out = events.map((ev) => {
    if (ev.rest || !ev.notes.length) return { ...ev, notes: [] };
    const combo = chosen.get(ev);
    return {
      ...ev,
      notes: combo.notes.map((n, idx) => ({
        ...ev.notes[idx],
        target: ev.notes[idx].pitch + o.transpose,
        pitch: n.pitch,
        string: n.string,
        press: n.press,
        shifted: n.shifted || 0,
        omitted: !!n.omitted,
      })),
    };
  });
  assignFingers(out, o.tempo);
  const { stats, issues } = analyse(out, sounding.map((ev) => chosen.get(ev)), o);
  return { events: out, cost: total, stats, issues, transpose: o.transpose, open: o.open.slice() };
}

/** Right-hand fingering: 1 thumb, 2 index, 3 middle, 'L' left hand. */
export function assignFingers(events, tempo) {
  const sounding = events.filter((e) => !e.rest && e.notes.length && e.notes.some((n) => n.string));
  // chords and fixed techniques
  const fixed = sounding.map((ev) => {
    const strings = ev.notes.filter((n) => n.string).map((n) => n.string);
    if (ev.techs.includes('left')) return 'L';
    if (ev.finger && ev.notes.every((n) => !n.authoredString || n.authoredString === n.string)) return ev.finger;
    if (strings.length > 1) return 'chord';
    if (ev.techs.includes('kaki')) return 3;
    if (ev.techs.includes('sukui')) return 1;
    return null;
  });
  const F = [1, 2, 3];
  const base = { 1: 0, 2: 0.9, 3: 0.7 };
  const n = sounding.length;
  if (!n) return;
  const cost = [], back = [];
  const str = (ev) => ev.notes.find((x) => x.string).string;
  for (let i = 0; i < n; i++) {
    const ev = sounding[i];
    const s = str(ev);
    const prev = i > 0 ? sounding[i - 1] : null;
    const dt = prev ? sec(ev.t - prev.t, tempo) : 9;
    const ps = prev ? str(prev) : s;
    cost.push({}); back.push({});
    for (const f of F) {
      const free = !fixed[i] || fixed[i] === 'chord' || fixed[i] === 'L';
      if (!free && fixed[i] !== f) { cost[i][f] = Infinity; continue; }
      let c = base[f];
      if (fixed[i] === 'chord' || fixed[i] === 'L') c = 0;
      // reaching far toward string 一 from the upper strings: middle finger
      if (s < ps - 4) c += f === 1 ? 0.8 : f === 3 ? -0.5 : 0.2;
      if (s <= 3 && ps >= 8 && f === 3) c -= 0.3;
      if (i === 0) { cost[i][f] = c; continue; }
      let best = Infinity, arg = 1;
      for (const pf of F) {
        const prevCost = cost[i - 1][pf];
        if (!Number.isFinite(prevCost)) continue;
        let tc = 0;
        const pff = fixed[i - 1] === 'chord' ? 1 : pf;
        if (dt < 0.24 && pff === f && s !== ps) {
          // the thumb comes to rest on the next string toward 一, so moving there is natural
          if (f === 1 && s === ps - 1) tc = 0;
          else if (f !== 1 && s === ps + 1) tc = 0.2;
          else tc = f === 1 ? 0.8 : 1.2;
        }
        if (dt < 0.24 && pff === 1 && f === 2) tc -= 0.3; // thumb–index alternation
        if (prevCost + tc < best) { best = prevCost + tc; arg = pf; }
      }
      cost[i][f] = best + c;
      back[i][f] = arg;
    }
  }
  let f = F.reduce((a, b) => (cost[n - 1][b] < cost[n - 1][a] ? b : a), 1);
  for (let i = n - 1; i >= 0; i--) {
    const ev = sounding[i];
    if (fixed[i] === 'chord') setChordFingers(ev);
    else {
      const finger = fixed[i] || f;
      ev.notes.forEach((x) => { x.finger = finger; });
    }
    f = back[i][f] || 1;
  }
}

function setChordFingers(ev) {
  const ordered = ev.notes.filter((n) => n.string).sort((a, b) => b.string - a.string);
  const order = ordered.length === 2 ? [1, 3] : [1, 2, 3, 3];
  ordered.forEach((n, i) => { n.finger = order[i] || 3; });
}

function analyse(events, combos, o) {
  const stats = { notes: 0, open: 0, half: 0, whole: 0, triple: 0, shifted: 0, omitted: 0, notesPerSecond: 0 };
  const issues = [];
  const bb = o.barBeats || 4;
  const bar = (ev) => Math.floor(ev.t / bb + 1e-6) + 1;
  let prevEv = null, prevCombo = null, ci = 0;
  for (const ev of events) {
    if (ev.rest || !ev.notes.length) continue;
    const combo = combos[ci++];
    for (const n of ev.notes) {
      stats.notes++;
      if (n.omitted) { stats.omitted++; issues.push({ bar: bar(ev), level: 'error', text: `${pitchName(n.target)} can’t be reached in this tuning and was left out.` }); continue; }
      if (n.shifted) { stats.shifted++; issues.push({ bar: bar(ev), level: 'warn', text: `${pitchName(n.target)} is out of range; moved ${n.shifted > 0 ? 'up' : 'down'} an octave.` }); }
      if (n.press === 0) stats.open++;
      else if (n.press === 1) stats.half++;
      else if (n.press === 2) stats.whole++;
      else { stats.triple++; issues.push({ bar: bar(ev), level: 'warn', text: `${STRING_NAMES[n.string - 1]} needs a step-and-a-half press (very deep).` }); }
    }
    if (ev.notes.filter((n) => n.press > 0).length > 1) issues.push({ bar: bar(ev), level: 'warn', text: 'Chord needs two pressed strings at once; play one of them open or drop it.' });
    if (prevEv && prevCombo) {
      const dt = sec(ev.t - prevEv.t, o.tempo);
      const moved = combo.lh.filter((s) => !prevCombo.lh.includes(s));
      if (moved.length && prevCombo.lh.length && dt < 0.4) {
        issues.push({ bar: bar(ev), level: dt < 0.2 ? 'warn' : 'info', text: `Left hand moves from ${STRING_NAMES[prevCombo.lh[0] - 1]} to ${STRING_NAMES[moved[0] - 1]} in ${dt.toFixed(2)} s. Practise this change slowly.` });
      }
    }
    prevEv = ev; prevCombo = combo;
  }
  const sounding = events.filter((e) => !e.rest && e.notes.length);
  const dur = sounding.length ? sec(sounding[sounding.length - 1].t - sounding[0].t + sounding[sounding.length - 1].d, o.tempo) : 1;
  stats.notesPerSecond = sounding.length / Math.max(dur, 1);
  const pressed = stats.half + stats.whole * 1.3 + stats.triple * 3;
  const pressRatio = stats.notes ? pressed / stats.notes : 0;
  // techniques beyond a plain pluck, two-string strokes and length all add work
  const TECH_WEIGHT = { kaki: 1, wari: 1.3, hiki: 1, tsuki: 0.8, yuri: 0.8, ato: 1, ato1: 1, hanashi: 1, sukui: 0.5, suri: 1, keshi: 0.3, left: 0.6 };
  const techLoad = sounding.reduce((sum, e) => sum + e.techs.reduce((a, t) => a + (TECH_WEIGHT[t] || 0), 0), 0);
  const chords = sounding.filter((e) => e.notes.filter((n) => n.string).length > 1).length;
  const techRatio = sounding.length ? techLoad / sounding.length : 0;
  const chordRatio = sounding.length ? chords / sounding.length : 0;
  const bars = sounding.length ? (sounding[sounding.length - 1].t + sounding[sounding.length - 1].d) / bb : 0;
  stats.techniques = Math.round(techLoad);
  stats.chords = chords;
  const difficulty = Math.max(1, Math.min(10, 1 + pressRatio * 8 + stats.notesPerSecond * 0.9 + techRatio * 5 + chordRatio * 1.5 + Math.min(1, bars / 60) * 0.6 +
    (stats.shifted + stats.omitted * 3) * 0.3 + issues.filter((i) => i.level === 'warn').length * 0.15));
  stats.difficulty = Math.round(difficulty * 10) / 10;
  const lv = levelFor(stats.difficulty);
  stats.levelNumber = lv.number;
  stats.level = lv.name;
  return { stats, issues };
}

/** Search transpositions (−12…+12) and return the most playable arrangement. */
export function fitBest(events, opts) {
  const range = opts.range ?? 12;
  let best = null;
  const all = [];
  for (let t = -range; t <= range; t++) {
    const res = fitArrangement(events, { ...opts, transpose: t, keepStrings: opts.keepStrings && t === 0 });
    const score = res.cost + 0.12 * Math.abs(t) + (t % 12 === 0 ? 0 : 0.05);
    all.push({ transpose: t, score, stats: res.stats });
    if (!best || score < best.score) best = { ...res, score };
  }
  best.alternatives = all.sort((a, b) => a.score - b.score).slice(0, 5);
  return best;
}

/**
 * Adjust bridges (custom tuning) to suit a song, starting from a preset.
 * Moves single strings by ±1/±2 semitones while staying realistic, keeping
 * the change only if the arrangement gets cheaper. Each moved bridge costs a
 * little so the result stays close to the starting tuning.
 */
export function optimizeTuning(events, opts) {
  const base = opts.base || 0;
  const hira = hiraPitches(base);
  const start = opts.open.slice();
  const lo = hira.map((p) => p - BRIDGE_RANGE.down);
  const hi = hira.map((p) => p + BRIDGE_RANGE.up);
  const penalty = (open) => open.reduce((s, p, i) => s + 0.6 * Math.abs(p - start[i]), 0);
  const evaluate = (open) => fitArrangement(events, { ...opts, open, keepStrings: false }).cost + penalty(open);
  let cur = start.slice();
  let curCost = evaluate(cur);
  for (let iter = 0; iter < 24; iter++) {
    let improved = false;
    for (let s = 0; s < 13; s++) {
      for (const d of [-1, 1, -2, 2]) {
        const p = cur[s] + d;
        if (p < lo[s] || p > hi[s]) continue;
        if (s >= 2 && p < cur[s - 1]) continue;
        if (s >= 1 && s < 12 && p > cur[s + 1]) continue;
        if (s === 1 && p > cur[2]) continue;
        const trial = cur.slice();
        trial[s] = p;
        const c = evaluate(trial);
        if (c < curCost - 0.05) { cur = trial; curCost = c; improved = true; }
      }
    }
    if (!improved) break;
  }
  return { open: cur, cost: curCost, moves: cur.map((p, i) => ({ string: i + 1, from: start[i], to: p })).filter((m) => m.from !== m.to) };
}

/** Rank preset tunings (plus a custom bridge tuning) for a song. */
export function recommendTunings(events, tunings, opts) {
  const base = opts.base || 0;
  const results = tunings.map((tuning) => {
    const open = tuning.strings.map((p) => p + (tuning.user ? tuning.base : base));
    const best = fitBest(events, { ...opts, open, keepStrings: opts.keepFor === tuning.id });
    return { tuning, transpose: best.transpose, score: best.score, stats: best.stats };
  });
  results.sort((a, b) => a.score - b.score);
  return results;
}
