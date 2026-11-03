// Writes koto-notation arrangements (string numbers, presses, techniques) of
// songs already in the library, in the tuning koto players would use, and
// adds common koto idioms:
//   * 合せ爪 awase-zume: long notes and the final note get the octave below
//     on another string (thumb + middle finger), the classic koto cadence;
//   * 掬い爪 sukui-zume: a quick repeated note on the same string is scooped
//     back with the thumb instead of a second full stroke.
//
//   node scripts/arrange-koto.mjs   → js/songs-koto.js

import { writeFileSync } from 'node:fs';
import { SONGS } from '../js/songs.js';
import { parseScore, normalizeEvents, barBeats, eventsToText } from '../js/notation.js';
import { getTuning } from '../js/tunings.js';
import { fitBest } from '../js/engine.js';

const SPECS = [
  { from: 'akatonbo', tuning: 'nogi', about: 'Akatonbo in nogi-jōshi, every note on an open string, with octave pairs (合せ爪) on the long notes.' },
  { from: 'auldlangsyne', tuning: 'nogi', title: 'Hotaru no Hikari', jp: '蛍の光', about: 'The farewell song sung at graduations in Japan (the tune of Auld Lang Syne), in nogi-jōshi with octave pairs at the ends of phrases.' },
  { from: 'kojo', tuning: 'hira', about: 'The opening of Kōjō no Tsuki in hira-jōshi, the tuning koto arrangements of this song usually use. Two notes need a press.' },
  { from: 'amazing', tuning: 'nogi', about: 'Amazing Grace fits nogi-jōshi on open strings; long notes are doubled an octave below with the middle finger.' },
  { from: 'meiji-25', tuning: 'hira', about: 'A Meiji-era dodoitsu melody that sits entirely on the open strings of hira-jōshi.' },
  { from: 'meiji-22', tuning: 'hira', about: 'Gosho no Oniwa (“In the Palace Garden”) from the 1892 collection, in hira-jōshi.' },
  { from: 'meiji-03', tuning: 'hira', about: 'The travelling song Oedo Nihonbashi in hira-jōshi, with a few half-step presses.' },
  { from: 'meiji-12', tuning: 'hira', about: 'Kurokami, a jiuta classic for voice with shamisen or koto, written out for koto in hira-jōshi. A good study in presses (押し手).' },
  { from: 'meiji-26', tuning: 'kumoi', about: 'Echigo-jishi in kumoi-jōshi: lively, with many presses — an intermediate study.' },
  { from: 'meiji-01', tuning: 'hira', about: 'Gonbe ga Tanemaku in hira-jōshi; quick eighth notes and leaps across the strings.' },
  { from: 'doyo-usagi', tuning: 'hira', title: 'Usagi', about: 'Usagi in hira-jōshi, the way koto teachers start beginners: almost every note on an open string, with one left-hand press near the end.' },
  { from: 'doyo-kagome', tuning: 'nogi', title: 'Kagome Kagome', about: 'Kagome Kagome in nogi-jōshi, all on open strings, with scooped repeats (掬い爪) on the quick repeated notes.' },
  { from: 'doyo-furusato', tuning: 'nogi', title: 'Furusato', about: 'Furusato in nogi-jōshi, with octave pairs (合せ爪) on the long notes at the ends of phrases.' },
  { from: 'doyo-harugakita', tuning: 'nogi', title: 'Haru ga Kita', about: 'Haru ga Kita in nogi-jōshi: short, lively and nearly all open strings.' },
  { from: 'doyo-chatsumi', tuning: 'nogi', title: 'Chatsumi', about: 'Chatsumi in nogi-jōshi, every note on an open string: a good first piece for steady eighth notes.' },
];

const arranged = [];
for (const spec of SPECS) {
  const src = SONGS.find((s) => s.id === spec.from);
  if (!src) throw new Error(`missing source song ${spec.from}`);
  const open = getTuning(spec.tuning).strings;
  const evs = normalizeEvents(parseScore(src.score).events, src.timeSig);
  const res = fitBest(evs, { open, tempo: src.tempo, maxPress: 2, barBeats: barBeats(src.timeSig) });
  const out = res.events.map((ev) => ({
    ...ev,
    notes: ev.notes.filter((n) => n.string).map((n) => ({ string: n.string, press: n.press })),
    finger: null,
    techs: [...ev.techs],
  }));
  const sounding = out.filter((e) => !e.rest && e.notes.length);
  const last = sounding[sounding.length - 1];
  // awase-zume on long notes and the last note
  for (const ev of sounding) {
    if (ev.notes.length !== 1) continue;
    if (!(ev.d >= 2 - 1e-6 || ev === last)) continue;
    const n = ev.notes[0];
    if (n.press) continue;
    const pitch = open[n.string - 1];
    let partner = -1;
    for (let s = 1; s <= 13; s++) {
      if (s === n.string || open[s - 1] !== pitch - 12) continue;
      if (Math.abs(s - n.string) > 7) continue;
      if (partner < 0 || Math.abs(s - n.string) < Math.abs(partner - n.string)) partner = s;
    }
    if (partner > 0) ev.notes = [{ string: Math.max(n.string, partner), press: 0 }, { string: Math.min(n.string, partner), press: 0 }];
  }
  // sukui-zume on quick repeats of the same open string
  for (let i = 1; i < sounding.length; i++) {
    const a = sounding[i - 1], b = sounding[i];
    if (a.notes.length !== 1 || b.notes.length !== 1) continue;
    if (a.techs.includes('sukui')) continue;
    if (a.notes[0].string === b.notes[0].string && !a.notes[0].press && !b.notes[0].press && a.d <= 0.5 && b.d <= 0.5 && Math.abs(b.t - a.t - a.d) < 1e-6) {
      b.techs.push('sukui');
    }
  }
  const pitches = sounding.flatMap((e) => e.notes.map((n) => open[n.string - 1] + n.press));
  arranged.push({
    id: `koto-${spec.from}`,
    title: `${spec.title || src.title.replace(/ \(.*\)$/, '')} (koto)`,
    jp: spec.jp ?? src.jp ?? '',
    composer: src.composer,
    category: 'Koto arrangements',
    mode: 'strings',
    tuning: spec.tuning,
    base: 0,
    tempo: src.tempo,
    timeSig: src.timeSig,
    syllables: src.syllables || 'Lyrics',
    about: `${spec.about} Arranged for koto by KotoLab and written in koto string notation.`,
    arrangedFrom: src.id,
    score: '\n' + eventsToText(out, src.timeSig, 'strings'),
  });
  console.log(spec.from.padEnd(13), spec.tuning.padEnd(6), 'transpose', res.transpose, 'notes', pitches.length, 'presses', res.stats.half + res.stats.whole);
}

writeFileSync(new URL('../js/songs-koto.js', import.meta.url),
  `// Generated by scripts/arrange-koto.mjs — do not edit by hand.\nexport const KOTO_SONGS = ${JSON.stringify(arranged, null, 2)};\n`);
