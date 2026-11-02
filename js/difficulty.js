// Difficulty of a song as KotoLab arranges it by default: koto scores in
// their own tuning with their own strings, pitch songs in the tuning the
// advisor ranks first.

import { TUNINGS, getTuning, tuningOpen } from './tunings.js';
import { parseScore, normalizeEvents, barBeats } from './notation.js';
import { resolvePitches, fitArrangement, recommendTunings } from './engine.js';


export function songDifficulty(song) {
  let evs = normalizeEvents(parseScore(song.score).events, song.timeSig);
  const bb = barBeats(song.timeSig);
  if (song.mode === 'strings') {
    const t = getTuning(song.tuning) || getTuning('hira');
    const open = song.sourceOpen || tuningOpen(t, song.base || 0);
    evs = resolvePitches(evs, open);
    const res = fitArrangement(evs, { open, tempo: song.tempo, maxPress: 2, keepStrings: true, barBeats: bb });
    return { difficulty: res.stats.difficulty, level: res.stats.levelNumber, tuning: t.id };
  }
  if (song.tuning && song.tuning !== 'auto' && getTuning(song.tuning)) {
    const rec = recommendTunings(evs, [getTuning(song.tuning)], { tempo: song.tempo, barBeats: bb, base: song.base || 0 });
    return { difficulty: rec[0].stats.difficulty, level: rec[0].stats.levelNumber, tuning: song.tuning };
  }
  const rec = recommendTunings(evs, TUNINGS.filter((t) => !t.user), { tempo: song.tempo, barBeats: bb, base: song.base || 0 });
  return { difficulty: rec[0].stats.difficulty, level: rec[0].stats.levelNumber, tuning: rec[0].tuning.id };
}
