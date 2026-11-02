import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTuning, TUNINGS } from '../js/tunings.js';
import { planTuningSteps, describeMove, describeRelation, bareTargetMidi, surveyTension, foldToOctave, bridgeDistance, placementStatus } from '../js/guide.js';
import { detectPitch, centsOff } from '../js/tuner.js';

test('retuning hira → kumoi moves exactly strings 三 四 八 九', () => {
  const steps = planTuningSteps(getTuning('hira').strings, getTuning('kumoi').strings);
  assert.deepEqual(steps.map((s) => s.string), [3, 4, 8, 9]);
  assert.match(describeMove(steps[0]), /away from you/); // 三 goes down
  assert.match(describeMove(steps[1]), /toward you/); // 四 goes up
  // 八 can be checked against 三, which is already retuned, an octave below
  assert.equal(steps[2].partner.string, 3);
  assert.match(describeRelation(steps[2].partner), /octave above/);
});

test('tuning from scratch starts with 一, then its unison 五 and octave 十', () => {
  const steps = planTuningSteps(null, getTuning('hira').strings);
  assert.equal(steps.length, 13);
  assert.deepEqual(steps.slice(0, 3).map((s) => s.string), [1, 5, 10]);
  assert.equal(steps[0].partner, null);
  assert.match(describeRelation(steps[1].partner), /exactly the same as 一/);
  assert.ok(steps.slice(1).every((s) => s.partner), 'every later string has a reference');
});

test('no steps when the koto is already in the target tuning', () => {
  assert.equal(planTuningSteps(getTuning('nogi').strings, getTuning('nogi').strings).length, 0);
});

test('pitch detection finds a plucked-string-like tone within a few cents', () => {
  const sr = 48000;
  for (const f of [65.41, 196, 293.66, 440, 880, 1760, 2093]) {
    const buf = new Float32Array(2048);
    for (let i = 0; i < buf.length; i++) {
      const t = i / sr;
      buf[i] = 0.5 * Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t) + 0.15 * Math.sin(6 * Math.PI * f * t);
    }
    const got = detectPitch(buf, sr);
    const midi = 69 + 12 * Math.log2(f / 440);
    assert.ok(Math.abs(centsOff(got, midi)) < 5, `${f} Hz detected as ${got}`);
  }
  assert.equal(detectPitch(new Float32Array(2048), sr), null);
});

test('check mode visits all 13 strings without moving bridges', async () => {
  const { planCheckSteps } = await import('../js/guide.js');
  const steps = planCheckSteps(getTuning('hira').strings);
  assert.equal(steps.length, 13);
  assert.ok(steps.every((s) => s.from === s.to && s.check));
});

test('bridge placement from the bare-string pitch', async () => {
  const { bridgeDistance, estimateBareFreq, placementStatus } = await import('../js/guide.js');
  // bare string at A3 (220 Hz) over 170 cm; target A4 → bridge at half the length
  assert.ok(Math.abs(bridgeDistance(220, 69, 170) - 85) < 0.01);
  // an octave higher target → a quarter of the length
  assert.ok(Math.abs(bridgeDistance(220, 81, 170) - 42.5) < 0.01);
  assert.equal(placementStatus(85, 170), 'ok');
  assert.equal(placementStatus(168, 170), 'tight');
  assert.equal(placementStatus(20, 170), 'slack');
  // estimate puts the lowest string (二, G3) at 90% of the length
  const hira = getTuning('hira').strings;
  const f0 = estimateBareFreq(hira);
  assert.ok(Math.abs(bridgeDistance(f0, 55, 170) - 153) < 0.01);
  assert.equal(placementStatus(bridgeDistance(f0, 81, 170), 170), 'ok');
});

test('bare strings: one shared note below the tuning, every bridge in a realistic spot', () => {
  for (const { id: name, strings: open } of TUNINGS) {
    const bare = bareTargetMidi(open);
    assert.ok(bare < Math.min(...open), name);
    const f0 = 440 * 2 ** ((bare - 69) / 12);
    for (const p of open) assert.equal(placementStatus(bridgeDistance(f0, p, 170), 170), 'ok', `${name} ${p}`);
  }
});

test('knotted strings: survey flags slack and tight strings against the median', () => {
  const f = (cents) => 165 * 2 ** (cents / 1200);
  const measured = [0, 10, -20, 5, -120, 0, 15, 200, -5, 0, 8, -10, null].map((c, i) => ({ string: i + 1, f0: c == null ? null : f(c) }));
  const { median, rows } = surveyTension(measured);
  assert.ok(Math.abs(1200 * Math.log2(median / 165)) < 10);
  assert.equal(rows[4].verdict, 'slack');
  assert.equal(rows[7].verdict, 'tight');
  assert.equal(rows[12].verdict, 'unmeasured');
  assert.equal(rows.filter((r) => r.verdict === 'even').length, 10);
});

test('a bare string read an octave up is folded back', () => {
  assert.ok(Math.abs(foldToOctave(331, 165) - 165.5) < 0.01);
  assert.ok(Math.abs(foldToOctave(170, 165) - 170) < 0.01);
});
