import { TUNINGS, BASES, STRING_NAMES, STRING_READINGS, getTuning, hiraPitches, pitchName, checkTuningRealism } from './tunings.js';
import { TECHNIQUES, FINGERS, LESSONS, pressTechnique } from './techniques.js';
import { parseScore, normalizeEvents, toMeasures, barBeats, eventsToText, barWarnings, ScoreError } from './notation.js';
import { resolvePitches, fitArrangement, fitBest, recommendTunings, optimizeTuning } from './engine.js';
import { KotoAudio, eventToPlucks } from './audio.js';
import { Player } from './player.js';
import { TabView, describe } from './views/tab.js';
import { VerticalView } from './views/vertical.js';
import { KotoView } from './views/koto.js';
import { SONGS } from './songs.js';
import { readMidi, midiToEvents, parseHumdrumKoto } from './importers.js';
import { TuningGuide } from './guide.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'kotolab.songs.v1';
const PREFS_KEY = 'kotolab.prefs.v1';
const KOTO_KEY = 'kotolab.myKoto.v1';
const EPS = 1e-6;

const state = {
  song: null,
  srcEvents: [],
  tuningId: 'hira',
  customOpen: null,
  customFrom: null,
  base: 0,
  transpose: 0,
  autoTranspose: true,
  maxPress: 2,
  keepStrings: true,
  view: 'tab',
  arr: null,
  selected: null,
  loopBars: null,
  panel: 'play',
};

const audio = new KotoAudio();
const kotoView = new KotoView($('kotoView'), { onPluck: pluckString });
const tabView = new TabView($('tabView'), { onSelect: selectEvent, onBar: setLoopBar });
const vertView = new VerticalView($('vertView'), { onSelect: selectEvent, onBar: setLoopBar });
const player = new Player(audio, { onTick, onState });
const guideKoto = new KotoView($('guideKoto'), { onPluck: (string) => {
  const p = guide.target?.open[string - 1];
  if (p != null) audio.prepare([p]).then(() => audio.pluck({ midi: p, when: audio.now() + 0.02, dur: 1.5, string }));
} });
const guide = new TuningGuide({
  els: {
    intro: $('guideIntro'), fromTuning: $('guideFrom'), fromBase: $('guideFromBase'), target: $('guideTarget'),
    start: $('guideStart'), check: $('guideCheck'), again: $('guideAgain'), chips: $('stepChips'), level: $('micLevel'), startBox: $('guideStartBox'), step: $('guideStep'), kanji: $('stepKanji'), progress: $('stepProgress'),
    what: $('stepWhat'), hint: $('stepHint'), playTarget: $('stepPlay'), playCompare: $('stepCompare'), mic: $('stepMic'),
    micAlert: $('micAlert'), micAlertText: $('micAlertText'), micRetry: $('micRetry'),
    needle: $('tunerNeedle'), readout: $('tunerReadout'), back: $('stepBack'), next: $('stepNext'), finish: $('guideFinish'), finishText: $('guideFinishText'),
  },
  audio, kotoView: guideKoto, presets: TUNINGS, bases: BASES,
  onTuned: (target, { verified } = {}) => markTuned(target, { quiet: true, verified }),
});

// ---------------------------------------------------------------- storage
function loadUserSongs() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveUserSongs(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}
let userSongs = loadUserSongs();

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}
const prefs = { rtl: false, a4: 440, ...loadJSON(PREFS_KEY, {}) };
// how the player's own koto is tuned right now: { open: number[13], label, base }
let myKoto = loadJSON(KOTO_KEY, null);
const allSongs = () => [...SONGS, ...userSongs];

// ---------------------------------------------------------------- library
function renderLibrary() {
  const list = $('songList');
  list.innerHTML = '';
  const groups = new Map();
  for (const s of allSongs()) {
    const cat = s.user ? 'My songs' : s.category;
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(s);
  }
  for (const [cat, songs] of groups) {
    const sec = document.createElement('section');
    sec.className = 'song-group';
    sec.innerHTML = `<h2>${escapeHtml(cat)}</h2>`;
    for (const s of songs) {
      const b = document.createElement('button');
      b.className = 'song-btn';
      b.setAttribute('aria-current', state.song && state.song.id === s.id ? 'true' : 'false');
      b.innerHTML = `${escapeHtml(s.title)}<small>${escapeHtml(s.jp ? s.jp + ' · ' : '')}${escapeHtml(s.mode === 'strings' ? 'koto score' : 'arranged')}</small>`;
      b.addEventListener('click', () => { loadSong(s); closeLibrary(); });
      sec.appendChild(b);
    }
    list.appendChild(sec);
  }
}

// ---------------------------------------------------------------- song loading
function sourceOpen(song) {
  if (song.sourceOpen) return song.sourceOpen;
  const t = getTuning(song.tuning) || getTuning('hira');
  return t.strings.map((p) => p + (song.base || 0));
}

function parseSong(song) {
  const { events } = parseScore(song.score);
  let evs = normalizeEvents(events, song.timeSig);
  if (song.mode === 'strings') evs = resolvePitches(evs, sourceOpen(song));
  return evs;
}

