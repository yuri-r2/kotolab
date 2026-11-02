// Playing techniques (奏法) and the symbols used for them in koto scores.
//
// Symbols follow Ikuta-ryū (Miyagi-ha) printed scores, the notation most
// learners meet first: string names in kanji, finger numbers 2/3 (thumb is
// unmarked), katakana for left-hand techniques. The tab view uses the
// Yamada-style press triangles (△ half, ▲ whole) described in the Yamada
// legend. Explanations are deliberately short; a teacher remains the best
// guide for tone and timing.

export const FINGERS = {
  1: { mark: '', jp: '親指', romaji: 'oyayubi', en: 'Thumb', how: 'The default finger. Unless a number is written, pluck with the thumb plectrum (爪 tsume), pushing the string away from you so the plectrum comes to rest on the next string.' },
  2: { mark: '2', jp: '人差し指', romaji: 'hitosashiyubi', en: 'Index finger', how: 'Written as 2. Pull the string toward you with the index-finger plectrum. Often alternates with the thumb in quick passages.' },
  3: { mark: '3', jp: '中指', romaji: 'nakayubi', en: 'Middle finger', how: 'Written as 3. Pull toward you with the middle-finger plectrum. Used for low strings reached from far away, octave pairs and kaki-zume. It gives a fuller tone than the thumb.' },
  L: { mark: '左', jp: '左手', romaji: 'hidari', en: 'Left hand', how: 'Written as 左. Pluck the string with a bare left-hand finger on the left side of the bridge (pizzicato). Soft and intimate.' },
};

