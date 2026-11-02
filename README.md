# KotoLab 箏

Learn songs on the 13-string Japanese koto, with playback that follows the
score the way Songsterr and Guitar Pro do — but built around the koto's
movable bridges, string-name notation and left-hand presses.

**Live app:** https://yuri-r2.github.io/kotolab/

## What it does

- **Tuning-aware arrangements.** Pick a tuning (hira, kumoi, han-kumoi, hon-kumoi, kokin, nakazora, gaku, nogi) and a base pitch. KotoLab maps every note to a string and, when needed, a left-hand press (ヲ half step, オ whole step), choosing the transposition that is easiest to play.
- **Playability check.** A difficulty score, counts of open strings and presses, and warnings for fast left-hand jumps, double presses in chords and notes that had to move an octave.
- **Tuning tab with a guided walkthrough.** KotoLab remembers how your koto is tuned. When a song needs a different tuning it tells you which bridges to move, then walks you through them one string at a time: which way to slide the bridge, how far, which already-tuned string to check it against, reference tones, and a microphone tuner with a cents meter. It can also tune all 13 strings from scratch.
- **Tuning advisor.** Ranks every tuning for the current song, and can *fit the bridges* — suggest a few realistic bridge moves that make the song easier.
- **Two notations.** A tablature view (left to right, or right to left like koto scores) with 13 lanes, press triangles, finger numbers and rhythm stems, and a traditional vertical score (縦譜) in the Ikuta style: kanji string names, beat squares, 2/3 finger marks, オ/ヲ/ヒ/ツ/ユ technique marks and kuchi-shōga.
- **An animated koto.** Bridges slide into place when you change tuning; strings light up, with the plucking finger and the left-hand press shown as you play. Click a string to hear it.
- **Practice tools.** Play/pause, speed from 25 % to 150 %, loop any bars, metronome, count-in, and note-by-note stepping (← →).
- **Explanations.** Click any note to see how to play it — string, open pitch, press, finger and technique, with step-by-step instructions. The *Learn the basics* panel covers the instrument, tunings, reading scores, fingers and every technique, each with a sound demo.
- **Bring your own songs.** Import a MIDI file (arranged automatically), a Humdrum `**koto` file, or write one in the simple text format in the editor. Songs are saved in your browser and can be exported as `.json`.

## Starter songs

Classical & traditional: *Sakura Sakura* (hira-jōshi, full), *Rokudan no
Shirabe* (opening of the first dan, with hiki-iro, kaki-zume, wari-zume and
ato-oshi), *Akatonbo*, *Kōjō no Tsuki* (opening).

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
