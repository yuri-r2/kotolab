// Koto tunings (調子, chōshi) and string metadata.
//
// Pitches are MIDI note numbers for the 壱越 (ichikotsu, D) base, the most
// common reference: string 1 = D4. Strings are numbered from the side of the
// instrument farthest from the player (一) to the nearest (巾).
//
// Sources: KORG WT-30 koto tuning chart; 美緒野会 "調弦基礎" tuning table
// (shamisen.info); Sapp & Deguchi, Humdrum **koto representation (hira-jōshi
// *tune[d:G:A:B-:d:e-:g:a:b-:dd:ee-:gg:aa]). See docs/RESEARCH.md.

export const STRING_COUNT = 13;

export const STRING_NAMES = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '斗', '為', '巾'];
// Yamada-school scores write the first strings with formal numerals.
export const STRING_NAMES_YAMADA = ['壱', '弐', '参', '四', '五', '六', '七', '八', '九', '十', '斗', '為', '巾'];
export const STRING_READINGS = ['ichi', 'ni', 'san', 'shi', 'go', 'roku', 'shichi', 'hachi', 'ku', 'jū', 'to', 'i', 'kin'];

// Hira-jōshi in D. Every other preset is derived from it by moving bridges.
const HIRA = [62, 55, 57, 58, 62, 63, 67, 69, 70, 74, 75, 79, 81];

function derive(changes) {
  const t = HIRA.slice();
  for (const [string, delta] of Object.entries(changes)) t[Number(string) - 1] += delta;
  return t;
}

export const TUNINGS = [
  {
    id: 'hira', name: 'Hira-jōshi', jp: '平調子',
    strings: HIRA.slice(),
    changes: {},
    character: 'Miyako-bushi (in) scale: D E♭ G A B♭. The standard solo tuning, codified by Yatsuhashi Kengyō (1614–1685).',
    usedFor: 'Rokudan no Shirabe, Sakura Sakura, most classical danmono',
  },
  {
    id: 'kumoi', name: 'Kumoi-jōshi', jp: '雲井調子',
    strings: derive({ 3: -1, 4: +2, 8: -1, 9: +2 }),
    changes: { 3: -1, 4: +2, 8: -1, 9: +2 },
    character: 'Hira-jōshi with strings 三・八 lowered a half step and 四・九 raised to C: D E♭ G A♭ C.',
    usedFor: 'Classical pieces with a darker colour',
  },
  {
    id: 'hankumoi', name: 'Han-kumoi-jōshi', jp: '半雲井調子',
    strings: derive({ 8: -1, 9: +2 }),
    changes: { 8: -1, 9: +2 },
    character: 'Half kumoi: only the upper octave (八・九) is changed, so low and high registers differ.',
    usedFor: 'Pieces that move between hira and kumoi colours',
  },
  {
    id: 'honkumoi', name: 'Hon-kumoi-jōshi', jp: '本雲井調子',
    strings: derive({ 3: -1, 4: +2, 8: -1, 9: +2, 13: -1 }),
    changes: { 3: -1, 4: +2, 8: -1, 9: +2, 13: -1 },
    character: 'Full kumoi: like kumoi-jōshi with 巾 also lowered to A♭.',
    usedFor: 'Classical kumoi repertoire',
  },
  {
    id: 'kokin', name: 'Kokin-jōshi', jp: '古今調子',
    strings: derive({ 4: +2, 9: +2 }),
    changes: { 4: +2, 9: +2 },
    character: 'Hira-jōshi with 四・九 raised to C: D E♭ G A C.',
    usedFor: 'Kokin-gumi pieces',
  },
  {
    id: 'nakazora', name: 'Nakazora-jōshi', jp: '中空調子',
    strings: derive({ 6: +1, 7: -2, 11: +1, 12: -2 }),
    changes: { 6: +1, 7: -2, 11: +1, 12: -2 },
    character: 'Hira-jōshi with 六・斗 raised to E and 七・為 lowered to F: D E F A B♭.',
    usedFor: 'Pieces centred on A',
  },
  {
    id: 'gaku', name: 'Gaku-jōshi', jp: '楽調子',
    strings: derive({ 4: +2, 6: +1, 9: +2, 11: +1 }),
    changes: { 4: +2, 6: +1, 9: +2, 11: +1 },
    character: 'Ritsu-like tuning without half steps: D E G A C. Also called aoba-jōshi.',
    usedFor: 'Hamabe no Uta, school songs, folk songs',
  },
  {
    id: 'nogi', name: 'Nogi-jōshi', jp: '乃木調子',
    strings: derive({ 4: +1, 6: +1, 9: +1, 11: +1 }),
    changes: { 4: +1, 6: +1, 9: +1, 11: +1 },
    character: 'Major pentatonic (yonanuki): G A B D E. The easiest tuning for Western major-key melodies.',
    usedFor: 'Akatonbo, Momiji, children’s songs, Western major-key tunes',
  },
];

