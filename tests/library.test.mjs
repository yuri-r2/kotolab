import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SONGS, TRADITIONS, searchSongs, songTradition } from '../js/songs.js';
import { WORLD_SONGS } from '../js/songs-world.js';
import { REPERTOIRE_SONGS } from '../js/songs-repertoire.js';
import { SONG_LEVELS } from '../js/song-levels.js';
import { songDifficulty } from '../js/difficulty.js';
import { parseScore, normalizeEvents, barBeats } from '../js/notation.js';
import { fitArrangement, fitBest, recommendTunings, resolvePitches } from '../js/engine.js';
import { BASES, TUNINGS, getTuning, hiraPitches, checkTuningRealism, tuningOpen } from '../js/tunings.js';
import { planTuningSteps } from '../js/guide.js';

test('the library keeps stable IDs and gives every song a known tradition', () => {
  assert.equal(new Set(SONGS.map((s) => s.id)).size, SONGS.length);
  const traditions = new Set(SONGS.map(songTradition));
  assert.deepEqual(traditions, new Set(TRADITIONS.filter((t) => t !== 'My songs')));
  assert.equal(songTradition(SONGS.find((s) => s.id === 'auldlangsyne')), 'European');
  assert.equal(songTradition({ title: 'Saved arrangement', user: true, tradition: 'Japanese' }), 'My songs');
});

test('search finds accented titles, original scripts, traditions and collections', () => {
  for (const [query, id] of [
    ['ngua vietnamese', 'ly-ngua-o'],
    ['  gio  cau  ', 'qua-cau-gio-bay'],
    ['molihua', 'molihua'],
    ['茉莉花', 'molihua'],
    ['구아리랑', 'gu-arirang'],
    ['meiji kurokami', 'meiji-12'],
    ['vu dieu dong duong', 'tai-tu-dance'],
    ['eighth dan', 'hachidan-dan-8'],
  ]) assert.ok(searchSongs(SONGS, query).some((s) => s.id === id), query);
  assert.deepEqual(searchSongs(SONGS, '     '), SONGS);
  assert.deepEqual(searchSongs(SONGS, 'grace vietnamese'), []);
  assert.deepEqual(searchSongs(SONGS, '', 'Vietnamese').map((s) => s.id), ['qua-cau-gio-bay', 'ly-ngua-o', 'tai-tu-dance']);
  assert.deepEqual(searchSongs(SONGS, 'molihua', 'Japanese'), []);
  const saved = { title: 'My arrangement', user: true };
  assert.deepEqual(searchSongs([...SONGS, saved], 'arrangement', 'My songs'), [saved]);
});

test('new scores preserve their barlines and play every note in the intended register', () => {
  for (const song of WORLD_SONGS) {
    assert.equal(new URL(song.source).protocol, 'https:', song.id);
    const bars = song.score.trim().slice(0, -1).split('|');
    const beats = barBeats(song.timeSig);
    for (const [i] of bars.entries()) {
      assert.equal(parseScore(bars.slice(0, i + 1).join('|')).totalBeats, (i + 1) * beats, `${song.id} bar ${i + 1}`);
    }
    const events = normalizeEvents(parseScore(song.score).events, song.timeSig);
    const opts = { open: tuningOpen(getTuning(song.tuning)), tempo: song.tempo, barBeats: beats, maxPress: 2 };
    for (const result of [fitArrangement(events, opts), fitBest(events, opts)]) {
      assert.equal(result.transpose, 0, song.id);
      assert.equal(result.stats.omitted, 0, song.id);
      assert.equal(result.stats.shifted, 0, song.id);
      assert.equal(result.stats.open, result.stats.notes, song.id);
      assert.ok(result.stats.notes >= 40, song.id);
      assert.deepEqual(result.issues, [], song.id);
    }
    assert.deepEqual(SONG_LEVELS[song.id], songDifficulty(song), song.id);
  }
});

