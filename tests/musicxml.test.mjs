import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMusicXML } from '../js/importers.js';
import { SONGS, FAVOURITES } from '../js/songs.js';
import { parseScore, normalizeEvents, barBeats } from '../js/notation.js';
import { fitBest } from '../js/engine.js';
import { getTuning } from '../js/tunings.js';

const note = (step, oct, dur, extra = '') => `<note><pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>${dur}</duration><voice>1</voice>${extra}</note>`;
const XML = `<?xml version="1.0"?><score-partwise version="3.1">
<work><work-title>Test &amp; tune</work-title></work>
<identification><creator type="composer">Anon</creator></identification>
<part-list><score-part id="P1"><part-name>Koto</part-name></score-part></part-list>
<part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>2</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
<direction><sound tempo="96"/></direction>
${note('E', 4, 2, '<lyric><text>u</text></lyric>')}</measure>
<measure number="1">
${note('A', 4, 2, '<tie type="start"/>')}${note('A', 4, 2, '<tie type="stop"/>')}<note><chord/><pitch><step>A</step><octave>3</octave></pitch><duration>2</duration><voice>1</voice></note>
<note><rest/><duration>2</duration><voice>1</voice></note>
<backup><duration>6</duration></backup>
<note><pitch><step>C</step><octave>3</octave></pitch><duration>6</duration><voice>2</voice></note>
</measure></part></score-partwise>`;

test('MusicXML: title, tempo, pickup padding, ties, chords, lyrics, first voice only', () => {
  const r = parseMusicXML(XML);
  assert.equal(r.title, 'Test & tune');
  assert.equal(r.composer, 'Anon');
  assert.equal(r.tempo, 96);
  assert.deepEqual(r.timeSig, [3, 4]);
  const notes = r.events.filter((e) => !e.rest);
  assert.equal(notes[0].t, 2, 'pickup note sits on beat 3 of a padded bar');
  assert.equal(notes[0].shoga, 'u');
  assert.equal(notes[1].notes[0].pitch, 69);
  assert.equal(notes[1].d, 2, 'tied quarters merge into a half note');
  assert.equal(notes.length, 2, 'voice 2 is ignored; the chord tone joins the tied note');
  assert.ok(r.events.every((e) => !e.notes.some((n) => n.pitch === 48)));
});

test('MusicXML: rejects files that are not scores', () => {
  assert.throws(() => parseMusicXML('<html></html>'), /not a MusicXML/);
});

test('new songs and favourites are all in the library and arrange cleanly', () => {
  for (const id of Object.keys(FAVOURITES)) assert.ok(SONGS.some((s) => s.id === id), id);
  const added = SONGS.filter((s) => s.id.startsWith('doyo-') || s.id.startsWith('koto-doyo-') || s.id === 'fuki');
  assert.equal(added.length, 15);
  for (const s of added) {
    const evs = normalizeEvents(parseScore(s.score).events, s.timeSig);
    assert.ok(evs.filter((e) => !e.rest).length >= 25, s.id);
    if (s.mode === 'pitch') {
      const res = fitBest(evs, { maxPress: 2, open: getTuning(s.tuning === 'auto' ? 'hira' : s.tuning).strings, tempo: s.tempo, barBeats: barBeats(s.timeSig) });
      assert.ok(res.events.length, s.id);
    }
  }
});
