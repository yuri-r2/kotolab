import { TUNINGS, BASES, STRING_NAMES, STRING_READINGS, getTuning, hiraPitches, pitchName, checkTuningRealism, makeUserTuning, registerUserTunings, tuningOpen, bestBase } from './tunings.js';
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
import { ScreenWake } from './wakelock.js';
import { initTooltips } from './tooltip.js';
import { SONG_LEVELS } from './song-levels.js';
import { songDifficulty } from './difficulty.js';
import { LEVEL_TIERS } from './engine.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'kotolab.songs.v1';
const PREFS_KEY = 'kotolab.prefs.v1';
const TUNING_KEY = 'kotolab.tunings.v1';
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
  selection: null,
  loopOn: false,
  panel: 'play',
};

const audio = new KotoAudio();
const kotoView = new KotoView($('kotoView'), { onPluck: pluckString });
const tabView = new TabView($('tabView'), { onSelect: selectEvent, onBar: selectBar, onRange: onRangeSelected, onSeek: seekTo, scrollBox: $('scoreBody') });
const vertView = new VerticalView($('vertView'), { onSelect: selectEvent, onBar: selectBar });
const player = new Player(audio, { onTick, onState });
const guideKoto = new KotoView($('guideKoto'), { onPluck: (string) => {
  const p = guide.target?.open[string - 1];
  if (p != null) audio.prepare([p]).then(() => audio.pluck({ midi: p, when: audio.now() + 0.02, dur: 1.5, string }));
} });
const guide = new TuningGuide({
  els: {
    intro: $('guideIntro'), target: $('guideTarget'),
    check: $('guideCheck'), again: $('guideAgain'), pegs: $('guidePegs'), knots: $('guideKnots'), bridgesNow: $('guideBridgesNow'),
    finishList: $('guideFinishList'), toPlay: $('guideToPlay'), chips: $('stepChips'), level: $('micLevel'), startBox: $('guideStartBox'), step: $('guideStep'), kanji: $('stepKanji'), progress: $('stepProgress'),
    what: $('stepWhat'), hint: $('stepHint'), playTarget: $('stepPlay'), playCompare: $('stepCompare'), mic: $('stepMic'),
    length: $('guideLength'), lengthWrap: $('guideLengthWrap'), place: $('stepPlace'), meter: $('tunerMeter'), placeMarker: $('placeMarker'), placeLabel: $('placeLabel'),
    micAlert: $('micAlert'), micAlertText: $('micAlertText'), micRetry: $('micRetry'),
    gauge: $('tunerGauge'), readout: $('tunerReadout'), back: $('stepBack'), exit: $('stepExit'), next: $('stepNext'), finish: $('guideFinish'), finishText: $('guideFinishText'),
  },
  audio, kotoView: guideKoto, presets: TUNINGS, bases: BASES,
  onTuned: (target, { verified } = {}) => { if (verified) toast(`Your koto is in ${target.label}.`); },
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
const prefs = { rtl: false, a4: 440, keepAwake: false, zoom: 1, libraryOrder: 'level', ...loadJSON(PREFS_KEY, {}) };

const wake = new ScreenWake({ onChange: renderWake });
let wakeNotified = false;
function renderWake(w) {
  const b = document.getElementById('wakeBtn');
  if (!b) return;
  b.setAttribute('aria-pressed', String(w.enabled));
  b.classList.toggle('on', w.enabled && w.active);
  b.classList.toggle('waiting', w.enabled && !w.active);
  document.getElementById('wakeLbl').textContent = !w.enabled ? 'Keep screen on' : w.active ? 'Screen stays on' : 'Screen on: tap to retry';
  if (w.enabled && w.error && w.error !== 'unsupported' && !wakeNotified) {
    wakeNotified = true;
    toast('This browser didn’t allow keeping the screen on. Battery saver can block it, and some in-app browsers never allow it. Tap anywhere to try again, or open KotoLab in Chrome, Safari, Edge or Firefox.');
  }
  if (w.active) wakeNotified = false;
}
// how the player's own koto is tuned right now: { open: number[13], label, base }
let userTunings = loadJSON(TUNING_KEY, []).filter((t) => Array.isArray(t.strings) && t.strings.length === 13);
registerUserTunings(userTunings);
const allSongs = () => [...SONGS, ...userSongs];

// ---------------------------------------------------------------- library
const openGroups = new Set();
const levelCache = new Map(Object.entries(SONG_LEVELS));

/** Difficulty for any song (precomputed for the library, computed once for your own songs). */
function levelOf(song) {
  if (!levelCache.has(song.id)) {
    try { levelCache.set(song.id, songDifficulty(song)); } catch { levelCache.set(song.id, { difficulty: 5, level: 3 }); }
  }
  return levelCache.get(song.id);
}

function renderLibrary() {
  const list = $('songList');
  const q = ($('songSearch')?.value || '').trim().toLowerCase();
  const byLevel = prefs.libraryOrder !== 'collection';
  $('orderLevel').setAttribute('aria-pressed', String(byLevel));
  $('orderCollection').setAttribute('aria-pressed', String(!byLevel));
  list.innerHTML = '';
  const groups = new Map();
  if (byLevel) for (const tier of LEVEL_TIERS) groups.set(`Level ${tier.number} · ${tier.name}`, []);
  const songs = allSongs().filter((s) => !q || `${s.title} ${s.jp || ''} ${s.composer || ''} ${s.category || ''}`.toLowerCase().includes(q));
  for (const s of songs) {
    const key = byLevel ? (() => { const t = LEVEL_TIERS[(levelOf(s).level || 3) - 1]; return `Level ${t.number} · ${t.name}`; })() : (s.user ? 'My songs' : s.category);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  if (byLevel) for (const arr of groups.values()) arr.sort((a, b) => levelOf(a).difficulty - levelOf(b).difficulty);
  for (const [k, arr] of [...groups]) if (!arr.length) groups.delete(k);
  if (!groups.size) list.innerHTML = '<p class="hint">No songs match. Try a shorter word, or import your own below.</p>';
  let i = 0;
  for (const [cat, items] of groups) {
    const det = document.createElement('details');
    det.className = 'song-group';
    const hasCurrent = items.some((s) => state.song && state.song.id === s.id);
    det.open = !!q || hasCurrent || openGroups.has(cat) || (i === 0 && !openGroups.size);
    if (det.open) openGroups.add(cat);
    det.addEventListener('toggle', () => { if (det.open) openGroups.add(cat); else openGroups.delete(cat); });
    const tier = byLevel ? LEVEL_TIERS.find((t) => cat.startsWith(`Level ${t.number}`)) : null;
    det.innerHTML = `<summary>${escapeHtml(cat)} <span class="count">${items.length}</span></summary>${tier ? `<p class="group-about">${escapeHtml(tier.about)}</p>` : ''}`;
    for (const s of items) {
      const b = document.createElement('button');
      b.className = 'song-btn';
      b.setAttribute('aria-current', state.song && state.song.id === s.id ? 'true' : 'false');
      const lv = levelOf(s);
      const kind = s.mode === 'strings' ? 'koto score' : 'arranged';
      const where = byLevel ? (s.user ? 'My songs' : s.category) : `Level ${lv.level}`;
      b.innerHTML = `<span class="song-line"><span>${escapeHtml(s.title)}</span><span class="lv lv${lv.level}" data-tip="Level ${lv.level} of 5 · difficulty ${lv.difficulty} of 10">${lv.level}</span></span><small>${escapeHtml(s.jp ? s.jp + ' · ' : '')}${escapeHtml(kind)} · ${escapeHtml(where)}</small>`;
      b.addEventListener('click', () => { loadSong(s); closeLibrary(); });
      det.appendChild(b);
    }
    list.appendChild(det);
    i++;
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
  state.songChanged = true;
  state.srcEvents = evs;
  state.selected = null;
  state.selection = null;
  state.loopOn = false;
  tabView.selection = null;
  vertView.selection = null;
  player.stopAt = null;
  player.rangeStart = null;
  $('loopToggle').checked = false;
  $('loopValue').textContent = '';
  renderSelectionBar();
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
      if (getTuning(song.tuning)?.user) state.base = getTuning(song.tuning).base;
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
  return tuningOpen(t, state.base);
}

function isOriginalSetting() {
  const s = state.song;
  return s.mode === 'strings' && state.keepStrings && (
    (state.tuningId === s.tuning && (!s.sourceOpen || getTuning(s.tuning)?.user)) ||
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
  const presetGroup = document.createElement('optgroup');
  presetGroup.label = 'Traditional tunings';
  const userGroup = document.createElement('optgroup');
  userGroup.label = 'My tunings';
  for (const t of TUNINGS) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.user ? t.name : `${t.name} ${t.jp}`;
    (t.user ? userGroup : presetGroup).appendChild(o);
  }
  sel.appendChild(presetGroup);
  if (userGroup.children.length) sel.appendChild(userGroup);
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
  const isUser = !!getTuning(state.tuningId)?.user;
  bs.disabled = state.tuningId === 'custom' || isUser;
  bs.title = isUser ? 'Set by your custom tuning' : '';
  $('editTuning').hidden = !isUser;
  $('saveFitted').hidden = state.tuningId !== 'custom';
}

function tuningLabel(open = state.arr.open) {
  for (const t of TUNINGS) {
    for (const b of BASES) {
      if (t.user && b.offset !== t.base) continue;
      if (t.strings.every((p, i) => p + b.offset === open[i])) return t.user ? `${t.name} (my tuning)` : `${t.name} ${t.jp}, 一 on ${b.name.split(' (')[0]}`;
    }
  }
  return `custom bridges (${open.map((p) => pitchName(p, { octave: false })).join(' ')})`;
}

function currentTarget() {
  return { open: state.arr.open.slice(), label: tuningLabel(), base: state.base };
}

let lastTuningKey = null;

/** The quiet tuning line on the Play tab; flags a change from the previous song (this visit only). */
function renderTuningStatus() {
  $('tuneSummary').textContent = tuningLabel();
  const key = state.arr.open.join(',');
  $('tuningChanged').hidden = !(lastTuningKey && lastTuningKey !== key && state.songChanged);
  $('tuningLine').classList.toggle('changed', !$('tuningChanged').hidden);
  state.songChanged = false;
  lastTuningKey = key;
  if (state.panel === 'tune' && guide.index < 0 && !sameOpen(guide.target?.open, state.arr.open)) guide.setTarget(currentTarget());
}

function sameOpen(a, b) {
  return !!a && !!b && a.every((p, i) => p === b[i]);
}

function showPanel(panel, { check = false } = {}) {
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
  guide.setTarget(currentTarget());
  if (check) guide.begin('check');
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
  for (const v of [tabView, vertView]) v.options = { syllables: syl, pitches, rtl: prefs.rtl, zoom: prefs.zoom };
  $('zoomOut').disabled = prefs.zoom <= 0.7;
  $('zoomIn').disabled = prefs.zoom >= 1.8;
  $('rtlWrap').hidden = state.view !== 'tab';
  $('tabView').hidden = state.view !== 'tab';
  $('vertView').hidden = state.view !== 'vertical';
  if (state.view === 'tab') tabView.render(state.arr);
  else vertView.render(state.arr);
  activeView().setSelected(state.selected);
  activeView().setSelection(state.selection, { looping: state.loopOn });
}

const activeView = () => (state.view === 'tab' ? tabView : vertView);

function renderPlayability() {
  const { stats, issues } = state.arr;
  $('diffLevel').textContent = `Level ${stats.levelNumber} · ${stats.level}`;
  $('diffScore').textContent = `${stats.difficulty} / 10`;
  $('diffBar').style.width = `${stats.difficulty * 10}%`;
  const cells = [
    ['Notes', stats.notes, '', 'Notes plucked, chords counted per string'],
    ['Open strings', stats.open, '', 'Notes with no left-hand press'],
    ['Half presses ヲ', stats.half, 'press', 'Left hand presses a half step'],
    ['Whole presses オ', stats.whole, 'press', 'Left hand presses a whole step (harder)'],
    ['Deeper presses', stats.triple, 'press', 'Step-and-a-half presses'],
    ['Moved octave', stats.shifted + stats.omitted, '', 'Notes moved an octave to fit the koto'],
  ];
  $('stats').innerHTML = cells.map(([k, v, c, tip]) => `<div class="${c}" data-tip="${escapeHtml(tip)}" tabindex="0"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
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
      b.addEventListener('click', () => { selectBar(is.bar - 1, false); });
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
      selectTuning(r.tuning.id);
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
  if (player.playing) { player.pause(); return; }
  const sel = state.selection;
  let from = state.selected != null && !player.position ? state.arr.events[state.selected].t : player.position;
  // with a passage selected, Play plays that passage (as in Guitar Pro)
  if (sel && (from < sel.start - EPS || from >= sel.end - EPS)) from = sel.start;
  player.play(from);
}

function updateSpeedLabel() {
  const pct = Number($('speed').value);
  $('speedValue').textContent = `${pct}% ♩${Math.round((state.song.tempo * pct) / 100)}`;
  document.querySelectorAll('.sel-chip').forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.speed) === pct)));
}

function setSpeedPercent(pct) {
  $('speed').value = String(pct);
  player.setSpeed(pct / 100);
  updateSpeedLabel();
}

// ---------------------------------------------------------------- selection (Guitar Pro style)
function barsOf(sel) {
  const bb = barBeats(state.song.timeSig);
  return [Math.floor(sel.start / bb + EPS) + 1, Math.floor((sel.end - EPS) / bb) + 1];
}

function setSelection(sel, { final = true, seek = true } = {}) {
  state.selection = sel && sel.end > sel.start + EPS ? sel : null;
  tabView.setSelection(state.selection, { looping: state.loopOn });
  vertView.setSelection(state.selection, { looping: state.loopOn });
  renderSelectionBar();
  if (!final) return;
  applySelectionToPlayer();
  if (seek && state.selection) {
    const p = player.playing ? player.position : player.position || 0;
    if (p < state.selection.start - EPS || p >= state.selection.end - EPS) seekTo(state.selection.start);
  }
}

function onRangeSelected(sel, { final }) {
  setSelection(sel, { final });
}

function applySelectionToPlayer() {
  const sel = state.selection;
  const whole = { start: 0, end: player.total || 0 };
  player.loop = state.loopOn ? (sel || whole) : null;
  player.stopAt = !state.loopOn && sel ? sel.end : null;
  player.rangeStart = sel ? sel.start : null;
  $('loopToggle').checked = state.loopOn;
  $('selLoop').setAttribute('aria-pressed', String(state.loopOn));
  $('loopValue').textContent = state.loopOn && sel ? (() => { const [a, b] = barsOf(sel); return a === b ? `bar ${a}` : `bars ${a}–${b}`; })() : '';
}

function setLooping(on) {
  state.loopOn = on;
  tabView.setSelection(state.selection, { looping: on });
  vertView.setSelection(state.selection, { looping: on });
  applySelectionToPlayer();
  renderSelectionBar();
}

function renderSelectionBar() {
  const sel = state.selection;
  $('selBar').dataset.empty = String(!sel);
  $('selEmpty').hidden = !!sel;
  $('selTools').hidden = !sel;
  if (!sel) return;
  const [a, b] = barsOf(sel);
  const bb = barBeats(state.song.timeSig);
  const whole = Math.abs(sel.start - (a - 1) * bb) < EPS && Math.abs(sel.end - b * bb) < EPS;
  const notes = state.arr.events.filter((e) => !e.rest && e.t >= sel.start - EPS && e.t < sel.end - EPS).length;
  const where = a === b ? `Bar ${a}` : `Bars ${a}–${b}`;
  $('selInfo').textContent = `${where}${whole ? '' : ' (part)'} · ${notes} note${notes === 1 ? '' : 's'}`;
  $('selLoop').setAttribute('aria-pressed', String(state.loopOn));
}

/** Bar-number click: select that bar; Shift extends from the current selection. */
function selectBar(bar, extend) {
  const bb = barBeats(state.song.timeSig);
  let start = bar * bb, end = (bar + 1) * bb;
  if (extend && state.selection) {
    start = Math.min(start, state.selection.start);
    end = Math.max(end, state.selection.end);
  }
  setSelection({ start, end: Math.min(end, state.arr.measures.length * bb) });
}

function seekTo(beat) {
  state.selected = null;
  activeView().setSelected(null);
  renderInspector();
  if (player.playing) player.seek(beat);
  else {
    player.position = beat;
    activeView().setPlayhead(beat);
  }
}

/** Shift+arrow: grow or shrink the selection one note at a time. */
function extendSelection(dir) {
  const cols = state.arr.events;
  let sel = state.selection;
  if (!sel) {
    const ev = state.selected != null ? state.arr.events[state.selected] : cols.find((e) => e.t >= (player.position || 0) - EPS) || cols[0];
    sel = { start: ev.t, end: ev.t + ev.d };
    if (dir < 0) { setSelection(sel); return; }
  }
  if (dir > 0) {
    const next = cols.find((e) => e.t >= sel.end - EPS);
    if (next) sel = { start: sel.start, end: next.t + next.d };
  } else {
    const last = cols.filter((e) => e.t < sel.end - EPS && e.t >= sel.start - EPS);
    if (last.length > 1) sel = { start: sel.start, end: last[last.length - 1].t };
  }
  setSelection(sel, { seek: false });
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
    const names = tuningOpen(t, 0);
    html += `<tr><td><strong>${escapeHtml(t.name)}</strong> ${t.user ? '<em>(my tuning)</em>' : t.jp}<br><button class="hear" data-tuning="${t.id}">Hear it</button></td>` + t.strings.map((p, i) => `<td class="${p !== hira[i] ? 'chg' : ''}">${pitchName(names[i], { octave: false })}</td>`).join('') + '</tr>';
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
  const open = tuningOpen(t, state.base);
  audio.prepare(open).then(() => {
    open.forEach((p, i) => audio.pluck({ midi: p, when: ctx.currentTime + 0.05 + i * 0.22, dur: 0.6, string: i + 1 }));
  });
}

// ---------------------------------------------------------------- full screen & zoom
let fullscreenOn = false;

/** Compact playback bar on phones, short landscape screens and in full screen. */
function updateTransportLayout(initial = false) {
  const compact = fullscreenOn || window.innerWidth <= 820 || window.innerHeight <= 500;
  const t = document.querySelector('.transport');
  const changed = t.classList.contains('compact') !== compact;
  t.classList.toggle('compact', compact);
  if (initial || changed) $('transportMore').open = !compact;
}

function setZoom(z) {
  prefs.zoom = Math.round(Math.max(0.7, Math.min(1.8, z)) * 100) / 100;
  saveJSON(PREFS_KEY, prefs);
  renderScore();
}

async function toggleFullscreen() {
  if (fullscreenOn) { exitFullscreen(); return; }
  fullscreenOn = true;
  const area = $('playerArea');
  area.classList.add('fullscreen');
  document.body.classList.add('has-fullscreen');
  $('fullscreenBtn').setAttribute('aria-pressed', 'true');
  $('fullscreenBtn').setAttribute('aria-label', 'Exit full screen');
  $('fullscreenBtn').textContent = '✕';
  updateTransportLayout();
  // real full screen where the browser allows it (not on iPhone); the fixed
  // layout above already fills the window either way
  try { if (area.requestFullscreen && !document.fullscreenElement) await area.requestFullscreen({ navigationUI: 'hide' }); } catch { /* fixed layout only */ }
  requestAnimationFrame(() => { renderScore(); if (player.position) onTick(player.position); });
}

function exitFullscreen() {
  fullscreenOn = false;
  $('playerArea').classList.remove('fullscreen');
  document.body.classList.remove('has-fullscreen');
  $('fullscreenBtn').setAttribute('aria-pressed', 'false');
  $('fullscreenBtn').setAttribute('aria-label', 'Full screen');
  $('fullscreenBtn').textContent = '⛶';
  updateTransportLayout();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  requestAnimationFrame(() => renderScore());
}

// ---------------------------------------------------------------- custom tunings
function selectTuning(id) {
  state.tuningId = id;
  const t = getTuning(id);
  if (t?.user) state.base = t.base;
  state.autoTranspose = true;
  renderTuningSelect();
  arrange();
  renderAdvisor();
}

const PITCH_MIN = 36; // C2
const PITCH_MAX = 96; // C7
const ct = { editing: null, pitches: [] };
let ctKoto = null;

function pitchOptionLabel(p) {
  const flat = pitchName(p);
  const sharp = pitchName(p, { flats: false });
  return flat === sharp ? flat : `${flat} / ${sharp}`;
}

function openTuningEditor(existing, { pitches, name } = {}) {
  ct.editing = existing || null;
  ct.pitches = (existing ? tuningOpen(existing) : pitches || state.arr.open).slice();
  $('ctName').value = existing ? existing.name : name || '';
  $('tuningDialogTitle').textContent = existing ? `Edit “${existing.name}”` : 'New custom tuning';
  $('ctDelete').hidden = !existing;
  const start = $('ctStart');
  start.innerHTML = '<option value="">Keep the notes below</option><option value="__current">This song’s current tuning</option>' +
    TUNINGS.map((t) => `<option value="${t.id}">${escapeHtml(t.user ? t.name + ' (my tuning)' : `${t.name} ${t.jp}`)}</option>`).join('');
  start.value = '';
  if (!ctKoto) ctKoto = new KotoView($('ctKoto'), { onPluck: (string, press) => hearPitch(ct.pitches[string - 1] + press, string) });
  renderTuningRows();
  $('tuningDialog').showModal();
}

function hearPitch(midi, string = 99, when = 0.02) {
  audio.prepare([midi]).then(() => audio.pluck({ midi, when: audio.now() + when, dur: 1.2, string }));
}

function renderTuningRows() {
  const base = bestBase(ct.pitches);
  const hira = hiraPitches(base);
  const tbody = $('ctRows');
  tbody.innerHTML = '';
  ct.pitches.forEach((p, i) => {
    const tr = document.createElement('tr');
    const d = p - hira[i];
    let opts = '';
    for (let m = PITCH_MIN; m <= PITCH_MAX; m++) opts += `<option value="${m}"${m === p ? ' selected' : ''}>${pitchOptionLabel(m)}</option>`;
    tr.innerHTML = `<td class="kanji">${STRING_NAMES[i]}</td><td class="muted">${STRING_READINGS[i]}</td>
      <td><select aria-label="Note for string ${STRING_NAMES[i]}">${opts}</select></td>
      <td class="nudge"><button aria-label="Lower string ${STRING_NAMES[i]} a half step">−</button><button aria-label="Raise string ${STRING_NAMES[i]} a half step">+</button></td>
      <td class="delta">${d ? (d > 0 ? '+' : '') + d : ''}</td>
      <td><button class="hear" aria-label="Hear string ${STRING_NAMES[i]}">Hear</button></td>`;
    const [sel] = tr.getElementsByTagName('select');
    const [down, up, hear] = tr.querySelectorAll('button');
    const set = (v) => { ct.pitches[i] = Math.max(PITCH_MIN, Math.min(PITCH_MAX, v)); renderTuningRows(); hearPitch(ct.pitches[i], i + 1); };
    sel.addEventListener('change', () => set(Number(sel.value)));
    down.addEventListener('click', () => set(ct.pitches[i] - 1));
    up.addEventListener('click', () => set(ct.pitches[i] + 1));
    hear.addEventListener('click', () => hearPitch(ct.pitches[i], i + 1));
    tbody.appendChild(tr);
  });
  ctKoto.setTuning(ct.pitches, { changed: ct.pitches.map((p, i) => (p !== hira[i] ? i + 1 : 0)).filter(Boolean) });
  const issues = checkTuningRealism(ct.pitches, base);
  const ul = $('ctIssues');
  ul.innerHTML = '';
  const li = (cls, text) => { const x = document.createElement('li'); x.className = cls; x.textContent = text; ul.appendChild(x); };
  const baseName = BASES.find((b) => b.offset === base)?.name || '';
  if (!issues.length) li('good', `Every bridge stays within a comfortable range (compared with hira-jōshi on ${baseName}).`);
  for (const is of issues) li('warn', is.message);
  const dupes = ct.pitches.filter((p, i) => i > 0 && i !== 4 && ct.pitches.indexOf(p) !== i).length;
  if (dupes > 1) li('info', 'Several strings share a pitch. That is allowed, but it leaves fewer different notes to play.');
}

function bindTuningEditor() {
  $('ctStart').addEventListener('change', (e) => {
    const v = e.target.value;
    if (!v) return;
    ct.pitches = v === '__current' ? state.arr.open.slice() : tuningOpen(getTuning(v), state.base);
    renderTuningRows();
  });
  $('ctDown').addEventListener('click', () => { ct.pitches = ct.pitches.map((p) => Math.max(PITCH_MIN, p - 1)); renderTuningRows(); });
  $('ctUp').addEventListener('click', () => { ct.pitches = ct.pitches.map((p) => Math.min(PITCH_MAX, p + 1)); renderTuningRows(); });
  $('ctHear').addEventListener('click', () => {
    audio.prepare(ct.pitches).then(() => ct.pitches.forEach((p, i) => audio.pluck({ midi: p, when: audio.now() + 0.05 + i * 0.22, dur: 0.6, string: i + 1 })));
  });
  $('ctSave').addEventListener('click', () => {
    const name = $('ctName').value.trim() || 'My tuning';
    const tuning = makeUserTuning({ id: ct.editing?.id, name, pitches: ct.pitches });
    const i = userTunings.findIndex((t) => t.id === tuning.id);
    if (i >= 0) userTunings[i] = tuning; else userTunings.push(tuning);
    saveJSON(TUNING_KEY, userTunings);
    registerUserTunings(userTunings);
    $('tuningDialog').close();
    selectTuning(tuning.id);
    toast(`Saved “${name}”. It is now in the tuning list.`);
  });
  $('ctDelete').addEventListener('click', () => {
    if (!ct.editing) return;
    userTunings = userTunings.filter((t) => t.id !== ct.editing.id);
    saveJSON(TUNING_KEY, userTunings);
    registerUserTunings(userTunings);
    $('tuningDialog').close();
    if (state.tuningId === ct.editing.id) selectTuning('hira');
    else { renderTuningSelect(); renderAdvisor(); }
    toast(`Deleted “${ct.editing.name}”.`);
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
  const ut = getTuning(song.tuning);
  if (mode === 'strings' && ut?.user) { song.sourceOpen = tuningOpen(ut); song.base = ut.base; }
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
    levelCache.delete(song.id);
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
  $('tuningSelect').addEventListener('change', (e) => { selectTuning(e.target.value); });
  $('newTuning').addEventListener('click', () => openTuningEditor(null, { pitches: state.arr.open }));
  $('editTuning').addEventListener('click', () => openTuningEditor(getTuning(state.tuningId)));
  $('saveFitted').addEventListener('click', () => openTuningEditor(null, { pitches: state.customOpen, name: `For ${state.song.title}` }));
  bindTuningEditor();
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
  $('speed').addEventListener('input', (e) => setSpeedPercent(Number(e.target.value)));
  $('loopToggle').addEventListener('change', (e) => setLooping(e.target.checked));
  $('selLoop').addEventListener('click', () => setLooping(!state.loopOn));
  $('selClear').addEventListener('click', () => setSelection(null));
  $('selPlay').addEventListener('click', () => {
    if (!state.selection) return;
    if (player.playing) player.seek(state.selection.start);
    else player.play(state.selection.start);
  });
  document.querySelectorAll('.sel-chip').forEach((c) => c.addEventListener('click', () => setSpeedPercent(Number(c.dataset.speed))));
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
  $('songSearch').addEventListener('input', renderLibrary);
  for (const [id, order] of [['orderLevel', 'level'], ['orderCollection', 'collection']]) {
    $(id).addEventListener('click', () => { prefs.libraryOrder = order; saveJSON(PREFS_KEY, prefs); openGroups.clear(); renderLibrary(); });
  }
  $('mainTabPlay').addEventListener('click', () => showPanel('play'));
  $('mainTabTune').addEventListener('click', () => showPanel('tune'));
  $('changeTuning').addEventListener('click', () => showPanel('tune'));
  $('tuneKoto').addEventListener('click', () => showPanel('tune'));
  $('guideToPlay').addEventListener('click', () => showPanel('play'));
  $('wakeBtn').addEventListener('click', async () => {
    if (wake.enabled) {
      await wake.disable();
      prefs.keepAwake = false;
      toast('The screen can dim and lock normally again.');
    } else {
      if (!wake.supported) {
        toast('This browser can’t keep the screen on. Chrome, Edge, Firefox and Safari 16.4 or later can.');
        return;
      }
      prefs.keepAwake = true;
      const ok = await wake.enable();
      if (ok) toast('The screen will stay on while KotoLab is open.');
    }
    saveJSON(PREFS_KEY, prefs);
  });
  if (prefs.keepAwake) wake.enable();
  renderWake(wake);
  $('zoomOut').addEventListener('click', () => setZoom(prefs.zoom - 0.15));
  $('zoomIn').addEventListener('click', () => setZoom(prefs.zoom + 0.15));
  $('fullscreenBtn').addEventListener('click', toggleFullscreen);
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && fullscreenOn) exitFullscreen(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fullscreenOn && !state.selection) exitFullscreen(); });
  updateTransportLayout(true);
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
    else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); extendSelection(1); }
    else if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); extendSelection(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepNote(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepNote(-1); }
    else if ((e.key === 'l' || e.key === 'L') && !e.altKey) { e.preventDefault(); setLooping(!state.loopOn); }
    else if (e.key === 'Escape' && state.selection) { e.preventDefault(); e.stopImmediatePropagation(); setSelection(null); }
  });
  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    updateTransportLayout();
    if (window.innerWidth === lastWidth && !fullscreenOn) return;
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderScore, 150);
  });
}

function start() {
  initTooltips();
  bind();
  const m = /song=([^&]+)/.exec(location.hash);
  const wanted = m && allSongs().find((s) => s.id === decodeURIComponent(m[1]));
  loadSong(wanted || SONGS[0]);
}

start();

// expose for debugging and tests
window.kotolab = { state, player, audio, describe, guide, showPanel, wake };
