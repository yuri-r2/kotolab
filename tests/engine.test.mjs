import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNINGS, getTuning, parsePitch, checkTuningRealism, hiraPitches } from '../js/tunings.js';
import { parseScore, normalizeEvents, toMeasures, barBeats, eventsToText } from '../js/notation.js';
import { resolvePitches, fitArrangement, fitBest, optimizeTuning, recommendTunings } from '../js/engine.js';
import { parseHumdrumKoto, kernPitch, midiToEvents } from '../js/importers.js';
import { SONGS } from '../js/songs.js';

const prep = (song) => {
  let evs = normalizeEvents(parseScore(song.score).events, song.timeSig);
  if (song.mode === 'strings') evs = resolvePitches(evs, getTuning(song.tuning).strings);
  return evs;
};

test('tuning tables match published charts (壱越 base)', () => {
  const names = (id) => getTuning(id).strings;
  assert.deepEqual(names('hira'), [62, 55, 57, 58, 62, 63, 67, 69, 70, 74, 75, 79, 81]);
  // kumoi: D G A♭ C D E♭ G A♭ C D E♭ G A
  assert.deepEqual(names('kumoi'), [62, 55, 56, 60, 62, 63, 67, 68, 72, 74, 75, 79, 81]);
  // nakazora: D G A B♭ D E F A B♭ D E F A
  assert.deepEqual(names('nakazora'), [62, 55, 57, 58, 62, 64, 65, 69, 70, 74, 76, 77, 81]);
  // nogi: D G A B D E G A B D E G A
  assert.deepEqual(names('nogi'), [62, 55, 57, 59, 62, 64, 67, 69, 71, 74, 76, 79, 81]);
  for (const t of TUNINGS) assert.equal(checkTuningRealism(t.strings).length, 0, `${t.id} should be realistic`);
});

test('pitch parsing', () => {
  assert.equal(parsePitch('C4'), 60);
  assert.equal(parsePitch('Bb3'), 58);
  assert.equal(parsePitch('F#4'), 66);
  assert.equal(kernPitch('d'), 62);
  assert.equal(kernPitch('G'), 55);
  assert.equal(kernPitch('B-'), 58);
  assert.equal(kernPitch('ee-'), 75);
});

test('score parser handles strings, chords, techniques, ties and errors', () => {
  const { events, totalBeats } = parseScore('s5h@hiki~te-n s1+s5q#3 s9p2e. s7s rq -q');
  assert.equal(totalBeats, 6);
  assert.deepEqual(events[0].techs, ['hiki']);
  assert.equal(events[0].shoga, 'te-n');
  assert.equal(events[1].notes.length, 2);
  assert.equal(events[1].finger, 3);
  assert.equal(events[2].notes[0].press, 2);
  assert.equal(events[2].d, 0.75);
  assert.equal(events[4].d, 2); // rest extended by "-q"
  assert.throws(() => parseScore('s14q'));
  assert.throws(() => parseScore('X4q'));
});

test('every starter song parses into whole bars', () => {
  for (const song of SONGS) {
    const { totalBeats } = parseScore(song.score);
    const bb = barBeats(song.timeSig);
    assert.ok(Math.abs(totalBeats / bb - Math.round(totalBeats / bb)) < 1e-6, `${song.id}: ${totalBeats} beats is not a whole number of ${bb}-beat bars`);
  }
});

test('Sakura keeps its original open strings in hira-jōshi', () => {
  const song = SONGS.find((s) => s.id === 'sakura');
  const res = fitArrangement(prep(song), { open: getTuning('hira').strings, tempo: song.tempo, keepStrings: true });
  const strings = res.events.filter((e) => !e.rest).slice(0, 6).map((e) => e.notes[0].string);
  assert.deepEqual(strings, [7, 7, 8, 7, 7, 8]);
  assert.equal(res.stats.open, res.stats.notes);
  assert.ok(res.events.filter((e) => !e.rest).every((e) => e.notes[0].finger === 1), 'Sakura is played with the thumb');
});

