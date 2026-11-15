import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Player } from '../js/player.js';

const arrangement = {
  tempo: 60,
  timeSig: [2, 4],
  measures: [{}, {}],
  open: [62],
  events: [
    { t: 0, d: 1, notes: [{ pitch: 62, press: 0, string: 1 }], techs: [] },
    { t: 1, d: 1, rest: true, notes: [], techs: [] },
    { t: 2, d: 1, notes: [{ pitch: 62, press: 0, string: 1 }], techs: [] },
  ],
};

test('playback schedules rests, notes and metronome correctly at practice speed', () => {
  const notes = [], clicks = [];
  const player = new Player({
    pluck: ({ midi, when }) => notes.push([midi, when]),
    click: (when, accent) => clicks.push([when, accent]),
  });
  player.load(arrangement);
  player.setSpeed(0.5);
  player.metronome = true;
  player.segments = [{ time: 10, beat: 0 }];
  player.scheduleRange(0, 2);
  player.scheduleRange(2, player.total);
  assert.deepEqual(notes, [[62, 10], [62, 14]]);
  assert.deepEqual(clicks, [[10, true], [12, false], [14, true], [16, false]]);
});

test('stopping or loading a different song cancels a pending playback start', async (t) => {
  globalThis.cancelAnimationFrame = () => {};
  t.after(() => { delete globalThis.cancelAnimationFrame; });
  let ready;
  const states = [];
  const player = new Player({
    ensure: () => ({ currentTime: 0 }),
    prepare: () => new Promise((resolve) => { ready = resolve; }),
    stopAll: () => {},
  }, { onState: (state) => states.push(state) });
  player.load(arrangement);
  const stopped = player.play();
  player.stop();
  ready();
  await stopped;
  assert.equal(player.playing, false);

  const replaced = player.play();
  player.load({ ...arrangement, tempo: 90 });
  ready();
  await replaced;
  assert.equal(player.playing, false);
  assert.deepEqual(states, ['stopped']);
});

test('a practice loop schedules the first note again and skips notes outside the loop', () => {
  const notes = [];
  let time = 10;
  const player = new Player({
    now: () => time,
    pluck: ({ when }) => notes.push(when),
  });
  player.load(arrangement);
  player.loop = { start: 0, end: 2 };
  player.segments = [{ time: 10, beat: 0 }];
  player.schedBeat = 0;
  player.schedule();
  time = 11.9;
  player.schedule();
  player.schedule();
  assert.deepEqual(notes, [10, 12]);
  assert.equal(player.beatAt(12), 0);
});
