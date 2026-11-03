// Builds js/songs-doyo.js: Japanese children's and school songs (童謡・唱歌)
// that koto students play, plus the koto part of the kumiuta "Fuki".
//
//   node scripts/import-doyo.mjs <utau data dir> <heterophony dir>
//
// Melodies are public domain (traditional, or published 1910–1914). Each one
// was checked against two independent encodings before inclusion:
//   * kalz2q/gakufu (MIT) LilyPond melodies, and
//   * oatsu-gh/utau-namineritsu-singing MusicXML, which also carries the
//     first-verse lyrics (written as sung, e.g. わ for は).
// The notes and lyrics below are read from the second and cut to the first
// verse; only songs whose first-verse intervals match the gakufu version
// (exactly, or within one or two repeated-note splits) are included.
//
// "Fuki" (菜蕗) is the first kumiuta attributed to Yatsuhashi Kengyō
// (17th c.). Its koto part is read from the Humdrum encoding of Davison &
// Apel's transcription ("Historical Anthology of Music", vol. 1, no. 3),
// distributed in David Huron's heterophony corpus.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseMusicXML, kernPitch } from '../js/importers.js';
import { eventsToText, normalizeEvents, barBeats } from '../js/notation.js';

const [utauDir, hetDir] = process.argv.slice(2);
if (!utauDir || !hetDir) throw new Error('usage: node scripts/import-doyo.mjs <utau data dir> <heterophony dir>');

const CAT = 'Children’s & school songs';
const SPECS = [
  { file: 'usagi', id: 'usagi', title: 'Usagi (Rabbit)', jp: 'うさぎ', bars: 9, composer: 'Traditional warabe-uta (Edo period)',
    about: 'Usually the first piece a koto student learns: the rabbit hopping as it watches the full moon. The melody uses the miyako-bushi scale, so it lies almost entirely on the open strings of hira-jōshi.' },
  { file: 'kagome_kagome', id: 'kagome', title: 'Kagome Kagome', jp: 'かごめかごめ', bars: 12, composer: 'Traditional warabe-uta',
    about: 'A circle game song: the child in the middle, eyes covered, guesses who stands behind them. Three notes do almost all the work.' },
  { file: 'toryanse', id: 'toryanse', title: 'Tōryanse', jp: 'とおりゃんせ', bars: 19, composer: 'Traditional warabe-uta (Edo period)',
    about: 'A children’s gate game song about the narrow path to the Tenjin shrine, still played as the walk signal at Japanese crossings. Miyako-bushi scale.' },
  { file: 'furusato', id: 'furusato', title: 'Furusato (Hometown)', jp: 'ふるさと', bars: 16, composer: 'Okano Teiichi, lyrics Takano Tatsuyuki (1914)',
    about: 'The best-loved school song (唱歌) about the hills and rivers of home. A pentatonic major melody (yonanuki), easy to place on a koto.' },
  { file: 'momiji', id: 'momiji', title: 'Momiji (Autumn Leaves)', jp: '紅葉', bars: 16, composer: 'Okano Teiichi, lyrics Takano Tatsuyuki (1911)',
    about: 'A school song about maple leaves colouring the mountains in the autumn evening sun.' },
  { file: 'oborodukiyo', id: 'oborozukiyo', title: 'Oborozukiyo (Hazy Moon Night)', jp: '朧月夜', bars: 17, composer: 'Okano Teiichi, lyrics Takano Tatsuyuki (1914)',
    about: 'Fields of rape blossom under a hazy spring moon: a slow 3/4 school song.' },
  { file: 'haruga_kita', id: 'harugakita', title: 'Haru ga Kita (Spring Has Come)', jp: '春が来た', bars: 8, composer: 'Okano Teiichi, lyrics Takano Tatsuyuki (1910)',
    about: 'A short, cheerful school song: spring has come to the mountains, the villages and the fields.' },
  { file: 'hato', id: 'hato', title: 'Hato (Pigeon)', jp: '鳩', bars: 6, composer: 'Anonymous school song (1911)',
    about: 'Poppoppo, hato poppo: children offering beans to the pigeons. A short school song that koto schools teach to beginners in hira-jōshi.' },
  { file: 'chatsumi', id: 'chatsumi', title: 'Chatsumi (Tea Picking)', jp: '茶摘', bars: 16, composer: 'Anonymous school song (1912)',
    about: 'A tea-picking song for the 88th night after the start of spring, with the hand-clapping rhythm children still play to it.' },
];