function loadSong(song, { keepSettings = false } = {}) {
  player.stop();
  let evs;
  try {
    evs = parseSong(song);
  } catch (err) {
    toast(`Could not read “${song.title}”: ${err.message}`);
    return;
  }
  state.song = song;
  state.srcEvents = evs;
  state.selected = null;
  state.loopBars = null;
  $('loopToggle').checked = false;
  player.loop = null;
  if (!keepSettings) {
    state.base = song.base || 0;
    state.autoTranspose = true;
    state.customOpen = null;
    if (song.sourceOpen && !getTuning(song.tuning)) {
      state.tuningId = 'custom';
      state.customOpen = song.sourceOpen.slice();
      state.customFrom = 'the imported score';
    } else if (song.tuning && song.tuning !== 'auto') {
      state.tuningId = song.tuning;
    } else {
      const rec = recommendTunings(evs, TUNINGS, { base: state.base, tempo: song.tempo, maxPress: state.maxPress, barBeats: barBeats(song.timeSig) });
      state.tuningId = rec[0].tuning.id;
    }
  }
  $('songTitle').textContent = song.title;
  $('songJp').textContent = song.jp || '';
  $('songComposer').textContent = song.composer || '';
  $('songAbout').textContent = song.about || '';
  $('syllableLabel').textContent = song.syllables || 'Syllables';
  $('keepWrap').hidden = song.mode !== 'strings';
  document.title = `${song.title} — KotoLab`;
  try { history.replaceState(null, '', `#song=${encodeURIComponent(song.id)}`); } catch { /* sandboxed */ }
  renderLibrary();
  renderTuningSelect();
  arrange();
  scheduleAdvisor();
}

// ---------------------------------------------------------------- arrangement
function currentOpen() {
  if (state.tuningId === 'custom' && state.customOpen) return state.customOpen.slice();
  const t = getTuning(state.tuningId) || TUNINGS[0];
  return t.strings.map((p) => p + state.base);
}

function isOriginalSetting() {
  const s = state.song;
  return s.mode === 'strings' && state.keepStrings && (
    (state.tuningId === s.tuning && !s.sourceOpen) ||
    (state.tuningId === 'custom' && s.sourceOpen && state.customOpen && state.customOpen.every((p, i) => p - state.base === s.sourceOpen[i] - (s.base || 0)))
  );
}

function arrange() {
  const song = state.song;
  const open = currentOpen();
  const bb = barBeats(song.timeSig);
  const opts = { open, tempo: song.tempo, maxPress: state.maxPress, barBeats: bb };
  let res;
  if (isOriginalSetting()) {
    const t = state.tuningId === 'custom' ? 0 : state.base - (song.base || 0);
    res = fitArrangement(state.srcEvents, { ...opts, transpose: state.autoTranspose ? t : state.transpose, keepStrings: true });
  } else if (state.autoTranspose) {
    res = fitBest(state.srcEvents, opts);
  } else {
    res = fitArrangement(state.srcEvents, { ...opts, transpose: state.transpose });
  }
  state.transpose = res.transpose;
  const events = res.events.map((ev, idx) => ({ ...ev, idx }));
  state.arr = {
    events,
    open,
    timeSig: song.timeSig,
    tempo: song.tempo,
    measures: toMeasures(events, song.timeSig),
    stats: res.stats,
    issues: [...barWarnings(events, song.timeSig).map((t) => ({ bar: null, level: 'info', text: t })), ...res.issues],
  };
  $('transValue').textContent = (res.transpose > 0 ? '+' : '') + res.transpose;
  $('transAuto').setAttribute('aria-pressed', String(state.autoTranspose));
  renderKoto();
  renderScore();
  renderPlayability();
  renderBridges();
  renderInspector();
  renderTuningStatus();
  player.load(state.arr);
  updateSpeedLabel();
}

function renderTuningSelect() {
  const sel = $('tuningSelect');
  sel.innerHTML = '';
  for (const t of TUNINGS) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = `${t.name} ${t.jp}`;
    sel.appendChild(o);
  }
  if (state.customOpen) {
    const o = document.createElement('option');
    o.value = 'custom';
    o.textContent = `Custom bridges${state.customFrom ? ' (from ' + state.customFrom + ')' : ''}`;
    sel.appendChild(o);
  }
  sel.value = state.tuningId;
  const bs = $('baseSelect');
  if (!bs.options.length) {
    for (const b of BASES) {
      const o = document.createElement('option');
      o.value = b.offset;
      o.textContent = b.name;
      bs.appendChild(o);
    }
  }
  bs.value = String(state.base);
  bs.disabled = state.tuningId === 'custom';
}

function tuningLabel(open = state.arr.open) {
  for (const t of TUNINGS) {
    for (const b of BASES) {
      if (t.strings.every((p, i) => p + b.offset === open[i])) return `${t.name} ${t.jp}, 一 on ${b.name.split(' (')[0]}`;
    }
  }
  return `custom bridges (${open.map((p) => pitchName(p, { octave: false })).join(' ')})`;
}

function currentTarget() {
  return { open: state.arr.open.slice(), label: tuningLabel(), base: state.base };
}

function retuneDiff() {
  if (!myKoto) return null;
  return state.arr.open.map((p, i) => ({ string: i + 1, from: myKoto.open[i], to: p })).filter((d) => d.from !== d.to);
}