test('arrangements are physically playable', () => {
  for (const song of SONGS) {
    const evs = prep(song);
    for (const t of TUNINGS) {
      const res = fitBest(evs, { open: t.strings, tempo: song.tempo, maxPress: 2, range: 6 });
      for (const ev of res.events) {
        if (ev.rest) continue;
        const strings = ev.notes.filter((n) => n.string).map((n) => n.string);
        assert.equal(new Set(strings).size, strings.length, 'one note per string');
        for (const n of ev.notes) {
          if (n.omitted) continue;
          assert.ok(n.press >= 0 && n.press <= 2, 'press within limit');
          assert.equal(t.strings[n.string - 1] + n.press, n.pitch, 'string + press gives the pitch');
          assert.equal(n.pitch, n.target + n.shifted, 'sounds the written note (or its octave)');
        }
      }
    }
  }
});

test('half-step-only limit is respected', () => {
  const song = SONGS.find((s) => s.id === 'ode');
  const res = fitBest(prep(song), { open: getTuning('hira').strings, tempo: 100, maxPress: 1 });
  for (const ev of res.events) for (const n of ev.notes) assert.ok(n.press <= 1);
});

test('tuning advisor prefers nogi-jōshi for the pentatonic Akatonbo', () => {
  const song = SONGS.find((s) => s.id === 'akatonbo');
  const rec = recommendTunings(prep(song), TUNINGS, { tempo: song.tempo });
  assert.ok(['nogi', 'gaku'].includes(rec[0].tuning.id));
  assert.equal(rec[0].stats.open, rec[0].stats.notes, 'all open strings');
});

test('bridge fitting reduces presses and stays realistic', () => {
  const song = SONGS.find((s) => s.id === 'twinkle');
  const evs = prep(song);
  const open = getTuning('hira').strings;
  const before = fitBest(evs, { open, tempo: song.tempo });
  const opt = optimizeTuning(evs, { open, transpose: before.transpose, tempo: song.tempo });
  const after = fitArrangement(evs, { open: opt.open, transpose: before.transpose, tempo: song.tempo });
  const presses = (s) => s.half + s.whole + s.triple;
  assert.ok(presses(after.stats) < presses(before.stats));
  assert.equal(checkTuningRealism(opt.open, 0).length, 0);
});

test('Humdrum **koto import (Rokudan opening from the **koto spec)', () => {
  const krn = [
    '!!!OTL@@JA: Rokudan no shirabe', '**koto\t**kuchi', '*tune[d:G:A:B-:d:e-:g:a:b-:dd:ee-:gg:aa]\t*', '*M4/4\t*M4/4', '=1-\t=1-',
    '{5+i\tte', '-\tn', '3\tton', '1s\tshan', '=2\t=2', '0}\t.', '{3|sb\tsha', '3|sc\tsha', '8|.\tkoo', '7||\tro', '6|\trin', '7|o\tchin', '=3\t=3', '*-\t*-',
  ].join('\n');
  const res = parseHumdrumKoto(krn);
  assert.deepEqual(res.tuning, hiraPitches(0));
  assert.equal(res.events[0].d, 2);
  assert.deepEqual(res.events[0].techs, ['hiki']);
  assert.deepEqual(res.events[2].techs, ['kaki']);
  assert.equal(res.events[4].finger, 2);
  assert.equal(res.events[5].finger, 3);
  assert.deepEqual(res.events[res.events.length - 1].techs, ['ato']);
  assert.equal(res.events[2].shoga, 'shan');
  const total = res.events.reduce((s, e) => s + e.d, 0);
  assert.equal(total, 8);
});

test('MIDI note conversion quantizes and fills rests', () => {
  const notes = [
    { pitch: 60, start: 0, dur: 0.98 }, { pitch: 64, start: 1.02, dur: 0.5 }, { pitch: 67, start: 3, dur: 1 },
    { pitch: 48, start: 3, dur: 1 },
  ];
  const evs = midiToEvents(notes, { timeSig: [4, 4], voices: 2 });
  assert.equal(evs[0].t, 0);
  assert.equal(evs[1].t, 1);
  assert.ok(evs.some((e) => e.rest));
  assert.equal(evs.find((e) => e.t === 3).notes.length, 2);
  const text = eventsToText(evs, [4, 4]);
  const again = parseScore(text);
  assert.equal(again.totalBeats, 4);
});

test('measures group events by bar', () => {
  const evs = normalizeEvents(parseScore('C4q D4q E4q F4q G4h').events, [4, 4]);
  const ms = toMeasures(evs, [4, 4]);
  assert.equal(ms.length, 2);
  assert.equal(ms[1].events[0].d, 2);
});
