// Converts David Huron's Humdrum encoding of "Japanese Popular Music"
// (Y. Nagai & K. Kobatake, Osaka: S. Miki & Co., 1892) into KotoLab songs.
//
//   node scripts/import-nippon.mjs <folder with nippon01.krn … nippon28.krn>
//
// Writes js/songs-meiji.js. Grace notes and editorial marks are dropped,
// ties are merged, octave doublings are kept as two-string chords
// (awase-zume), and pickup bars are padded with a rest so bar lines line up.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { kernPitch } from '../js/importers.js';
import { eventsToText, normalizeEvents, barBeats } from '../js/notation.js';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/import-nippon.mjs <dir>');

// Japanese titles where the romanisation in the source is unambiguous
const JP = {
  'Gonbe ga Tanemaku': '権兵衛が種まく',
  'Toka-Ebisu': '十日戎',
  'Oedo-Nihonbashi': 'お江戸日本橋',
  'Riukiu-Bushi': '琉球節',
  'Kappore': 'かっぽれ',
  'Kuro-Kami': '黒髪',
  'O_tsue-Bushi': '大津絵節',
  'Iyo-Bushi': '伊予節',
  'Murasaki': '紫',
  'Na no Ha': '菜の葉',
  'Dodoitsu': '都々逸',
  'Echigo-Jishi': '越後獅子',
  'Fuku-Ju-So': '福寿草',
  'Ukiyo-Bushi': '浮世節',
};

const ABOUT = {
  'Kuro-Kami': 'Kurokami (“Black Hair”) is one of the best-known jiuta pieces, sung with shamisen or koto. This is the 1892 staff transcription of its melody.',
  'Oedo-Nihonbashi': 'A travelling song about setting out from Nihonbashi in Edo along the Tōkaidō road, still sung by children today.',
  'Echigo-Jishi': 'The lion-dance song from Echigo, known from both nagauta and jiuta versions.',
  'Kappore': 'A lively Edo-period street dance song.',
  'Dodoitsu': 'A short lyric form of popular song (7-7-7-5 syllables) that was hugely popular in the late Edo and Meiji periods.',
  'Gonbe ga Tanemaku': 'A comic folk song: Gonbe sows the seeds and the crows dig them up.',
};