// Each technique: symbol shown in the vertical (Ikuta) score, symbol in the
// tab, which hand, a plain-English explanation and steps.
export const TECHNIQUES = {
  press1: {
    symbol: 'ヲ', tab: '△', hand: 'left', jp: '弱押し', romaji: 'yowa-oshi', en: 'Half-step press',
    summary: 'Press the string before plucking so it sounds a half step higher.',
    steps: ['Place two or three left-hand fingertips on the string about 10–12 cm to the left of its bridge.', 'Press down gently until the pitch rises by a half step, then pluck with the right hand.', 'Keep the pressure steady for the length of the note. This shallow press is easy to overdo: listen for the exact pitch.'],
  },
  press2: {
    symbol: 'オ', tab: '▲', hand: 'left', jp: '強押し', romaji: 'tsuyo-oshi', en: 'Whole-step press',
    summary: 'Press the string firmly before plucking so it sounds a whole step higher.',
    steps: ['Place the left-hand fingers to the left of the bridge, as for the half-step press.', 'Press deeper, until the pitch is a whole step above the open string, then pluck.', 'Learners tend to under-press: check the pitch against the open string one bridge higher.'],
  },
  press3: {
    symbol: 'オ³', tab: '◬', hand: 'left', jp: '三重押し', romaji: 'mie-oshi', en: 'Step-and-a-half press',
    summary: 'A very deep press raising the string a minor third. Rare and tiring; avoid in fast passages.',
    steps: ['Use the whole hand, fingers together, close to the bridge.', 'Press much deeper than a whole step, checking the pitch carefully.', 'Use only on slow notes; arrangements in KotoLab avoid it unless you allow it.'],
  },
  ato: {
    symbol: 'オ', tab: '↗', hand: 'left', jp: '後押し', romaji: 'ato-oshi', en: 'After-press',
    summary: 'Pluck the open string, then press so the ringing sound rises a whole step.',
    steps: ['Rest the left-hand fingers on the string left of the bridge before plucking.', 'Pluck with the right hand.', 'While the note rings, press smoothly; the pitch slides up a whole step. In the score the オ appears after the note.'],
  },
  ato1: {
    symbol: 'ヲ', tab: '↗', hand: 'left', jp: '後押し（半音）', romaji: 'ato-oshi', en: 'After-press (half step)',
    summary: 'Pluck, then press so the ringing sound rises a half step.',
    steps: ['Prepare the left hand on the string.', 'Pluck, then press lightly so the pitch rises a half step.'],
  },
  hanashi: {
    symbol: 'ハ', tab: '↘', hand: 'left', jp: '押し放し', romaji: 'oshi-hanashi', en: 'Press and release',
    summary: 'Pluck a pressed string, then release the press so the sound falls back to the open pitch.',
    steps: ['Press the string as written and pluck.', 'Let go of the pressure smoothly without lifting the fingers off the string, so the resonance returns to the open pitch.'],
  },
  hiki: {
    symbol: 'ヒ', tab: 'ヒ', hand: 'left', jp: '引き色', romaji: 'hiki-iro', en: 'Pulled colour',
    summary: 'After plucking, pinch the string left of the bridge and pull it toward the bridge, so the pitch sinks slightly.',
    steps: ['Pluck the note.', 'Pinch the string with the left thumb, index and middle fingers to the left of the bridge.', 'Draw it gently toward the bridge: the pitch drops by up to about a half step, giving a sighing colour.'],
  },
  tsuki: {
    symbol: 'ツ', tab: 'ツ', hand: 'left', jp: '突き色', romaji: 'tsuki-iro', en: 'Pushed colour',
    summary: 'Immediately after plucking, give the string one short push so the pitch flicks up and returns.',
    steps: ['Pluck the note.', 'Right after, poke the string once with the left hand left of the bridge.', 'Release at once and stop the hand where it started, so the pitch bounces up and back.'],
  },
  yuri: {
    symbol: 'ユ', tab: 'ユ', hand: 'left', jp: '揺り色', romaji: 'yuri-iro', en: 'Vibrato',
    summary: 'Rock the pressure on the string after plucking to make the sound waver.',
    steps: ['Pluck the note.', 'Press and relax the string rhythmically with the left index and middle fingers, left of the bridge.', 'Keep it gentle and even; it colours the decay of the note.'],
  },
  kaki: {
    symbol: '⌇', tab: '≀', hand: 'right', jp: '掻き爪', romaji: 'kaki-zume', en: 'Two-string stroke',
    summary: 'Pluck two neighbouring strings in one quick stroke toward you with the middle finger.',
    steps: ['Place the middle-finger plectrum on the written string.', 'Pull toward you through that string and the next one (one number higher) in one motion, almost together, the first slightly ahead.', 'Its kuchi-shōga is “shan”. On 一 the second string (二) is lower, so the pair falls in pitch.'],
  },
  wari: {
    symbol: '⌇⌇', tab: '≀≀', hand: 'right', jp: '割り爪', romaji: 'wari-zume', en: 'Split stroke',
    summary: 'Two kaki-zume strokes in a row on the same pair of strings: first with the index finger, then with the middle finger.',
    steps: ['Stroke the two strings with the index finger (2).', 'Then repeat the stroke with the middle finger (3).', 'Its kuchi-shōga is “sha-sha”.'],
  },
  awase: {
    symbol: '⌒', tab: '⌒', hand: 'right', jp: '合せ爪', romaji: 'awase-zume', en: 'Chord (strings together)',
    summary: 'Pluck two strings at the same moment, usually an octave apart, with the thumb on the nearer string and the middle finger on the farther one.',
    steps: ['Place the thumb on the higher-numbered string and the middle finger on the lower-numbered one.', 'Pinch them together so both sound exactly at once.'],
  },
  sukui: {
    symbol: 'ス', tab: 'ス', hand: 'right', jp: '掬い爪', romaji: 'sukui-zume', en: 'Scooping stroke',
    summary: 'Pluck the same string again with the back of the thumb plectrum, moving toward you. Softer than a normal stroke.',
    steps: ['After a thumb stroke, the plectrum rests on the far side of the string.', 'Scoop back toward you, catching the string with the back edge of the plectrum.', 'Keep it light; it is a quick, quieter repetition.'],
  },
  suri: {
    symbol: '→', tab: '→', hand: 'right', jp: '擦り爪', romaji: 'suri-zume', en: 'Scrape',
    summary: 'Scrape the edges of the index and middle plectra along one or two strings for a rasping sweep.',
    steps: ['Lay the edges of the index and middle plectra on the strings.', 'Slide them along the string length, usually from left to right, then pluck or stop as written.'],
  },
  keshi: {
    symbol: 'ケ', tab: 'ケ', hand: 'both', jp: '消し爪', romaji: 'keshi-zume', en: 'Damp',
    summary: 'Stop the ringing string so the note is short.',
    steps: ['Pluck the note.', 'Touch the string with a plectrum or the hand to cut the sound off, like a staccato.'],
  },
  left: {
    symbol: '左', tab: '左', hand: 'left', jp: '左手', romaji: 'hidari', en: 'Left-hand pluck',
    summary: 'Pluck with a bare left-hand finger on the left side of the bridge.',
    steps: ['Use the left index or middle finger without a plectrum.', 'Pluck left of the bridge; the tone is soft and round.'],
  },
};

