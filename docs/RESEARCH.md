# Research notes

These notes record what KotoLab is based on: existing tools, koto tunings,
notation conventions and the playability model.

## Similar projects

| Project | What it is | What KotoLab took from it |
|---|---|---|
| [Songsterr](https://www.songsterr.com) / Guitar Pro / [TuxGuitar](https://github.com/helge17/tuxguitar) | Tab players with a moving cursor, speed control and looping | The interaction model: wrapped systems of lanes, playhead, loop bars, speed slider, count-in, metronome |
| [Humdrum **koto representation](http://koto.sapp.org/kotospec) (Craig Sapp & Sachiko Deguchi, 2003) and the koto scores at koto.sapp.org / kern.ccarh.org | A text encoding of Yamada-style koto scores, with a corpus of learning pieces in hira, gaku, nogi and Western tunings | KotoLab imports `**koto` files (string numbers, beams, `#` presses, `s` sha/kaki-zume, `a/b/c` fingers, `**kuchi` spine). The *Rokudan* opening in the library is transcribed from the example in this spec. |
| [Koto Notation plugin for MuseScore](https://musescore.org/en/project/koto-notation-0) (shakuhachi.sub.jp) | Prints koto string numbers under staff notation for many tunings, incl. oshide statistics | Confirms the approach of mapping pitches to string + press for a given tuning |
| [koto-score-editor](https://github.com/satorun-run/koto-score-editor) | Browser editor for horizontal (Yamada-style) string-name scores with SVG export | Its specification documents the symbol vocabulary of real scores (2/3 fingers, ヒ オ ヲ ツ ユ ハ, △▲ press triangles, かき爪 wavy mark, 合せ爪 stacking, ○ rests) |
| [Koto Score Creator](https://github.com/brirving/koto-score-creator) (JUCE, MPL-2.0) | Desktop score writer with tuning presets and playback | Confirms the value of text entry plus tuning presets |
| [KotoTunings](https://apps.apple.com/app/kototunings/id380669286) (iOS) | Reference recordings of 26 tunings with selectable base pitch | The base-pitch selector (壱越 D, 双調 G, …) |
| [harpejjitabs](https://github.com/amiguet/harpejjitabs) | Tab editor for an unusual string instrument | Finger numbers on tablature |

Reused code and assets:

* [@tonejs/midi](https://github.com/Tonejs/Midi) (MIT) — MIDI file parsing, loaded from jsDelivr only when you import a MIDI file.
* [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) — pre-rendered FluidR3 GM koto samples (CC BY 3.0), fetched on demand when “Koto samples” is chosen. The default sound is a Karplus–Strong synth written for KotoLab, so the app works offline.

## Tunings

String 一 is farthest from the player; 二 is the lowest string; 一 usually
matches 五. Pitches below are for the 壱越 (D) base; the app can shift the
whole koto (双調 G, 平調 E, etc.).

| Tuning | 一 | 二 | 三 | 四 | 五 | 六 | 七 | 八 | 九 | 十 | 斗 | 為 | 巾 | Change from hira |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 平調子 Hira | D | G | A | B♭ | D | E♭ | G | A | B♭ | D | E♭ | G | A | — |
| 雲井調子 Kumoi | D | G | A♭ | C | D | E♭ | G | A♭ | C | D | E♭ | G | A | 三八 −1, 四九 +2 |
| 半雲井調子 Han-kumoi | D | G | A | B♭ | D | E♭ | G | A♭ | C | D | E♭ | G | A | 八 −1, 九 +2 |
| 本雲井調子 Hon-kumoi | D | G | A♭ | C | D | E♭ | G | A♭ | C | D | E♭ | G | A♭ | as kumoi, 巾 −1 |
| 古今調子 Kokin | D | G | A | C | D | E♭ | G | A | C | D | E♭ | G | A | 四九 +2 |
| 中空調子 Nakazora | D | G | A | B♭ | D | E | F | A | B♭ | D | E | F | A | 六斗 +1, 七為 −2 |
| 楽調子 Gaku | D | G | A | C | D | E | G | A | C | D | E | G | A | 四九 +2, 六斗 +1 |
| 乃木調子 Nogi | D | G | A | B | D | E | G | A | B | D | E | G | A | 四六九斗 +1 |

Sources: 美緒野会「調弦基礎」tuning table (shamisen.info/instrument/tuning_koto2),
KORG WT-30 koto tuning chart, and the Humdrum `*tune[d:G:A:B-:d:e-:g:a:b-:dd:ee-:gg:aa]`
hira-jōshi definition.

## Notation conventions used

* **String names** 一二三四五六七八九十斗為巾 (Yamada scores write 壱弐参 for the first three).
* **Fingers**: no mark = thumb (親指), 2 = index (人差し指), 3 = middle (中指), 左 = left hand.
* **Presses (押し手)**: ヲ = half step (弱押し), オ = whole step (強押し) in Ikuta scores; △ / ▲ above the name in Yamada scores. An オ written *after* a note is an after-press (後押し).
* **Left-hand colours**: ヒ hiki-iro (pull toward the bridge, pitch sinks), ツ tsuki-iro (quick push up and back), ユ yuri-iro (vibrato), ハ release a press.
* **Right hand**: かき爪 kaki-zume (two neighbouring strings in one stroke, “shan”), 割り爪 wari-zume (index then middle, “sha-sha”), 合せ爪 awase-zume (strings together), ス sukui-zume (scoop back with the thumb), → suri-zume (scrape), ケ damp.
* **Rhythm**: vertical (Ikuta) scores give each beat a square, split for eighths and sixteenths; ○ is a rest; Yamada scores beam the names like Western notation.

Sources: Humdrum **koto spec; 鈴木創「お箏の楽譜の読み方」; 桜庵の箏日記「左手の手法」;
koto-shami.info「箏の楽譜」; Stanford Gagaku site (koto right-hand fingering);
the koto-score-editor specification.

## Playability model

For each note KotoLab lists every way to play it: a string whose open pitch is
0, 1 or 2 semitones below (optionally 3). A Viterbi search then chooses the
cheapest path through the song:

* note cost — open 0, half press 1.6, whole press 2.2, 1½ press 7; octave displacement 10; omitted 40;
* chords — distinct strings, at most one pressed string, limited span;
* right hand — cost grows with the distance the hand travels, more in fast passages;
* left hand — moving a press to a different string costs more the less time there is (under 0.2 s is very hard), holding the same string is free;
* techniques — kaki-zume needs an open string with a neighbour; after-press needs room for the bend; press-and-release needs a pressed string.

The outer search tries every transposition from −12 to +12 and every preset
tuning (the advisor). “Fit the bridges” hill-climbs single bridge moves of
±1–2 semitones within a realistic range of each string's hira-jōshi position
(−4…+5), keeping 二→巾 in rising order and charging a little for each move.

Right-hand fingering uses a second dynamic-programming pass: thumb by default,
the middle finger for reaches back toward 一 and for kaki-zume, thumb–index
alternation for fast repeated notes, and thumb + middle for octave pairs.

## Popular koto songs (November 2026)

YouTube blocks automated access, so view counts could not be read directly.
The picture below comes from search results, news coverage and koto-school
repertoire lists.

**Classical and teaching repertoire.** The National Diet Library names
*Rokudan* as one of the best-known koto works, often taught to beginners, and
*Haru no Umi* as a world-famous melody
([NDL, “Koto melodies”](https://www.ndl.go.jp/kaleido/e/entry/24/1.html)).
Beginner workshops start with *Sakura Sakura*
([Shinjuku City koto workshop](https://www.city.shinjuku.lg.jp/event/30natsu_okoto.html);
[Zen-On lesson plan](https://www.zen-on.co.jp/pdf/bk0501.pdf)). A koto school's
song-by-tuning list covers the standard repertoire, including 六段, 黒髪,
みだれ, 八段, 千鳥の曲, 茶音頭, 越後獅子 (arranged), 春の海, さくら and 鳩
([美緒野会](https://shamisen.info/instrument/tuning_koto3_kyokumoku/)).
*Usagi* is published in koto ensemble arrangements
([Piascore](https://store.piascore.com/scores/66712)).

**Covers.** The most-watched koto videos are covers of modern songs.
WagakkiBand's *Senbonzakura* (koto in the line-up) passed 100 million views in
2019 ([JRock News](https://jrocknews.com/2019/03/wagakkiband-senbonzakura-music-video-100-million-views.html)).
Other widely shared koto covers include *Gurenge* (Demon Slayer), *History
Maker* (Yuri!!! on Ice, a koto quartet by Kazushi Okimasa,
[SoraNews24](https://soranews24.com/2016/12/08/traditional-japanese-rendition-of-yuri-on-ice-anime-theme-is-the-most-elegant-yet%E3%80%90video%E3%80%91/amp/)),
Toto's *Africa* and *Stairway to Heaven*
([Laughing Squid](https://laughingsquid.com/toto-africa-performed-on-traditional-japanese-koto/)),
and J-pop and Vocaloid hits such as *Mesmerizer*, *Shōjo Rei*, YOASOBI's
*Gunjō* and *Bling-Bang-Bang-Born*.

**Japanese teaching and folk repertoire.**

| Song | Date | Source of the notes | Check |
| --- | --- | --- | --- |
| うさぎ Usagi | Edo-period warabe-uta | namineritsu singing DB (MusicXML, first verse) | matches kalz2q/gakufu (MIT) within one repeated note |
| かごめかごめ Kagome Kagome | traditional | same | matches gakufu within two notes |
| とおりゃんせ Tōryanse | traditional | same | matches gakufu within two notes |
| ふるさと Furusato | 1914 | same | identical intervals to gakufu |
| 紅葉 Momiji | 1911 | same | identical |
| 朧月夜 Oborozukiyo | 1914 | same | identical |
| 春が来た Haru ga Kita | 1910 | same | identical |
| 茶摘 Chatsumi | 1912 | same | identical |
| 鳩 Hato | 1911 | same | identical |
| 菜蕗 Fuki (kumiuta, koto part) | 17th century | Davison & Apel transcription, Humdrum heterophony corpus (D. Huron) | single scholarly source |

Koto string-notation arrangements were added for Usagi (hira-jōshi) and for
Kagome Kagome, Furusato, Haru ga Kita and Chatsumi (nogi-jōshi, chosen
because those melodies need the fewest presses there).

**Not included.**
* *Haru no Umi* (Miyagi Michio, 1929–30) is newer than KotoLab's
  public-domain cut-off.
* The covers above are copyrighted songs, so their melodies are not
  reproduced. Use *Import MIDI* or *Import MusicXML* with a file you have the
  right to use, and KotoLab arranges it for the chosen tuning.
* *Haru no Ogawa* is out because today's lyrics are a 1947 revision.
* *Edo Komoriuta*, *Hamabe no Uta*, *Hamachidori*, *Takeda no Komoriuta*,
  *Chidori no Kyoku* and *Midare*, until a second independent source
  confirms the melody.

## Chinese, Vietnamese and Korean repertoire

The new scores follow individual source versions. They carry the melody only,
at practice tempos. The default layouts play the melody on open strings,
including the closing figures. Transpositions apply to entire melodies so
their intervals stay intact.

| Tune | Melody source | Arrangement |
| --- | --- | --- |
| Mòlìhuā (Jasmine Flower) | [John Barrow, *Travels in China* (1804), p. 316](https://www.gutenberg.org/cache/epub/28729/images/i_mooleewha.png). [Harvard's *Sounding China*](https://soundingchina.fas.harvard.edu/01.html) documents the related early London publication. | Barrow's early version in cut time, transposed from G to D. The final half-bar rest gives the cadence room to ring. |
| Chinese Popular Air No. 1 | [*Travels in China*, p. 318, No. I](https://www.gutenberg.org/cache/epub/28729/images/ipopair1.png). Barrow credits the airs to a transcriber in Canton. | Full melody down a fifth, including the printed repeated sixteenth-note figures. |
| Chinese Popular Air No. 2 | [*Travels in China*, p. 318, No. II](https://www.gutenberg.org/files/28729/28729-h/images/ipopair2.png). | Full melody down a fifth. The written pitches beneath the trill are retained and the description explains how to play the ornament. |
| Qua Cầu Gió Bay | [*Hướng Dẫn Sinh Hoạt II*, p. 776](https://cttdvnfl.org/wp-content/uploads/2025/12/Sach_HDSH2_eBook.pdf#page=411). [UNESCO's entry](https://ich.unesco.org/en/RL/quan-ho-bac-ninh-folk-songs-00183) describes the quan họ singing tradition. | One verse with the pickup and measured turns. The brief grace note and pickup into the next verse are left out. |
| Lý Ngựa Ô (Nam Bộ) | [*Hướng Dẫn Sinh Hoạt II*, p. 777](https://cttdvnfl.org/wp-content/uploads/2025/12/Sach_HDSH2_eBook.pdf#page=412). [Hồ Ngọc Khải and Nguyễn Văn Hảo's teaching guide](https://c23phamkietsh.quangngai.edu.vn/wp-content/uploads/2024/08/KHBD_Am_Nhac_9_FULL_CTST_4598c-2.pdf) identifies the southern folk version. | Full melody with its cross-bar ties and the B♭ in both closing phrases. Chord symbols and accompaniment are omitted. |
| Gu Arirang (1896) | [Homer B. Hulbert, “Korean Vocal Music,” *The Korean Repository*, reproduced by the National Archives of Korea](https://theme.archives.go.kr/next/pages/arirang/images/05_a.jpg). The [National Gugak Center encyclopedia](https://www.gugak.go.kr/ency/topic/view/836) identifies the early version. | Hulbert's version in sixteen three-beat bars, including the refrain and verse. |

The printed scores were checked for phrases, note values and cadences. The
Chinese air transcriptions were also compared with the MIDI companions to
[Project Gutenberg's edition](https://www.gutenberg.org/cache/epub/28729/pg28729-images.html).
The Vietnamese entries use the orally transmitted tune and omit the book's
accompaniment and lyrics.

### Tunings for these melodies

- **Chinese repertoire.** The guzheng-inspired preset maps D E F♯ A B onto
  the 13-string koto, retaining its high first string. The five-note shape is
  documented in [Fang et al., *Acoustics of the Guzheng*](https://bioresources.cnr.ncsu.edu/resources/acoustics-of-the-guzheng-chinese-plucked-zither/).
- **Vietnamese repertoire.** The Nam Bộ preset draws on the C D F G B♭
  tuning reported by Trần Văn Khê for tracks 1, 2 and 6 of
  [*Viet Nam: Tradition of the South*](https://folkways-media.si.edu/docs/folkways/artwork/UNES08049.pdf#page=3).
  The koto layout adds A4 for *Lý Ngựa Ô*. Standard gaku-jōshi already supplies
  the open pitches for *Qua Cầu Gió Bay*.
- **Korean repertoire.** The gayageum-inspired preset uses the G A C D E
  collection documented for sanjo gayageum in
  [*A Study on Notation and Tuning Method of 12-Strings Gayageum*](https://www.dbpia.co.kr/journal/detail?nodeId=T13388033).
  The pitches are reordered for a usable range on the koto.
- **Modern tunings.** The C major / A minor layout gives a continuous
  diatonic run on strings 二–巾. G minor blues puts all six blues notes in
  the middle octave. The chromatic preset puts the seven pitches D4–A♭4
  on open strings around the middle register.

These presets are equal-tempered starting points for a 13-string koto.
Regional intonation, ornaments and string order vary with instrument and
playing tradition.

## Bare strings and string tension

On most kotos the strings have no pegs. Each one is knotted at the tail end
(龍尾 ryūbi), and a craftsman sets its tension when the strings are tied or
re-tied (糸締め itojime: new strings, 天地 tenchi, or 送り・切りつめ trimming).
Players are advised to ask the shop for a looser or tighter setting rather
than adjust it themselves
([Satsuki Koto, interview with a koto technician](https://satsukikoto.com.au/interview-with-a-koto-technician/);
[Umeya Gakki care manual](https://umeya-gakki.heteml.net/umeya-gakki/contents/manual2021.pdf)).
Some kotos do have metal tuning pegs, anchored in a block and reached through
an opening at one end that is hidden by a cloth end cap
([Grinnell College instrument collection](https://omeka-s.grinnell.edu/s/MusicalInstruments/item/644);
see also patent [JPH0626955Y2](https://patents.google.com/patent/JPH0626955Y2/en) for a
string wound on a bobbin under the end cover).

The 13 strings are the same length between the fixed bridges and normally the
same gauge, so equal tension means every bare string sounds the same note.
KotoLab aims that note three half steps below the lowest note of the tuning.
That puts the lowest string's bridge about 84% of the way to the far end and
keeps the highest bridge clear of the player's fixed bridge. With pegs it tunes
each bare string to that note within ±15 cents (the bridges do the fine
tuning). With knotted strings it measures each one and compares it with the
median: within ±50 cents counts as even, and larger gaps are reported as
candidates for re-tying.

## Limits

* The model is a heuristic. It does not know a particular school's fingering
  traditions, and kuchi-shōga is only shown when a score includes it.
* *Rokudan* and *Kōjō no Tsuki* are included as excerpts.
* Koto samples come from a General MIDI soundfont; the built-in synth is an
  approximation of a koto, not a recording.