function parseFile(text) {
  const meta = {};
  let timeSig = [4, 4];
  const events = [];
  let t = 0;
  let firstBarEnd = null;
  let barCount = 0;
  let tieOpen = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const m = /^!!!(\w+):\s*(.*)$/.exec(raw);
    if (m) { meta[m[1]] = m[2]; continue; }
    if (raw.startsWith('!')) continue;
    const [k = '', syl = '.'] = raw.split('\t');
    if (k.startsWith('**') || k === '*-') continue;
    if (k.startsWith('*')) {
      const ms = /^\*M(\d+)\/(\d+)/.exec(k);
      if (ms) timeSig = [Number(ms[1]), Number(ms[2])];
      continue;
    }
    if (k.startsWith('=')) {
      barCount++;
      if (barCount === 2 && firstBarEnd == null) firstBarEnd = t;
      continue;
    }
    if (k === '.') continue;
    const subtokens = k.split(' ').filter((x) => !/[qQ]/.test(x)); // drop grace notes
    if (!subtokens.length) continue;
    let dur = null, rest = false, tieStart = false, tieEnd = false, tieMid = false;
    const pitches = [];
    for (const st of subtokens) {
      const nm = /(\d+)(\.*)([a-gA-G]+|r)([#\-n]*)/.exec(st);
      if (!nm) continue;
      let d = 4 / Number(nm[1]);
      if (nm[2] === '.') d *= 1.5;
      else if (nm[2] === '..') d *= 1.75;
      dur = dur == null ? d : Math.max(dur, d);
      if (nm[3] === 'r') { rest = true; continue; }
      const p = kernPitch(nm[3] + nm[4].replace('n', ''));
      if (p != null && !pitches.includes(p)) pitches.push(p);
      if (st.includes('[')) tieStart = true;
      if (st.includes(']')) tieEnd = true;
      if (st.includes('_')) tieMid = true;
    }
    if (dur == null) continue;
    if ((tieEnd || tieMid) && tieOpen) {
      if (tieOpen.bar === barCount) {
        tieOpen.d += dur; // tie inside the bar: one longer note
      } else {
        // tie across the bar line: the koto string simply keeps ringing,
        // which a koto score shows as a held/empty beat rather than a new pluck
        events.push({ t, d: dur, rest: true, notes: [], techs: [], finger: null, shoga: null, token: null, bar: barCount });
      }
      t += dur;
      if (tieEnd) tieOpen = null;
      continue;
    }
    const ev = { bar: barCount, t, d: dur, rest: rest && !pitches.length, notes: pitches.sort((a, b) => b - a).map((p) => ({ pitch: p })), techs: [], finger: null, shoga: null, token: null };
    const s = syl && syl !== '.' ? syl.replace(/[\s@#~|%?!;:]/g, '').replace(/\\_/g, '').replace(/^-|-$/g, '') : '';
    if (s && !ev.rest) ev.shoga = s;
    events.push(ev);
    if (tieStart) tieOpen = ev;
    t += dur;
  }
  // Lay the source bars out one by one so every bar line lands where the
  // 1892 score puts it. A short first bar is a pickup (padded at the start);
  // other irregular bars (a few in the source are short or long) are padded
  // with rest at the end up to whole bars.
  const bb = barBeats(timeSig);
  const groups = new Map();
  for (const e of events) {
    if (!groups.has(e.bar)) groups.set(e.bar, []);
    groups.get(e.bar).push(e);
  }
  let cursor = 0;
  let first = true;
  for (const bar of [...groups.keys()].sort((a, b) => a - b)) {
    const evs = groups.get(bar);
    const start = Math.min(...evs.map((e) => e.t));
    const len = evs.reduce((sum, e) => sum + e.d, 0);
    if (len <= 1e-6) continue;
    const pad = first && len < bb - 1e-6 ? bb - len : 0;
    for (const e of evs) e.t = cursor + pad + (e.t - start);
    cursor += Math.max(1, Math.ceil((pad + len) / bb - 1e-6)) * bb;
    first = false;
  }
  void firstBarEnd;
  return { meta, timeSig, events: normalizeEvents(events, timeSig) };
}

const files = readdirSync(dir).filter((f) => /^nippon\d+\.krn$/.test(f)).sort();
const songs = files.map((f) => {
  const { meta, timeSig, events } = parseFile(readFileSync(join(dir, f), 'utf8'));
  const title = (meta.OTL || f).replace(/\\_/g, '_');
  const nice = title.replace(/_/g, '').replace(/-/g, ' ');
  const lows = events.filter((e) => !e.rest).map((e) => e.notes[e.notes.length - 1].pitch);
  return {
    id: 'meiji-' + f.replace(/\D/g, ''),
    title: nice,
    jp: JP[title] || '',
    composer: 'Traditional (Meiji-era transcription, 1892)',
    category: 'Meiji-era songs (1892)',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: timeSig[0] === 2 ? 88 : 76,
    timeSig,
    syllables: 'Lyrics',
    about: (ABOUT[title] ? ABOUT[title] + ' ' : '') +
      `From “Japanese Popular Music” (Nagai & Kobatake, Osaka 1892, ${meta.PPG || ''}), a collection of popular songs of the time transcribed for staff notation; the original was for voice with koto or shamisen. Humdrum encoding by David Huron.`,
    score: '\n' + eventsToText(events, timeSig, 'pitch'),
    range: [Math.min(...lows), Math.max(...events.filter((e) => !e.rest).map((e) => e.notes[0].pitch))],
  };
});

const header = `// Generated by scripts/import-nippon.mjs — do not edit by hand.
// Source: Y. Nagai & K. Kobatake, "Japanese Popular Music: A Collection of
// the Popular Music of Japan Rendered into the Staff Notation" (Osaka: S. Miki
// & Co., 1892; public domain). Humdrum encoding by David Huron (2000).
`;
writeFileSync(new URL('../js/songs-meiji.js', import.meta.url), header + 'export const MEIJI_SONGS = ' + JSON.stringify(songs.map(({ range, ...s }) => s), null, 2) + ';\n');
for (const s of songs) console.log(s.id, s.title, s.timeSig.join('/'), 'range', s.range.join('–'));