function renderTuningStatus() {
  const label = tuningLabel();
  $('tuneSummary').textContent = label;
  const diff = retuneDiff();
  const banner = $('retuneBanner');
  const badge = $('tuneBadge');
  if (!myKoto) {
    banner.hidden = false;
    $('retuneTitle').textContent = 'Is your koto tuned for this song?';
    $('retuneText').textContent = `This song is arranged for ${label}. KotoLab can walk you through tuning it, one string at a time.`;
    badge.hidden = true;
  } else if (diff.length) {
    banner.hidden = false;
    $('retuneTitle').textContent = `Retune ${diff.length} string${diff.length > 1 ? 's' : ''} for this song`;
    $('retuneText').textContent = `Your koto is in ${myKoto.label}; this song needs ${label}: ` +
      diff.map((d) => `${STRING_NAMES[d.string - 1]} ${pitchName(d.from, { octave: false })}→${pitchName(d.to, { octave: false })}`).join(', ') + '.';
    badge.hidden = false;
    badge.textContent = String(diff.length);
    badge.setAttribute('aria-label', `${diff.length} strings to retune`);
  } else {
    banner.hidden = true;
    badge.hidden = true;
  }
  if (state.panel === 'tune' && (guide.index < 0 || !sameOpen(guide.target?.open, state.arr.open))) guide.setTarget(currentTarget(), myKoto);
}

function sameOpen(a, b) {
  return !!a && !!b && a.every((p, i) => p === b[i]);
}

function markTuned(target = currentTarget(), { quiet = false, verified = false } = {}) {
  myKoto = { open: target.open.slice(), label: target.label, base: target.base, verified, at: Date.now() };
  saveJSON(KOTO_KEY, myKoto);
  renderTuningStatus();
  if (!quiet) toast(`Noted: your koto is in ${target.label}.`);
}

function showPanel(panel, { startGuide = false, check = false } = {}) {
  state.panel = panel;
  const play = panel === 'play';
  $('playPanel').hidden = !play;
  $('tunePanel').hidden = play;
  for (const [id, on] of [['mainTabPlay', play], ['mainTabTune', !play]]) {
    $(id).classList.toggle('active', on);
    $(id).setAttribute('aria-selected', String(on));
  }
  if (play) {
    guide.stopMic();
    renderScore();
    return;
  }
  if (player.playing) player.pause();
  guide.setTarget(currentTarget(), myKoto);
  if (check) guide.begin('check');
  else if (startGuide && myKoto) guide.begin('tune');
}

function renderKoto() {
  const open = state.arr.open;
  const hira = hiraPitches(state.base);
  const changed = open.map((p, i) => (p !== hira[i] ? i + 1 : 0)).filter(Boolean);
  kotoView.setTuning(open, { showPitches: true, changed });
  kotoView.clearShow();
}

function renderScore() {
  const syl = $('showSyllables').checked;
  const pitches = $('showPitches').checked;
  for (const v of [tabView, vertView]) v.options = { syllables: syl, pitches, rtl: prefs.rtl };
  $('rtlWrap').hidden = state.view !== 'tab';
  $('tabView').hidden = state.view !== 'tab';
  $('vertView').hidden = state.view !== 'vertical';
  if (state.view === 'tab') tabView.render(state.arr);
  else vertView.render(state.arr);
  activeView().setSelected(state.selected);
  activeView().setLoop(loopBeats());
}

const activeView = () => (state.view === 'tab' ? tabView : vertView);

