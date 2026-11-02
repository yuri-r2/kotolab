import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTuning } from '../js/tunings.js';
import { planTuningSteps, describeMove, describeRelation } from '../js/guide.js';
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