export const TECHNIQUE_ALIASES = {
  press: 'press2', oshi: 'press2', hiki: 'hiki', hikiiro: 'hiki', tsuki: 'tsuki', yuri: 'yuri',
  ato: 'ato', atooshi: 'ato', ato1: 'ato1', ato2: 'ato', hanashi: 'hanashi', release: 'hanashi',
  kaki: 'kaki', sha: 'kaki', shan: 'kaki', wari: 'wari', sukui: 'sukui', suri: 'suri',
  keshi: 'keshi', mute: 'keshi', left: 'left', pizz: 'left',
};

export function pressTechnique(semitones) {
  return semitones === 1 ? TECHNIQUES.press1 : semitones === 2 ? TECHNIQUES.press2 : semitones === 3 ? TECHNIQUES.press3 : null;
}

/** Background reading shown in the Learn panel. */
export const LESSONS = [
  {
    title: 'The instrument',
    body: [
      'The koto (箏) is a 13-string zither about 180 cm long. Each string runs over its own movable bridge (柱 ji). The right hand plucks between the bridges and the player’s end; the left hand works on the other side of the bridges, pressing or pulling the string to bend its pitch.',
      'Strings are named, not lettered: 一 二 三 四 五 六 七 八 九 十, then 斗 (to), 為 (i) and 巾 (kin). String 一 is the one farthest from you. Scores write string names, never pitches, because the same piece can be played in different tunings.',
    ],
  },
  {
    title: 'Tunings (調子 chōshi)',
    body: [
      'Moving bridges retunes the koto. The standard hira-jōshi gives the in scale D E♭ G A B♭. Other tunings move a few bridges: kumoi-jōshi lowers 三 and 八 and raises 四 and 九, nogi-jōshi gives a major pentatonic, and so on.',
      'String 一 is usually tuned to the same pitch as 五, and 二 is the lowest string. That is why low notes are often played on 二 to 四, and a D can be played on either 一 or 五.',
      'Notes the tuning lacks are reached by pressing (押し手 oshide) the string left of its bridge: a light press raises it a half step (ヲ), a firm press a whole step (オ). KotoLab arranges each song so that as many notes as possible are open strings and presses stay manageable.',
    ],
  },
  {
    title: 'Reading the vertical score',
    body: [
      'Ikuta-ryū scores are read top to bottom, columns right to left. Each square is one beat. One string name in a square lasts the whole beat; two names split it into halves (表間 omote-ma and 裏間 ura-ma), and so on. ○ is a rest; a vertical line means the note keeps ringing.',
      'A small 2 or 3 beside a name means index or middle finger; no number means thumb. Katakana beside a name are left-hand techniques: ヲ and オ (press), ヒ (hiki-iro), ツ (tsuki-iro), ユ (yuri-iro), ハ (release). Names written side by side are played together.',
      'Yamada-ryū scores run left to right with beams under the string names, like Western eighth and sixteenth notes, and mark presses with triangles above the name: △ half step, ▲ whole step.',
    ],
  },
  {
    title: 'Plectra and schools',
    body: [
      'The right hand wears plectra (爪 tsume) on the thumb, index and middle fingers. Ikuta-ryū uses square-tipped plectra played at an angle, sitting diagonally to the instrument; Yamada-ryū uses rounded, pointed plectra played straight on.',
      'Kuchi-shōga (口唱歌) are syllables for singing koto patterns: “ton”, “ten”, “shan” (kaki-zume), “sha-sha” (wari-zume), “ko-ro-rin” (three descending notes). They are shown above the notes when a score includes them.',
    ],
  },
];
