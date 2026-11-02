// Starter library. All melodies are traditional or in the public domain.
//
// mode 'strings': written in koto string notation for its original tuning,
//   exactly as a koto score would show it. KotoLab can still re-arrange it
//   for another tuning.
// mode 'pitch': written as pitches; KotoLab chooses strings, presses and
//   transposition for whatever tuning you select ('auto' = best fit).

import { MEIJI_SONGS } from './songs-meiji.js';
import { KOTO_SONGS } from './songs-koto.js';

const BASE_SONGS = [
  {
    id: 'sakura',
    title: 'Sakura Sakura',
    jp: 'さくら さくら',
    composer: 'Traditional',
    category: 'Classical & traditional',
    mode: 'strings',
    tuning: 'hira',
    base: 0,
    tempo: 66,
    timeSig: [4, 4],
    syllables: 'Lyrics',
    about: 'The first piece most koto students learn. Written for hira-jōshi, it uses only open strings and moves through the miyako-bushi scale that the tuning is built on.',
    score: `
s7q~sa s7q~ku s8h~ra | s7q~sa s7q~ku s8h~ra |
s7q~ya s8q~yo s9q~i s8q~no | s7q~so s8e~ra s7e s6h~wa |
s5q~mi s4q~wa s5q~ta s6q~su | s5q~ka s5e~gi s4e s3h~ri |
s7q~ka s8q~su s9q~mi s8q~ka | s7q~ku s8e~mo s7e s6h~ka |
s5q~ni s4q~o s5q~i s6q~zo | s5q~i s5e~zu s4e s3h~ru |
s7q~i s7q~za s8h~ya | s7q~i s7q~za s8h~ya |
s5q~mi s6q~ni s8e~yu s7e s6q~ka | s5w~n |`,
  },
  {
    id: 'rokudan',
    title: 'Rokudan no Shirabe (opening)',
    jp: '六段の調',
    composer: 'Attrib. Yatsuhashi Kengyō (1614–1685)',
    category: 'Classical & traditional',
    mode: 'strings',
    tuning: 'hira',
    base: 0,
    tempo: 56,
    timeSig: [4, 4],
    syllables: 'Kuchi-shōga',
    about: 'The opening bars of the first dan of the most famous danmono, a study piece that introduces the core techniques: hiki-iro (ヒ), kaki-zume (shan), wari-zume (sha-sha), the ko-ro-rin descent and ato-oshi. Transcribed from the Humdrum **koto encoding by Craig Sapp and Sachiko Deguchi. Real performances start very slowly and accelerate (jo-ha-kyū).',
    score: `
s5h@hiki~te-n s3q~ton s1q@kaki~shan |
rq s3e@kaki#2~sha s3e@kaki#3~sha s8e.~koo s7s~ro s6e~rin s7e@ato~chin |
s1q#3~ton s5e.~koo s4s~ro s3q~rin s1q@kaki~shan |
s9q~chin s8e~te s7e~tsu s8e.~koo s7s~ro s6e~rin s7e@ato |`,
  },
  {
    id: 'akatonbo',
    title: 'Akatonbo (Red Dragonfly)',
    jp: '赤とんぼ',
    composer: 'Yamada Kōsaku (1927)',
    category: 'Classical & traditional',
    mode: 'pitch',
    tuning: 'nogi',
    base: 0,
    tempo: 60,
    timeSig: [3, 4],
    about: 'A beloved Japanese song in the yonanuki major scale (no 4th or 7th), which is exactly what nogi-jōshi provides, so the whole melody falls on open strings.',
    score: `
C4e F4e F4q. G4e | A4e C5e F5e D5e C5q | D5e F4e F4q G4q | A4h rq |
A4e D5e C5q. D5e | F5e D5e C5e D5e C5e A4e | C5e A4e F4e A4e G4e F4e | F4h rq |`,
  },
  {
    id: 'kojo',
    title: 'Kōjō no Tsuki (opening)',
    jp: '荒城の月',
    composer: 'Taki Rentarō (1901)',
    category: 'Classical & traditional',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 66,
    timeSig: [4, 4],
    about: 'The first two phrases of “The Moon over the Ruined Castle”. A minor-key melody that sits naturally in hira-jōshi, with one or two presses depending on the key.',
    score: `
E4q E4q A4q B4q | C5q B4q A4h | F4q F4q E4q D4q | E4w |
E4q E4q A4q B4q | C5q B4q A4h | F4q D4q E4q E4q | A3w |`,
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'Traditional (French melody)',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 96,
    timeSig: [4, 4],
    about: 'A first exercise in pressing: a major scale needs the 4th degree, which pentatonic koto tunings lack.',
    score: `
C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h |
G4q G4q F4q F4q | E4q E4q D4h | G4q G4q F4q F4q | E4q E4q D4h |
C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h |`,
  },
  {
    id: 'ode',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven (1824)',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 100,
    timeSig: [4, 4],
    about: 'Stepwise motion across five neighbouring notes. Watch how the arrangement uses presses for the half steps.',
    score: `
F#4q F#4q G4q A4q | A4q G4q F#4q E4q | D4q D4q E4q F#4q | F#4q. E4e E4h |
F#4q F#4q G4q A4q | A4q G4q F#4q E4q | D4q D4q E4q F#4q | E4q. D4e D4h |
E4q E4q F#4q D4q | E4q F#4e G4e F#4q D4q | E4q F#4e G4e F#4q E4q | D4q E4q A3h |
F#4q F#4q G4q A4q | A4q G4q F#4q E4q | D4q D4q E4q F#4q | E4q. D4e D4h |`,
  },
  {
    id: 'amazing',
    title: 'Amazing Grace',
    composer: 'Traditional (“New Britain”)',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 72,
    timeSig: [3, 4],
    about: 'A pentatonic melody, so it fits several koto tunings with few or no presses.',
    score: `
rh D4q | G4h B4e G4e | B4h A4q | G4h E4q | D4h D4q |
G4h B4e G4e | B4h A4q | D5h. | D5h B4q |
D5h B4e D5e | B4h G4q | D4h E4q | G4h E4q | D4h D4q |
G4h B4e G4e | B4h A4q | G4h. |`,
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    composer: 'Traditional English (16th c.)',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 78,
    timeSig: [6, 8],
    about: 'A Dorian-flavoured tune with a raised 6th and 7th. A good test of half-step presses (ヲ).',
    score: `
rh re A4e |
C5q D5e E5e. F#5s E5e | D5q B4e G4e. A4s B4e | C5q A4e A4e. G#4s A4e | B4q G#4e E4q A4e |
C5q D5e E5e. F#5s E5e | D5q B4e G4e. A4s B4e | C5e. B4s A4e G#4e. F#4s G#4e | A4q. A4q re |
G5q. G5e. F#5s E5e | D5q B4e G4e. A4s B4e | C5q A4e A4e. G#4s A4e | B4q G#4e E4q. |
G5q. G5e. F#5s E5e | D5q B4e G4e. A4s B4e | C5e. B4s A4e G#4e. F#4s G#4e | A4h. |`,
  },
  {
    id: 'silentnight',
    title: 'Silent Night',
    composer: 'Franz Xaver Gruber (1818)',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 84,
    timeSig: [6, 8],
    about: 'Slow and lyrical, with time to prepare each press. Try adding yuri-iro (vibrato) on long notes.',
    score: `
G4e. A4s G4e E4q. | G4e. A4s G4e E4q. | D5q D5e B4q. | C5q C5e G4q. |
A4q A4e C5e. B4s A4e | G4e. A4s G4e E4q. | A4q A4e C5e. B4s A4e | G4e. A4s G4e E4q. |
D5q D5e F5e. D5s B4e | C5q. E5q. | C5e. G4s E4e G4e. F4s D4e | C4h. |`,
  },
  {
    id: 'birthday',
    title: 'Happy Birthday',
    composer: 'Mildred & Patty Hill (1893)',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 100,
    timeSig: [3, 4],
    about: 'An octave leap on “dear …” crosses most of the koto. A good exercise for the middle finger reaching back.',
    score: `
rh C4e. C4s | D4q C4q F4q | E4h C4e. C4s | D4q C4q G4q | F4h C4e. C4s |
C5q A4q F4q | E4q D4q Bb4e. Bb4s | A4q F4q G4q | F4h. |`,
  },
  {
    id: 'furelise',
    title: 'Für Elise (theme)',
    composer: 'Ludwig van Beethoven (1810)',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 66,
    timeSig: [3, 8],
    about: 'The chromatic E–D♯ trill is only possible with a half-step press. A demanding left-hand study at speed; start at half tempo.',
    score: `
rq E5s D#5s |
E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s G#4s B4s | C5e rs E4s E5s D#5s |
E5s D#5s E5s B4s D5s C5s | A4e rs C4s E4s A4s | B4e rs E4s C5s B4s | A4q. |`,
  },
  {
    id: 'auldlangsyne',
    title: 'Auld Lang Syne (Hotaru no Hikari)',
    jp: '蛍の光',
    composer: 'Traditional Scottish',
    category: 'Popular & folk',
    mode: 'pitch',
    tuning: 'auto',
    base: 0,
    tempo: 84,
    timeSig: [4, 4],
    about: 'Sung in Japan as Hotaru no Hikari. The melody is pentatonic, so nogi-jōshi plays it on open strings.',
    score: `
rh rq C4q | F4q. F4e F4q A4q | G4q. F4e G4q A4q | F4q. F4e A4q C5q | D5h. D5q |
C5q. A4e A4q F4q | G4q. F4e G4q A4q | F4q. D4e D4q C4q | F4h. rq |`,
  },
];

export const SONGS = [...BASE_SONGS, ...KOTO_SONGS, ...MEIJI_SONGS];