// Base pitch (the note of string 一). 壱越 D is standard; players move every
// bridge together to change key. Wider shifts strain the strings, so the
// options stay within a few semitones (双調 G is reached by tuning string 一
// down a fourth, which is common for some ensemble repertoire).
export const BASES = [
  { offset: -7, name: 'G (双調 sōjō)' },
  { offset: -3, name: 'B (盤渉 banshiki)' },
  { offset: -2, name: 'C (神仙 shinsen)' },
  { offset: -1, name: 'C♯ (上無 kamimu)' },
  { offset: 0, name: 'D (壱越 ichikotsu)' },
  { offset: 1, name: 'E♭ (断金 tangin)' },
  { offset: 2, name: 'E (平調 hyōjō)' },
  { offset: 3, name: 'F (勝絶 shōsetsu)' },
];

// How far a single bridge can realistically move from its hira-jōshi place
// before the string is too slack or too tight to sound well.
export const BRIDGE_RANGE = { down: 4, up: 5 };

export function getTuning(id) {
  return TUNINGS.find((t) => t.id === id) || null;
}

export function tuningPitches(tuning, base = 0) {
  return tuning.strings.map((p) => p + base);
}

export function hiraPitches(base = 0) {
  return HIRA.map((p) => p + base);
}

/** Check a set of open-string pitches for physical realism. */
export function checkTuningRealism(pitches, base = 0) {
  const hira = hiraPitches(base);
  const issues = [];
  pitches.forEach((p, i) => {
    const d = p - hira[i];
    if (d > BRIDGE_RANGE.up || d < -BRIDGE_RANGE.down) {
      issues.push({ string: i + 1, message: `String ${STRING_NAMES[i]} is ${d > 0 ? '+' : ''}${d} semitones from its usual place; the bridge would sit too ${d > 0 ? 'close to the player (string too tight)' : 'far (string too slack)'}.` });
    }
  });
  for (let i = 2; i < pitches.length; i++) {
    if (pitches[i] < pitches[i - 1]) {
      issues.push({ string: i + 1, message: `String ${STRING_NAMES[i]} is lower than ${STRING_NAMES[i - 1]}; from 二 upward the strings should rise.` });
    }
  }
  return issues;
}

const NAMES_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const NAMES_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

export function pitchName(midi, { flats = true, octave = true } = {}) {
  const pc = ((midi % 12) + 12) % 12;
  const name = (flats ? NAMES_FLAT : NAMES_SHARP)[pc];
  return octave ? `${name}${Math.floor(midi / 12) - 1}` : name;
}

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Parse "C#4", "Bb3", "E♭5" into a MIDI number. Returns null if invalid. */
export function parsePitch(text) {
  const m = /^([A-Ga-g])([#♯b♭]*)(-?\d)$/.exec(text);
  if (!m) return null;
  let v = LETTER[m[1].toUpperCase()];
  for (const ch of m[2]) v += ch === '#' || ch === '♯' ? 1 : -1;
  return v + (Number(m[3]) + 1) * 12;
}

export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Custom tunings made by the player. Each is stored relative to the base
 * (string-一 pitch family) it is closest to, so realism checks and the
 * "compared with hira-jōshi" view stay meaningful even for low tunings.
 * They are added to TUNINGS so every part of the app can use them.
 */
export function makeUserTuning({ id, name, pitches }) {
  const base = bestBase(pitches);
  return {
    id: id || `user-${Date.now().toString(36)}`,
    name: name || 'My tuning',
    jp: '',
    user: true,
    base,
    strings: pitches.map((p) => p - base),
    changes: {},
    character: `Custom tuning: ${pitches.map((p) => pitchName(p, { octave: false })).join(' ')}.`,
    usedFor: 'Your own tuning',
  };
}

export function registerUserTunings(list) {
  for (let i = TUNINGS.length - 1; i >= 0; i--) if (TUNINGS[i].user) TUNINGS.splice(i, 1);
  TUNINGS.push(...list);
}

/** Absolute open pitches of a tuning (user tunings carry their own base). */
export function tuningOpen(tuning, base = 0) {
  return tuning.strings.map((p) => p + (tuning.user ? tuning.base : base));
}

/** The base offset (from BASES) whose hira-jōshi is closest to these pitches. */
export function bestBase(pitches) {
  let best = 0, bestErr = Infinity;
  for (const b of BASES) {
    const hira = hiraPitches(b.offset);
    const err = pitches.reduce((s, p, i) => s + Math.abs(p - hira[i]), 0);
    if (err < bestErr) { bestErr = err; best = b.offset; }
  }
  return best;
}
