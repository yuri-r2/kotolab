# KotoLab 箏

Learn songs on the 13-string Japanese koto, with playback that follows the
score the way Songsterr and Guitar Pro do — but built around the koto's
movable bridges, string-name notation and left-hand presses.

**Live app:** https://yuri-r2.github.io/kotolab/

## What it does

- **Tuning-aware arrangements.** Pick a tuning (hira, kumoi, han-kumoi, hon-kumoi, kokin, nakazora, gaku, nogi) and a base pitch. KotoLab maps every note to a string and, when needed, a left-hand press (ヲ half step, オ whole step), choosing the transposition that is easiest to play.
- **Playability check.** A difficulty score, counts of open strings and presses, and warnings for fast left-hand jumps, double presses in chords and notes that had to move an octave.
- **Tuning tab with a guided walkthrough.** The Play tab shows the tuning each song needs (and flags when it differs from the previous song); *Tune* opens the walkthrough, which offers two starts and keeps nothing to track between visits:
  - *Tune my koto* (bridges on): pluck each string and the microphone checks it, string 一 first and then each string against one already in tune, with reference tones and directions for which way to slide the bridge.
  - *Initial setup* (no bridges on yet), in two stages. **1 · Bare strings:** with equal tension every bare string sounds the same note. On a koto with **tuning pegs** (reached under a cover at one end) KotoLab tunes each bare string to that note and says when to tighten or loosen. On a traditional koto whose strings are **knotted** at the tail end (龍尾 ryūbi) there is nothing to turn, because a craftsman sets the tension when tying the strings (糸締め itojime), so KotoLab measures each bare string, shows which are slacker or tighter than the rest, and explains when re-tying is worth it. **2 · Bridges:** from those measured pitches and the string length it shows where each bridge stands, then listens while you fine-tune it.

  Both use a tuner-style gauge (a needle that swings over ±50 cents, a note readout that turns green, a ring that fills while you hold the pitch, then a chime and check mark). It warns if you plucked the wrong string, moves on by itself once the string holds within ±5 cents, and can be stopped at any point.
- **Guitar Pro-style selections.** Drag across the tablature (or press and hold, then drag, on a touch screen) to select any span of beats; double-click a bar or click its number to select the bar, Shift-click to extend, or use Shift+← → from the keyboard. Handles at either edge adjust the range. The selection bar plays it once, loops it (L), slows it to 50 % or 75 %, or clears it (Esc). The vertical score shades the same range.
- **Tooltips.** Hover over a control, tap an ⓘ button, or press and hold a control on a phone to see what it means — for example which string "string 一" is, what the key setting moves, or what each playability number counts.
- **Custom tunings.** Create your own tuning by choosing the note for each of the 13 strings (any note from C2 to C7; start from any preset or the current tuning, nudge strings or the whole koto by half steps, hear each string). KotoLab shows the bridge layout and warns when a bridge would be unrealistically far from its usual place. Saved tunings appear in the tuning list, the advisor and the tuning walkthrough, and fitted bridges can be saved as one.
- **Tuning advisor.** Ranks every tuning for the current song, and can *fit the bridges* — suggest a few realistic bridge moves that make the song easier.
- **Two notations.** A tablature view (left to right, or right to left like koto scores) with 13 lanes, press triangles, finger numbers and rhythm stems, and a traditional vertical score (縦譜) in the Ikuta style: kanji string names, beat squares, 2/3 finger marks, オ/ヲ/ヒ/ツ/ユ technique marks and kuchi-shōga.
- **An animated koto.** Bridges slide into place when you change tuning; strings light up, with the plucking finger and the left-hand press shown as you play. Click a string to hear it.
- **Keep screen on.** A button in the top bar stops the screen from dimming or locking while KotoLab is open (Screen Wake Lock API), so the score and tuner stay visible while your hands are on the strings. The choice is remembered.
- **Full-screen tablature.** One tap fills the screen with the score and a compact playback bar (real full screen where the browser allows it, a full-window view on iPhone). A−/A+ resize the tablature; on phones the tab switches to a tighter layout with two bars per line, and lyrics that would collide are staggered onto two rows.
- **Practice tools.** Play/pause (Space), speed from 25 % to 150 %, loop any selection, metronome, count-in, and note-by-note stepping (← →).
- **Explanations.** Click any note to see how to play it — string, open pitch, press, finger and technique, with step-by-step instructions. The *Learn the basics* panel covers the instrument, tunings, reading scores, fingers and every technique, each with a sound demo.
- **Bring your own songs.** Import a MIDI file (arranged automatically), a Humdrum `**koto` file, or write one in the simple text format in the editor. Songs are saved in your browser and can be exported as `.json`.