const songs = [];
for (const spec of SPECS) {
  const res = parseMusicXML(readFileSync(join(utauDir, `${spec.file}.musicxml`), 'utf8'));
  const bb = barBeats(res.timeSig);
  const end = spec.bars * bb;
  const events = res.events.filter((e) => e.t < end - 1e-6).map((e) => ({ ...e, d: Math.min(e.d, end - e.t) }));
  const notes = events.filter((e) => !e.rest);
  const { bars, ...meta } = spec;
  songs.push({
    id: `doyo-${spec.id}`,
    title: spec.title,
    jp: spec.jp,
    composer: spec.composer,
    category: CAT,
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: Math.max(60, Math.min(120, res.tempo || 80)),
    timeSig: res.timeSig,
    syllables: 'Lyrics',
    about: `${meta.about} First verse; melody checked against two independent encodings (kalz2q/gakufu and the namineritsu singing database).`,
    score: '\n' + eventsToText(normalizeEvents(events, res.timeSig), res.timeSig, 'pitch'),
  });
  console.log(spec.id.padEnd(12), res.timeSig.join('/'), 'bars', spec.bars, 'notes', notes.length, notes.map((e) => e.shoga || '').join(''));
}

// --- Fuki: the koto spine of a two-part **kern file ------------------------
function kernSpine(text, spineIndex) {
  const events = [];
  let t = 0;
  let timeSig = [4, 4];
  let tieOpen = null;
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('!')) continue;
    const tok = line.split('\t')[spineIndex];
    if (tok == null) continue;
    if (tok.startsWith('*M')) { const m = tok.match(/^\*M(\d+)\/(\d+)/); if (m) timeSig = [Number(m[1]), Number(m[2])]; continue; }
    if (tok.startsWith('*') || tok.startsWith('=') || tok === '.') continue;
    const m = tok.match(/^([[(]*)(\d+)(\.*)([a-gA-Gr]+[#-n]*)?/);
    if (!m) continue;
    const base = 4 / Number(m[2]);
    const dots = m[3].length;
    const d = base * (2 - Math.pow(0.5, dots));
    const pitchTok = (tok.match(/[a-gA-G]+[#-]*/) || [])[0];
    const rest = /r/.test(tok) && !pitchTok;
    if (rest) { events.push({ t, d, rest: true, notes: [], techs: [], finger: null, shoga: null, token: null }); tieOpen = null; t += d; continue; }
    const pitch = kernPitch(pitchTok);
    if (tok.includes(']') || tok.includes('_')) {
      if (tieOpen && tieOpen.notes[0].pitch === pitch) { tieOpen.d += d; if (tok.includes(']')) tieOpen = null; t += d; continue; }
    }
    const ev = { t, d, rest: false, notes: [{ pitch }], techs: [], finger: null, shoga: null, token: null };
    events.push(ev);
    if (tok.includes('[')) tieOpen = ev;
    t += d;
  }
  return { timeSig, events: normalizeEvents(events, timeSig) };
}

const fuki = kernSpine(readFileSync(join(hetDir, '02part', 'japan01.krn'), 'utf8'), 0);
songs.push({
  id: 'fuki',
  title: 'Fuki (kumiuta, koto part)',
  jp: '菜蕗',
  composer: 'Attrib. Yatsuhashi Kengyō (17th century)',
  category: 'Classical & traditional',
  mode: 'pitch',
  tuning: 'hira',
  base: 0,
  tempo: 60,
  timeSig: fuki.timeSig,
  syllables: 'Kuchi-shōga',
  about: 'Fuki is the first of the kumiuta, the song cycles Yatsuhashi Kengyō set for voice and koto and the oldest layer of the solo koto repertoire. This is the koto part of the first section as transcribed by Davison & Apel (Historical Anthology of Music, vol. 1, no. 3); in performance the koto supports a slow, freely sung vocal line. Humdrum encoding from David Huron’s heterophony corpus.',
  score: '\n' + eventsToText(fuki.events, fuki.timeSig, 'pitch'),
});
console.log('fuki', fuki.timeSig.join('/'), 'notes', fuki.events.filter((e) => !e.rest).length);

writeFileSync(new URL('../js/songs-doyo.js', import.meta.url),
  `// Generated by scripts/import-doyo.mjs — do not edit by hand.\n// Public-domain melodies; see the script for sources and how they were checked.\nexport const DOYO_SONGS = ${JSON.stringify(songs, null, 2)};\n`);