test('new preset families work at every base and in the advisor and tuning guide', () => {
  const presets = TUNINGS.filter((t) => t.group);
  assert.deepEqual(new Set(presets.map((t) => t.group)), new Set([
    'Chinese repertoire', 'Vietnamese repertoire', 'Korean repertoire', 'Modern tunings',
  ]));
  assert.equal(new Set(TUNINGS.map((t) => t.strings.join(','))).size, TUNINGS.length);
  const song = SONGS.find((s) => s.id === 'molihua');
  const events = parseScore(song.score).events;
  const results = recommendTunings(events, TUNINGS, { tempo: song.tempo, barBeats: barBeats(song.timeSig) });
  assert.equal(results.length, TUNINGS.length);
  for (const tuning of presets) {
    for (const { offset } of BASES) {
      const open = tuningOpen(tuning, offset);
      const hira = hiraPitches(offset);
      assert.equal(open[0], 62 + offset, tuning.id);
      assert.equal(open.length, 13, tuning.id);
      assert.deepEqual(checkTuningRealism(open, offset), [], tuning.id);
      const steps = planTuningSteps(hira, open);
      assert.deepEqual(steps.map(({ string }) => string), open.flatMap((p, i) => p === hira[i] ? [] : [i + 1]));
      for (const { string, to } of steps) hira[string - 1] = to;
      assert.deepEqual(hira, open, tuning.id);
    }
  }
  const steps = planTuningSteps(null, getTuning('gayageum-pentatonic').strings);
  assert.deepEqual(steps.slice(0, 3).map((step) => step.string), [1, 4, 9]);
});

test('historical repertoire follows the written bars and plays in its recommended tuning', () => {
  const barCounts = {
    'rokudan-dan-6': 26,
    'hachidan-dan-8': 26,
    'bucks-of-oranmore': 33,
    'banish-misfortune': 49,
    'tai-tu-dance': 17,
    'tiersot-chinese-melody': 31,
  };
  for (const song of REPERTOIRE_SONGS) {
    assert.equal(new URL(song.source).protocol, 'https:', song.id);
    const bars = song.score.trim().slice(0, -1).split('|');
    const beats = barBeats(song.timeSig);
    assert.equal(bars.length, barCounts[song.id], song.id);
    for (const [i] of bars.entries()) {
      const end = parseScore(bars.slice(0, i + 1).join('|')).totalBeats;
      assert.ok(Math.abs(end - (i + 1) * beats) < 1e-6, `${song.id} bar ${i + 1}`);
    }

    const open = tuningOpen(getTuning(song.tuning));
    const events = normalizeEvents(parseScore(song.score).events, song.timeSig);
    const opts = { open, tempo: song.tempo, barBeats: beats, maxPress: 2 };
    const arranged = song.mode === 'strings'
      ? fitArrangement(resolvePitches(events, open), { ...opts, keepStrings: true })
      : fitBest(events, opts);
    assert.equal(arranged.stats.omitted, 0, song.id);
    assert.equal(arranged.stats.shifted, 0, song.id);
    assert.equal(arranged.transpose, 0, song.id);
    assert.deepEqual(SONG_LEVELS[song.id], songDifficulty(song), song.id);

    if (song.mode === 'strings') {
      for (const event of arranged.events) {
        for (const note of event.notes) {
          assert.equal(note.string, note.authoredString, song.id);
          assert.equal(note.press, note.authoredPress, song.id);
        }
      }
      assert.ok(arranged.stats.half + arranged.stats.whole > 5, song.id);
      assert.ok(arranged.stats.chords >= 10, song.id);
      assert.ok(arranged.stats.levelNumber >= 4, song.id);
    } else {
      assert.equal(arranged.stats.open, arranged.stats.notes, song.id);
      if (song.category.startsWith('Irish')) assert.equal(arranged.stats.levelNumber, 5, song.id);
    }
  }
});
