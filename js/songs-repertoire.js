const TIERSOT_PLATES = 'https://urresearch.rochester.edu/fileDownloadForInstitutionalItem.action?itemFileId=160024&itemId=30223';
const ONEILL_SCORE = 'https://s9.imslp.org/files/imglnks/usimg/a/a2/IMSLP495828-PMLP802880-ONeills_1850.pdf';

export const REPERTOIRE_SONGS = [
  {
    id: 'rokudan-dan-6', title: 'Rokudan no Shirabe (sixth dan)', jp: '六段の調・第六段',
    tradition: 'Japanese', category: 'Classical koto · danmono', composer: 'Traditionally attributed to Yatsuhashi Kengyō',
    mode: 'strings', tuning: 'hira', tempo: 104, timeSig: [4, 4],
    about: 'The closing dan in Furukawa’s 1912 koto tablature. Practice the paired strings, whole-step presses, and after-presses before joining them at speed. The final sweep is written as measured plucks for practice.',
    source: 'https://dl.ndl.go.jp/pid/857672/1/3',
    score: `
rq s7q@ato s8q s6q | s5q s1+s2e s1+s2e s5q rq | rh s1+s2e s1+s2e s5q | rh s1+s2e s1+s2e s5q |
s1+s2e s1+s2e s4p2q s1+s2e s1+s2e s5e. s4s | s3q s1+s2q s1+s2h | s1+s2q s1+s2q s8e. s7s s6q |
s5q s1+s2q s8q s7q | s7q s6q s7q@ato s8e. s7s | s6q s5q s1+s2q s10q |
s10p2q s9q s10q s11p2e. s10s | s9q s7+s8q s13e. s12s s11p2q | s10q s9q s10q s11p2e. s10s |
s9q s10q@ato1 s9q s10q@ato1 | s9q s8q s2q s7q@ato | s3q s8q s9p2q s10e. s9s |
s8q s9p2q s5+s6e s5+s6e s10q | rh s5+s6e s5+s6e s10q | rh s7+s8e s7+s8e s12q@ato |
s13e. s12s s11q s12q@ato s13e s12e | s11q s12q s12p2+s13h | s12p2+s13q s12p2+s13q s11h |
s10q.. s9s s8q s9p2q | rq s10q s7h@ato |
s7q s13s s12s s11s s10s s9s s8s s7s s6s s5q | s6q s1+s5h rq |`,
  },
  {
    id: 'hachidan-dan-8', title: 'Hachidan no Shirabe (eighth dan)', jp: '八段の調・第八段',
    tradition: 'Japanese', category: 'Classical koto · danmono', composer: 'Attributed to Yatsuhashi Kengyō in the 1912 edition',
    mode: 'strings', tuning: 'hira', tempo: 116, timeSig: [4, 4],
    about: 'The final dan from Furukawa’s 1912 edition. The low-string pairs, dotted figures and leap to string 巾 demand accuracy. Practice the last sweep slowly as written before playing it in one gesture.',
    source: 'https://dl.ndl.go.jp/pid/857673/1/3',
    score: `
s1+s2q s8q rq s2q | s7e. s6s s5q s1+s2q rq | s9q s8q rq s2q | s7e. s6s s5q s1+s2q s6p2q |
s1+s2q s7q s1+s2q s8q | s1+s2q s9p2q s5+s6q s10q | s6+s7q s11p2q rq s7q |
s12e. s11s s10q s1+s2q s11q | s12q s8q s13q s7q |
s12e. s11s s10q s1+s2q rq | s13p2q s13q rq s7q | s12e. s11s s10q s1+s2q s11p2q |
s7+s8q s12q s8+s9q s13q | rq s9p2q rq s5q | s10e. s9s s8q s1+s2q s9p2q |
s10q s11q s10e. s9s s8q | s1+s2q s9p2q s5+s6q s10q | rq s11p2e s10e s9e s8e s7q |
s8q s9q s10h@ato1 | s9q s10q s11e. s10s s9q | s8q s9q s10q rq |
s11p2q s9+s10e s8+s9e s13q s12q | s11p2q s10q s11e. s10s s9q | s10q s11p2q s12h@ato |
s13s s12s s11s s10s s9s s8s s7s s6s s5s s4s s3s s5p2s rq | s1+s5q rq rh |`,
  },
  {
    id: 'bucks-of-oranmore', title: 'The Bucks of Oranmore',
    tradition: 'European', category: 'Irish reel', composer: 'Traditional Irish, collected from John McFadden',
    mode: 'pitch', tuning: 'wide-diatonic', tempo: 136, timeSig: [2, 2],
    about: 'All four strains of O’Neill’s 1903 setting, in B♭ for the koto. The triplets and leaps through the upper register are the challenge. Start at half speed and loop eight bars at a time.',
    source: ONEILL_SCORE + '#page=237',
    score: `
rh. Bb4e G4e | F4q D4e F4e F4q Bb4e G4e | F4e3 G4e3 F4e3 D4e F4e G4e C4e C4e re | F4q D4e F4e F4q G4e Bb4e |
C5e3 D5e3 Eb5e3 D5e Bb4e C5e A4e Bb4e G4e | F4q D4e F4e F4q Bb4e G4e | F4e3 G4e3 F4e3 D4e F4e G4e C4e C4e D4e | Bb3e C4e D4e Eb4e F4e D4e F4e G4e |
Bb4e C5e D5e Bb4e C5e A4e Bb4e G4e | F4e Bb3e D4e3 C4e3 Bb3e3 F4q Bb4e G4e | F4e Bb3e D4e F4e G4e C4e C4e re | F4e Bb3e D4e3 C4e3 Bb3e3 F4q G4e Bb4e |
C5e3 D5e3 Eb5e3 D5e Bb4e C5e A4e Bb4e G4e | F4e Bb3e D4e3 C4e3 Bb3e3 F4q Bb4e G4e | F4e Bb3e D4e3 C4e3 Bb3e3 G4e C4e C4e re | Bb3e C4e D4e Eb4e F4e D4e F4e G4e |
Bb4e C5e D5e Bb4e C5e D5e Eb5e C5e | F5e3 G5e3 F5e3 D5e Bb4e C5e Bb4e Bb4e D5e | F5e3 G5e3 F5e3 D5e Bb4e C5e G4e G4e re | F5e3 G5e3 F5e3 D5e Bb4e C5e Bb4e Bb4e D5e |
C5e3 D5e3 Eb5e3 D5e Bb4e C5e G4e G4e re | F5e3 G5e3 F5e3 D5e Bb4e C5e Bb4e Bb4e D5e | F5e3 G5e3 F5e3 D5e Bb4e C5e G4e G4e re | F5e3 G5e3 F5e3 D5e Bb4e C5e Bb4e Bb4e D5e |
Eb5e3 D5e3 C5e3 D5e Bb4e C5e G4e G4e Bb4e | D5e3 Eb5e3 D5e3 Bb4e D5e C5e3 D5e3 C5e3 Bb4e C5e | D5e3 Eb5e3 D5e3 Bb4e D5e C5e G4e G4e re | D5e3 Eb5e3 D5e3 Bb4e D5e C5e3 D5e3 C5e3 Bb4e D5e |
C5e3 D5e3 Eb5e3 D5e Bb4e C5e G4e G4e Bb4e | D5e3 Eb5e3 D5e3 Bb4e D5e C5e3 D5e3 C5e3 Bb4e C5e | D5e3 Eb5e3 D5e3 Bb4e D5e C5e G4e G4e re | D5e F5e F5e D5e G5e D5e F5e D5e |
C5e3 D5e3 Eb5e3 D5e Bb4e C5e A4e Bb4e G4e |`,
  },
  {
    id: 'banish-misfortune', title: 'Banish Misfortune',
    tradition: 'European', category: 'Irish double jig', composer: 'Traditional Irish, collected from Edward Cronin',
    mode: 'pitch', tuning: 'wide-diatonic', tempo: 144, timeSig: [6, 8],
    about: 'O’Neill’s 1903 setting, with the repeats and alternate endings written out. The sixteenth-note turns fit inside the two large beats of each bar. Group three eighth notes to keep the jig pulse.',
    source: ONEILL_SCORE + '#page=156',
    score: `
rh re F4s Eb4s | D4q Bb3e Bb3e C4e Bb3e | Bb3e C4e D4e Eb4e D4e Eb4e | F4q. A4e F4e Eb4e |
F4e G4e A4e Bb4s A4s F4e Eb4e | D4q Bb3e Bb3e C4e Bb3e | Bb3e C4e D4e Eb4e D4e Eb4e | F4e Bb4e G4e A4e Bb4e C5e |
Bb4q. Bb4q F4s Eb4s | D4q Bb3e Bb3e C4e Bb3e | Bb3e C4e D4e Eb4e D4e Eb4e | F4q. A4e F4e Eb4e |
F4e G4e A4e Bb4s A4s F4e Eb4e | D4q Bb3e Bb3e C4e Bb3e | Bb3e C4e D4e Eb4e D4e Eb4e | F4e Bb4e G4e A4e Bb4e C5e |
Bb4q. Bb4q Bb4s C5s | D5q Bb4s Bb4s Bb4e A4e Bb4e | Bb4e D5e F5e F5e Eb5e D5e | C5q A4s A4s A4e G4e A4e |
C5s Bb4s C5e D5e Eb5e D5e C5e | D5q Bb4s Bb4s Bb4e A4e Bb4e | Bb4e D5e F5e F5e Eb5e D5e | Eb5s D5s C5e Bb4e A4e Bb4e C5e |
Bb4q. Bb4q Bb4s C5s | D5q Bb4s Bb4s Bb4e A4e Bb4e | Bb4e D5e F5e F5e Eb5e D5e | C5q A4s A4s A4e G4e A4e |
C5s Bb4s C5e D5e Eb5e D5e C5e | D5e Eb5e F5e Eb5e F5e G5e | F5e D5e Bb4e C5e A4e F4e | D5e C5e Bb4e A4e Bb4e C5e |
Bb4q. Bb4q Bb4s C5s | D5s C5s Bb4e D5e C5s Bb4s A4e C5e | Bb4s A4s F4e G4e A4e F4e Eb4e | D4q Bb3e Bb3e C4e Bb3e |
Bb3e C4e D4e Eb4e D4e Eb4e | F4s Eb4s F4e G4e A4e F4e Eb4e | F4e Bb4e G4e A4e Bb4e C5e | D5e C5e Bb4e A4e Bb4e C5e |
Bb4q. Bb4q Bb4s C5s | D5s C5s Bb4e D5e C5s Bb4s A4e C5e | Bb4s A4s F4e G4e A4e F4e Eb4e | D4q Bb3e Bb3e C4e Bb3e |
Bb3e C4e D4e Eb4e D4e Eb4e | F4s Eb4s F4e G4e A4e F4e Eb4e | F4e Bb4e G4e A4e Bb4e C5e | D5e C5e Bb4e A4e Bb4e C5e |
Bb4q. Bb4q re |`,
  },
  {
    id: 'tai-tu-dance', title: 'Vũ Điệu Đông Dương (opening)',
    tradition: 'Vietnamese', category: 'Đờn ca tài tử', composer: 'Traditional Vietnamese, transcribed by Julien Tiersot',
    mode: 'pitch', tuning: 'gaku', tempo: 112, timeSig: [2, 4],
    about: 'The first four phrases of a tài tử melody that Tiersot learned from the musicians’ leader in Paris in 1900. The short turns shift between the middle and upper strings. Let the longer phrase endings ring.',
    source: TIERSOT_PLATES + '#page=3',
    score: `
G4e G4e D4e D4e | G4q C5e E5e | D5s E5s D5s C5s G4q | A4e C5e D5e G5e |
E5e D5e C5q | C5e C5e D5e E5e | D5e C5e G4q | C5e E5e D5e C5e |
G4q E4q | G4q A4q | C5q C5e C5e | G4q D5q |
C5e E5e D5e C5e | A4q C5e E5e | D5e C5e A4q | D5e. C5s G4s E4s G4s A4s |
C5q rq |`,
  },
  {
    id: 'tiersot-chinese-melody', title: 'Chinese Folk Melody (Tiersot, 1905)',
    tradition: 'Chinese', category: 'Historical folk song', composer: 'Traditional Chinese, transcribed by Julien Tiersot',
    mode: 'pitch', tuning: 'nogi', tempo: 88, timeSig: [2, 4],
    about: 'The complete pentatonic song printed as “Mélodie populaire chinoise” in Tiersot’s 1905 collection. Follow the repeated questions in the upper register and the answer as it descends toward the end.',
    source: TIERSOT_PLATES + '#page=4',
    score: `
E5q D5q | E5q E5e G5e | B4q A4e B4e | D5q D5e re |
B4q E5e E5e | D5q B4q | A4q. G4e | A4q A4e re |
B4q B4e D5e | E5q E5q | G5q E5q | D5q D5e re |
B4q E5e E5e | D5q B4q | A4q. G4e | A4q A4e re |
A4q A4e B4e | D5h | B4q D5q | D5q E5q | B4e D5e B4e A4e |
G4q E4e re | G4q B4q | A4q A4e G4e | E4q A4e A4e | G4q E4q | D4q D4e re |
E4q E4q | G4q D4q | E4h | -q E4e re |`,
  },
];