## Starter songs

Classical & traditional: *Sakura Sakura* (hira-jōshi, full), *Rokudan no
Shirabe* (opening of the first dan, with hiki-iro, kaki-zume, wari-zume and
ato-oshi), *Akatonbo*, *Kōjō no Tsuki* (opening).

Koto arrangements: ten songs written out in koto string notation in their usual tuning (*Akatonbo*, *Hotaru no Hikari*, *Kōjō no Tsuki*, *Kurokami*, *Echigo-jishi*, *Oedo Nihonbashi* and more), with koto idioms such as octave pairs (合せ爪) at cadences and scooped repeats (掬い爪), generated by `scripts/arrange-koto.mjs`.

The library is ordered by five learning levels (First pieces → Advanced) computed from the arrangement KotoLab actually shows: presses, speed, techniques, octave pairs and length (`scripts/levels.mjs`); you can switch to ordering by collection.

Meiji-era songs: 28 popular songs from *Japanese Popular Music* (Nagai & Kobatake, Osaka 1892), several originally accompanied by koto — including *Kurokami*, *Echigo-jishi*, *Oedo Nihonbashi*, *Kappore* and *Dodoitsu* — converted from David Huron's Humdrum encoding with `scripts/import-nippon.mjs`. The library has a search box and collapsible groups.

Popular & folk (public domain): *Twinkle Twinkle*, *Ode to Joy*, *Amazing
Grace*, *Greensleeves*, *Silent Night*, *Happy Birthday*, *Für Elise* (theme),
*Auld Lang Syne / Hotaru no Hikari*.

## Score format

```
s7q s7q s8h |              string 七 quarter, 七 quarter, 八 half
s9p2e                      string 九 pressed a whole step, eighth note
E4q F#4e Bb3h              pitches: KotoLab chooses strings and presses
s1+s5q                     two strings together (合せ爪)
s5h@hiki~te-n              technique and kuchi-shōga syllable
s3e@kaki#2                 kaki-zume with the index finger
rq  -h  q.  e3             rest, hold previous note, dotted, triplet
```

Durations: `w h q e s t` = 4, 2, 1, ½, ¼, ⅛ beats. Techniques: `@hiki @tsuki
@yuri @ato @ato1 @hanashi @kaki @wari @sukui @suri @keshi @left`. Fingers:
`#1 #2 #3 #L`.

## Running locally

It's a static site with no build step:

```sh
python3 -m http.server 8080   # then open http://localhost:8080
npm test                      # engine, parser and importer tests (Node 18+)
npm run stamp                 # after editing JS/CSS: refresh cache-busting hashes in index.html
```

## Project layout

```
index.html, css/style.css
js/tunings.js      tunings, base pitches, string names
js/techniques.js   symbols, explanations, lessons
js/notation.js     score text parser / serializer, bars
js/engine.js       arrangement search, fingering, playability, bridge fitting
js/audio.js        Karplus–Strong synth, optional koto samples, technique bends
js/player.js       look-ahead scheduler, loop, metronome
js/views/          tablature, vertical score, koto diagram
js/importers.js    MIDI and Humdrum **koto import
js/guide.js        tuning walkthrough (step planning, directions, checks)
js/tuner.js        microphone pitch detection
js/tooltip.js      hover / tap / long-press tooltips for data-tip elements
js/songs.js        starter library
docs/RESEARCH.md   sources, tuning tables, notation and model notes
```

## Credits

Tuning tables and notation conventions are documented, with sources, in
[docs/RESEARCH.md](docs/RESEARCH.md). The *Rokudan* opening follows the
Humdrum `**koto` encoding by Craig Stuart Sapp and Sachiko Deguchi. MIDI
parsing by [@tonejs/midi](https://github.com/Tonejs/Midi) (MIT). Optional koto
samples: FluidR3 GM via [midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)
(CC BY 3.0).

Licensed under the MIT License.