function renderPlayability() {
  const { stats, issues } = state.arr;
  $('diffLevel').textContent = stats.level;
  $('diffScore').textContent = `${stats.difficulty} / 10`;
  $('diffBar').style.width = `${stats.difficulty * 10}%`;
  const cells = [
    ['Notes', stats.notes, ''],
    ['Open strings', stats.open, ''],
    ['Half presses ヲ', stats.half, 'press'],
    ['Whole presses オ', stats.whole, 'press'],
    ['Deeper presses', stats.triple, 'press'],
    ['Moved octave', stats.shifted + stats.omitted, ''],
  ];
  $('stats').innerHTML = cells.map(([k, v, c]) => `<div class="${c}"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const ul = $('issues');
  ul.innerHTML = '';
  const tuningName = state.tuningId === 'custom' ? 'these custom bridges' : getTuning(state.tuningId).name;
  if (!issues.length) {
    const li = document.createElement('li');
    li.className = 'good';
    li.textContent = stats.half + stats.whole + stats.triple === 0
      ? `Every note is an open string in ${tuningName}. No left-hand presses needed.`
      : `Playable as arranged in ${tuningName}. Presses are spaced out enough to prepare.`;
    ul.appendChild(li);
  }
  for (const is of issues.slice(0, 40)) {
    const li = document.createElement('li');
    li.className = is.level;
    if (is.bar) {
      const b = document.createElement('button');
      b.textContent = `Bar ${is.bar}`;
      b.addEventListener('click', () => { setLoopBar(is.bar - 1, false); });
      li.appendChild(b);
    }
    li.appendChild(document.createTextNode(is.text));
    ul.appendChild(li);
  }
  const realism = checkTuningRealism(state.arr.open, state.base);
  for (const r of realism) {
    const li = document.createElement('li');
    li.className = 'warn';
    li.textContent = r.message;
    ul.appendChild(li);
  }
}

function renderBridges() {
  const hira = hiraPitches(state.base);
  const rows = state.arr.open.map((p, i) => {
    const d = p - hira[i];
    return `<tr><td class="kanji">${STRING_NAMES[i]}</td><td>${STRING_READINGS[i]}</td><td>${pitchName(p)}</td><td class="delta">${d ? (d > 0 ? '+' : '') + d : ''}</td></tr>`;
  });
  $('bridgeTable').innerHTML = `<thead><tr><th>String</th><th></th><th>Open pitch</th><th>vs hira</th></tr></thead><tbody>${rows.join('')}</tbody>`;
}

// ---------------------------------------------------------------- tuning advisor
let advisorTimer = null;
function scheduleAdvisor() {
  clearTimeout(advisorTimer);
  $('advisor').innerHTML = '<li class="muted">Comparing tunings…</li>';
  advisorTimer = setTimeout(renderAdvisor, 60);
}

function renderAdvisor() {
  const song = state.song;
  const rec = recommendTunings(state.srcEvents, TUNINGS, {
    base: state.base, tempo: song.tempo, maxPress: state.maxPress, barBeats: barBeats(song.timeSig),
    keepFor: song.mode === 'strings' && !song.sourceOpen ? song.tuning : null,
  });
  if (song.mode === 'strings' && !song.sourceOpen) {
    // the tuning a koto score was written for always comes first
    const i = rec.findIndex((r) => r.tuning.id === song.tuning);
    if (i > 0) rec.unshift(rec.splice(i, 1)[0]);
  }
  const ol = $('advisor');
  ol.innerHTML = '';
  for (const r of rec.slice(0, 5)) {
    const li = document.createElement('li');
    if (r.tuning.id === state.tuningId) li.classList.add('current');
    const original = song.mode === 'strings' && song.tuning === r.tuning.id ? ' · original' : '';
    const presses = r.stats.half + r.stats.whole + r.stats.triple;
    li.innerHTML = `<span class="name">${escapeHtml(r.tuning.name)}<span>${r.tuning.jp}</span></span>
      <span class="detail">${r.stats.level} · ${presses ? presses + ' press' + (presses > 1 ? 'es' : '') : 'all open strings'} · transpose ${r.transpose > 0 ? '+' : ''}${r.transpose}${original}</span>`;
    const b = document.createElement('button');
    b.textContent = r.tuning.id === state.tuningId ? 'In use' : 'Use';
    b.disabled = r.tuning.id === state.tuningId;
    b.addEventListener('click', () => {
      state.tuningId = r.tuning.id;
      state.autoTranspose = true;
      renderTuningSelect();
      arrange();
      renderAdvisor();
    });
    li.appendChild(b);
    ol.appendChild(li);
  }
}

function fitBridges() {
  const song = state.song;
  const btn = $('fitBridges');
  btn.disabled = true;
  btn.textContent = 'Fitting…';
  setTimeout(() => {
    const fromName = state.tuningId === 'custom' ? 'custom' : getTuning(state.tuningId).name;
    const res = optimizeTuning(state.srcEvents, { open: state.arr.open, transpose: state.transpose, tempo: song.tempo, maxPress: state.maxPress, base: state.base, barBeats: barBeats(song.timeSig) });
    btn.disabled = false;
    btn.textContent = 'Fit the bridges to this song';
    if (!res.moves.length) {
      $('fitNote').textContent = `${fromName} already suits this song; moving bridges would not make it easier.`;
      return;
    }
    state.customOpen = res.open;
    state.customFrom = fromName;
    state.tuningId = 'custom';
    state.autoTranspose = false;
    $('fitNote').textContent = 'Move these bridges: ' + res.moves.map((m) => `${STRING_NAMES[m.string - 1]} ${pitchName(m.from, { octave: false })}→${pitchName(m.to, { octave: false })}`).join(', ') + '.';
    renderTuningSelect();
    arrange();
    renderAdvisor();
  }, 30);
}

// ---------------------------------------------------------------- playback
function onTick(beat) {
  if (beat == null) {
    activeView().setPlayhead(null);
    activeView().setActive(new Set());
    kotoView.clearShow();
    return;
  }
  const sys = activeView().setPlayhead(beat);
  const active = new Set();
  const sounding = [];
  for (const ev of state.arr.events) {
    if (ev.rest) continue;
    if (beat >= ev.t - EPS && beat < ev.t + Math.max(ev.d, 0.25)) {
      active.add(ev.idx);
      sounding.push(...ev.notes);
    }
  }
  activeView().setActive(active);
  const key = [...active].join(',');
  if (key !== lastActiveKey) {
    kotoView.show(sounding);
    lastActiveKey = key;
  }
  if (sys) autoScroll(sys);
}
let lastActiveKey = '';
let lastSys = null;

function autoScroll(sys) {
  if (sys === lastSys) return;
  lastSys = sys;
  const box = $('scoreBody');
  const svg = state.view === 'tab' ? tabView.svg : vertView.svg;
  if (!svg) return;
  // keep the current line in view inside the score box (the koto stays on screen)
  const offset = svg.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
  const top = offset + sys.y0;
  const bottom = offset + sys.y1;
  if (top < box.scrollTop || bottom > box.scrollTop + box.clientHeight) {
    box.scrollTo({ top: Math.max(0, top - 8), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
}

function onState(s) {
  const b = $('playBtn');
  const playing = s === 'playing';
  b.textContent = playing ? '❚❚' : '▶';
  b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  b.classList.toggle('playing', playing);
  if (!playing) lastSys = null;
  if (s === 'playing' && audio.sampleError) {
    toast('Koto samples could not be loaded, so the built-in synth is playing.');
    audio.sampleError = null;
    $('soundSelect').value = 'synth';
  }
}

function togglePlay() {
  if (player.playing) player.pause();
  else {
    const from = state.selected != null && !player.position ? state.arr.events[state.selected].t : player.position;
    player.play(from);
  }
}

function updateSpeedLabel() {
  const pct = Number($('speed').value);
  $('speedValue').textContent = `${pct}% · ♩=${Math.round((state.song.tempo * pct) / 100)}`;
}

function loopBeats() {
  if (!state.loopBars || !$('loopToggle').checked) return null;
  const bb = barBeats(state.song.timeSig);
  return { start: state.loopBars[0] * bb, end: (state.loopBars[1] + 1) * bb };
}

function setLoopBar(bar, extend) {
  if (extend && state.loopBars) {
    const a = Math.min(state.loopBars[0], bar);
    const b = Math.max(state.loopBars[0], bar);
    state.loopBars = [a, b];
  } else state.loopBars = [bar, bar];
  $('loopToggle').checked = true;
  applyLoop();
  player.seek(state.loopBars[0] * barBeats(state.song.timeSig));
}

function applyLoop() {
  player.loop = loopBeats();
  const lb = state.loopBars;
  $('loopValue').textContent = lb && $('loopToggle').checked ? (lb[0] === lb[1] ? `${lb[0] + 1}` : `${lb[0] + 1}–${lb[1] + 1}`) : '';
  activeView().setLoop(player.loop);
}

function playEventNow(ev) {
  const ctx = audio.ensure();
  const pitches = ev.notes.filter((n) => n.string).flatMap((n) => [n.pitch, state.arr.open[n.string] ?? n.pitch]);
  audio.prepare(pitches).then(() => {
    const spb = 60 / state.song.tempo;
    for (const p of eventToPlucks(ev, spb, state.arr.open)) {
      if (p.scrape) audio.scrape(ctx.currentTime + 0.02 + p.delay, p.scrape);
      else audio.pluck({ ...p.opts, when: ctx.currentTime + 0.02 + p.delay });
    }
  });
  kotoView.show(ev.notes);
}

function pluckString(string, press) {
  const pitch = state.arr.open[string - 1] + press;
  playEventNow({ t: 0, d: 1.5, rest: false, notes: [{ string, press, pitch, finger: 1 }], techs: [] });
}

// ---------------------------------------------------------------- selection & inspector
function selectEvent(idx) {
  state.selected = idx;
  activeView().setSelected(idx);
  renderInspector();
  const ev = state.arr.events[idx];
  if (!player.playing) {
    player.position = ev.t;
    activeView().setPlayhead(ev.t);
    playEventNow(ev);
  }
}

function stepNote(dir) {
  const sounding = state.arr.events.filter((e) => !e.rest && e.notes.length);
  if (!sounding.length) return;
  let i = sounding.findIndex((e) => e.idx === state.selected);
  if (i < 0) i = dir > 0 ? -1 : sounding.length;
  i = Math.max(0, Math.min(sounding.length - 1, i + dir));
  if (player.playing) player.pause();
  selectEvent(sounding[i].idx);
}

function renderInspector() {
  const body = $('inspectorBody');
  const ev = state.selected != null ? state.arr?.events[state.selected] : null;
  if (!ev || ev.rest) {
    body.innerHTML = '<p class="muted">Click a note in the score to see how to play it.</p>';
    return;
  }
  const bb = barBeats(state.song.timeSig);
  const bar = Math.floor(ev.t / bb + EPS) + 1;
  const beat = Math.round(((ev.t % bb) + 1) * 100) / 100;
  let html = `<p class="muted small">Bar ${bar}, beat ${beat} · ${describeDur(ev.d)}</p>`;
  const techKeys = new Set();
  for (const n of ev.notes) {
    if (!n.string) { html += `<p>${pitchName(n.target)} is outside this tuning and is not played.</p>`; continue; }
    const finger = FINGERS[n.finger] || FINGERS[1];
    html += `<div class="inspect-head"><span class="inspect-kanji">${STRING_NAMES[n.string - 1]}</span><p>String ${n.string} (${STRING_READINGS[n.string - 1]})<br>
      Open ${pitchName(state.arr.open[n.string - 1])}${n.press ? `, pressed +${n.press} → <strong>${pitchName(n.pitch)}</strong>` : ` → <strong>${pitchName(n.pitch)}</strong>`}<br>
      ${finger.en} <span lang="ja">${finger.jp}</span>${finger.mark ? ` (written ${finger.mark})` : ' (unmarked)'}</p></div>`;
    if (n.shifted) html += `<p class="small">Written ${pitchName(n.target)}; moved ${n.shifted > 0 ? 'up' : 'down'} an octave to fit the strings.</p>`;
    if (n.press) techKeys.add(pressTechnique(n.press) === TECHNIQUES.press1 ? 'press1' : n.press === 2 ? 'press2' : 'press3');
  }
  for (const t of ev.techs) techKeys.add(t);
  if (ev.notes.filter((n) => n.string).length > 1) techKeys.add('awase');
  const fingerKey = ev.notes.find((n) => n.string)?.finger;
  if (fingerKey && fingerKey !== 1) html += `<p class="small">${FINGERS[fingerKey].how}</p>`;
  for (const k of techKeys) {
    const t = TECHNIQUES[k];
    if (!t) continue;
    html += `<div class="inspect-tech"><h3><span class="sym">${t.symbol}</span>${t.en} <span lang="ja">${t.jp}</span></h3><p>${t.summary}</p><ol>${t.steps.map((s) => `<li>${s}</li>`).join('')}</ol></div>`;
  }
  if (ev.shoga) html += `<p class="small">${escapeHtml(state.song.syllables || 'Syllable')}: <em>${escapeHtml(ev.shoga)}</em></p>`;
  html += '<button class="hear" id="hearNote">Hear this note</button>';
  body.innerHTML = html;
  $('hearNote').addEventListener('click', () => playEventNow(ev));
}

function describeDur(d) {
  const names = { 4: 'whole note', 3: 'dotted half', 2: 'half note', 1.5: 'dotted quarter', 1: 'quarter note', 0.75: 'dotted eighth', 0.5: 'eighth note', 0.25: 'sixteenth', 0.125: 'thirty-second' };
  return names[d] || `${Math.round(d * 100) / 100} beats`;
}

// ---------------------------------------------------------------- learn drawer
function renderLearn() {
  const body = $('learnBody');
  let html = '';
  for (const l of LESSONS) html += `<h3>${l.title}</h3>${l.body.map((p) => `<p>${p}</p>`).join('')}`;
  html += '<h3>Tunings at a glance</h3><p>Open pitches with string 一 on D (壱越). Red pitches are bridges moved from hira-jōshi.</p><div style="overflow-x:auto"><table class="tuning-table"><thead><tr><th></th>' + STRING_NAMES.map((n) => `<th>${n}</th>`).join('') + '</tr></thead><tbody>';
  const hira = hiraPitches(0);
  for (const t of TUNINGS) {
    html += `<tr><td><strong>${t.name}</strong> ${t.jp}<br><button class="hear" data-tuning="${t.id}">Hear it</button></td>` + t.strings.map((p, i) => `<td class="${p !== hira[i] ? 'chg' : ''}">${pitchName(p, { octave: false })}</td>`).join('') + '</tr>';
  }
  html += '</tbody></table></div>';
  html += '<h3>Right-hand fingers</h3><div class="glossary">';
  for (const k of [1, 2, 3, 'L']) {
    const f = FINGERS[k];
    html += `<div class="gloss"><h4><span class="sym">${f.mark || '—'}</span>${f.en} <span class="jp" lang="ja">${f.jp} ${f.romaji}</span></h4><p>${f.how}</p></div>`;
  }
  html += '</div><h3>Techniques and their symbols</h3><div class="glossary">';
  for (const [k, t] of Object.entries(TECHNIQUES)) {
    html += `<div class="gloss"><h4><span class="sym">${t.symbol}</span>${t.en} <span class="jp" lang="ja">${t.jp} ${t.romaji}</span></h4><p>${t.summary}</p><ol>${t.steps.map((s) => `<li>${s}</li>`).join('')}</ol><button class="hear" data-tech="${k}">Hear it</button></div>`;
  }
  html += '</div>';
  body.innerHTML = html;
  body.querySelectorAll('[data-tech]').forEach((b) => b.addEventListener('click', () => demoTechnique(b.dataset.tech)));
  body.querySelectorAll('[data-tuning]').forEach((b) => b.addEventListener('click', () => demoTuning(b.dataset.tuning)));
}

function demoTechnique(key) {
  const open = state.arr.open;
  const s = 7;
  const n = (press = 0, string = s) => ({ string, press, pitch: open[string - 1] + press, finger: 1 });
  let ev;
  switch (key) {
    case 'press1': ev = { notes: [n(1)], techs: [] }; break;
    case 'press2': ev = { notes: [n(2)], techs: [] }; break;
    case 'press3': ev = { notes: [n(3)], techs: [] }; break;
    case 'awase': ev = { notes: [n(0, 10), n(0, 5)], techs: [] }; break;
    case 'hanashi': ev = { notes: [n(2)], techs: ['hanashi'] }; break;
    default: ev = { notes: [n(0)], techs: [key] };
  }
  const evs = key === 'wari' ? [ev, { ...ev, delay: 0.32 }] : [ev];
  for (const e of evs) setTimeout(() => playEventNow({ t: 0, d: 2.2, rest: false, ...e }), (e.delay || 0) * 1000);
}

function demoTuning(id) {
  const t = getTuning(id);
  const ctx = audio.ensure();
  const open = t.strings.map((p) => p + state.base);
  audio.prepare(open).then(() => {
    open.forEach((p, i) => audio.pluck({ midi: p, when: ctx.currentTime + 0.05 + i * 0.22, dur: 0.6, string: i + 1 }));
  });
}

// ---------------------------------------------------------------- editor
let editorSong = null;
function openEditor(song = state.song) {
  editorSong = song;
  $('edTitle').value = song.title;
  $('edMode').value = song.mode;
  const sel = $('edTuning');
  sel.innerHTML = TUNINGS.map((t) => `<option value="${t.id}">${t.name} ${t.jp}</option>`).join('') + '<option value="auto">Any (pitch songs)</option>';
  sel.value = song.tuning && (getTuning(song.tuning) || song.tuning === 'auto') ? song.tuning : 'hira';
  $('edTempo').value = song.tempo;
  $('edTime').value = song.timeSig.join('/');
  $('edScore').value = song.score.trim();
  $('edError').textContent = '';
  $('edDelete').hidden = !song.user;
  $('editorDrawer').showModal();
}

function songFromEditor() {
  const ts = /^(\d+)\/(\d+)$/.exec($('edTime').value.trim());
  if (!ts) throw new Error('Time signature should look like 4/4 or 6/8.');
  const mode = $('edMode').value;
  const tuning = $('edTuning').value;
  const song = {
    ...editorSong,
    title: $('edTitle').value.trim() || 'Untitled',
    mode,
    tuning: mode === 'strings' && tuning === 'auto' ? 'hira' : tuning,
    tempo: Math.max(20, Math.min(240, Number($('edTempo').value) || 80)),
    timeSig: [Number(ts[1]), Number(ts[2])],
    score: $('edScore').value,
  };
  if (mode === 'pitch') delete song.sourceOpen;
  parseSong(song); // throws on error
  return song;
}

function editorApply(save) {
  let song;
  try {
    song = songFromEditor();
  } catch (err) {
    $('edError').textContent = err instanceof ScoreError ? `${err.message} (token ${err.index + 1}: “${err.token}”)` : err.message;
    return null;
  }
  $('edError').textContent = '';
  if (save) {
    if (!song.user) song = { ...song, id: 'user-' + Date.now().toString(36), user: true, category: 'My songs' };
    const i = userSongs.findIndex((s) => s.id === song.id);
    if (i >= 0) userSongs[i] = song; else userSongs.push(song);
    toast(saveUserSongs(userSongs) ? `Saved “${song.title}” to My songs.` : 'Your browser blocked saving; download the .json instead.');
  }
  loadSong(song);
  return song;
}

function download(name, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function addImportedSong(song) {
  userSongs.push(song);
  saveUserSongs(userSongs);
  loadSong(song);
  toast(`Added “${song.title}” to My songs.`);
}

// ---------------------------------------------------------------- imports
let midiData = null;
async function onMidiFile(file) {
  try {
    midiData = await readMidi(await file.arrayBuffer());
  } catch (err) {
    toast(`That MIDI file could not be read: ${err.message}`);
    return;
  }
  midiData.fileName = file.name.replace(/\.(mid|midi)$/i, '');
  const sel = $('midiTrack');
  sel.innerHTML = midiData.tracks.map((t, i) => `<option value="${i}">${escapeHtml(t.name)} — ${t.notes.length} notes</option>`).join('');
  // default: the track with the highest average pitch (usually the melody)
  let best = 0, bestAvg = -1;
  midiData.tracks.forEach((t, i) => { const avg = t.notes.reduce((s, n) => s + n.pitch, 0) / t.notes.length; if (avg > bestAvg) { bestAvg = avg; best = i; } });
  sel.value = String(best);
  $('midiDialog').showModal();
}

function importMidi() {
  const tr = midiData.tracks[Number($('midiTrack').value)];
  const timeSig = midiData.timeSig;
  const events = midiToEvents(tr.notes, { voices: Number($('midiVoices').value), grid: Number($('midiGrid').value), timeSig });
  const song = {
    id: 'user-' + Date.now().toString(36), user: true, category: 'My songs',
    title: midiData.name || midiData.fileName || 'Imported song', composer: 'Imported from MIDI', mode: 'pitch', tuning: 'auto', base: 0,
    tempo: midiData.tempo, timeSig, about: `Arranged automatically from “${tr.name}”. Open the score editor to refine it.`,
    score: eventsToText(events, timeSig, 'pitch'),
  };
  $('midiDialog').close();
  addImportedSong(song);
}

async function onKrnFile(file) {
  try {
    const res = parseHumdrumKoto(await file.text());
    let tuning = null, base = 0;
    if (res.tuning && res.tuning.length === 13) {
      for (const t of TUNINGS) {
        const off = res.tuning[0] - t.strings[0];
        if (t.strings.every((p, i) => p + off === res.tuning[i])) { tuning = t.id; base = off; break; }
      }
    }
    const song = {
      id: 'user-' + Date.now().toString(36), user: true, category: 'My songs',
      title: res.title || file.name.replace(/\.\w+$/, ''), composer: 'Imported from Humdrum **koto', mode: 'strings',
      tuning: tuning || 'hira', base, tempo: 72, timeSig: res.timeSig, syllables: 'Kuchi-shōga',
      about: 'Imported from a Humdrum **koto file.',
      score: eventsToText(res.events, res.timeSig, 'strings'),
    };
    if (!tuning && res.tuning) song.sourceOpen = res.tuning;
    addImportedSong(song);
  } catch (err) {
    toast(`That file could not be read: ${err.message}`);
  }
}

async function onJsonFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data.score || !data.timeSig) throw new Error('missing score or timeSig');
    addImportedSong({ ...data, id: 'user-' + Date.now().toString(36), user: true, category: 'My songs' });
  } catch (err) {
    toast(`That song file could not be read: ${err.message}`);
  }
}

// ---------------------------------------------------------------- misc ui
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function closeLibrary() {
  $('library').classList.remove('open');
  $('libraryToggle').setAttribute('aria-expanded', 'false');
}

function bind() {
  $('tuningSelect').addEventListener('change', (e) => { state.tuningId = e.target.value; state.autoTranspose = true; renderTuningSelect(); arrange(); renderAdvisor(); });
  $('baseSelect').addEventListener('change', (e) => { state.base = Number(e.target.value); arrange(); scheduleAdvisor(); });
  $('transDown').addEventListener('click', () => { state.autoTranspose = false; state.transpose -= 1; arrange(); });
  $('transUp').addEventListener('click', () => { state.autoTranspose = false; state.transpose += 1; arrange(); });
  $('transAuto').addEventListener('click', () => { state.autoTranspose = true; arrange(); });
  $('maxPress').addEventListener('change', (e) => { state.maxPress = Number(e.target.value); arrange(); scheduleAdvisor(); });
  $('keepStrings').addEventListener('change', (e) => { state.keepStrings = e.target.checked; arrange(); });
  $('playBtn').addEventListener('click', togglePlay);
  $('stopBtn').addEventListener('click', () => player.stop());
  $('prevBtn').addEventListener('click', () => stepNote(-1));
  $('nextBtn').addEventListener('click', () => stepNote(1));
  $('speed').addEventListener('input', (e) => { player.setSpeed(Number(e.target.value) / 100); updateSpeedLabel(); });
  $('loopToggle').addEventListener('change', () => {
    if ($('loopToggle').checked && !state.loopBars) state.loopBars = [0, Math.min(3, state.arr.measures.length - 1)];
    applyLoop();
  });
  $('metronome').addEventListener('change', (e) => { player.metronome = e.target.checked; });
  $('countIn').addEventListener('change', (e) => { player.countIn = e.target.checked; });
  $('soundSelect').addEventListener('change', (e) => {
    audio.mode = e.target.value;
    if (audio.mode === 'samples') toast('Loading koto samples (FluidR3 GM, CC BY 3.0) the next time you play.');
  });
  document.querySelectorAll('.score-tabs .tab').forEach((t) => t.addEventListener('click', () => {
    state.view = t.dataset.view;
    document.querySelectorAll('.score-tabs .tab').forEach((x) => { x.classList.toggle('active', x === t); x.setAttribute('aria-selected', String(x === t)); });
    renderScore();
  }));
  $('showPitches').addEventListener('change', renderScore);
  $('showSyllables').addEventListener('change', renderScore);
  $('fitBridges').addEventListener('click', fitBridges);
  $('mainTabPlay').addEventListener('click', () => showPanel('play'));
  $('mainTabTune').addEventListener('click', () => showPanel('tune'));
  $('changeTuning').addEventListener('click', () => showPanel('tune'));
  $('retuneGuide').addEventListener('click', () => showPanel('tune', { startGuide: true }));
  $('retuneDone').addEventListener('click', () => markTuned());
  $('retuneCheck').addEventListener('click', () => showPanel('tune', { check: true }));
  $('guideAlready').addEventListener('click', () => { markTuned(); guide.setTarget(currentTarget(), myKoto); });
  $('guideToPlay').addEventListener('click', () => showPanel('play'));
  $('rtlToggle').checked = prefs.rtl;
  $('rtlToggle').addEventListener('change', (e) => { prefs.rtl = e.target.checked; saveJSON(PREFS_KEY, prefs); renderScore(); });
  $('a4Select').value = String(prefs.a4);
  audio.setA4(prefs.a4);
  $('a4Select').addEventListener('change', (e) => { prefs.a4 = Number(e.target.value); saveJSON(PREFS_KEY, prefs); audio.setA4(prefs.a4); });
  $('openLearn').addEventListener('click', () => { renderLearn(); $('learnDrawer').showModal(); });
  $('openEditor').addEventListener('click', () => openEditor());
  $('newSong').addEventListener('click', () => {
    closeLibrary();
    openEditor({ id: 'new', title: 'New song', mode: 'pitch', tuning: 'auto', base: 0, tempo: 80, timeSig: [4, 4], score: 'C4q D4q E4q G4q | A4h G4h |', category: 'My songs', about: '' });
  });
  $('edApply').addEventListener('click', () => { if (editorApply(false)) $('editorDrawer').close(); });
  $('edSave').addEventListener('click', () => { if (editorApply(true)) $('editorDrawer').close(); });
  $('edExport').addEventListener('click', () => {
    let song;
    try { song = songFromEditor(); } catch (err) { $('edError').textContent = err.message; return; }
    const { user, ...clean } = song;
    void user;
    download(`${(song.title || 'song').replace(/[^\w-]+/g, '-').toLowerCase()}.kotolab.json`, JSON.stringify(clean, null, 2));
  });
  $('edDelete').addEventListener('click', () => {
    userSongs = userSongs.filter((s) => s.id !== editorSong.id);
    saveUserSongs(userSongs);
    $('editorDrawer').close();
    loadSong(SONGS[0]);
  });
  $('midiFile').addEventListener('change', (e) => { if (e.target.files[0]) onMidiFile(e.target.files[0]); e.target.value = ''; closeLibrary(); });
  $('krnFile').addEventListener('change', (e) => { if (e.target.files[0]) onKrnFile(e.target.files[0]); e.target.value = ''; closeLibrary(); });
  $('jsonFile').addEventListener('change', (e) => { if (e.target.files[0]) onJsonFile(e.target.files[0]); e.target.value = ''; closeLibrary(); });
  $('midiImport').addEventListener('click', importMidi);
  document.querySelectorAll('dialog [data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));
  $('libraryToggle').addEventListener('click', () => {
    const open = $('library').classList.toggle('open');
    $('libraryToggle').setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select, dialog[open]') || e.metaKey || e.ctrlKey || state.panel !== 'play') return;
    if (e.code === 'Space' && !e.target.closest('button, [role=button]')) { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepNote(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepNote(-1); }
  });
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderScore, 150);
  });
}

function start() {
  bind();
  const m = /song=([^&]+)/.exec(location.hash);
  const wanted = m && allSongs().find((s) => s.id === decodeURIComponent(m[1]));
  loadSong(wanted || SONGS[0]);
}

start();

// expose for debugging and tests
window.kotolab = { state, player, audio, describe, guide, showPanel, get myKoto() { return myKoto; } };
