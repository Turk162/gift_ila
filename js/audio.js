/* Carillon con ballerina: sintesi e dati del brano (Web Audio, nessuna dipendenza).
   Brano: Danza della Fata Confetto (Schiaccianoci op. 71, Cajkovskij), Mi minore, 2/4, ~72 al quarto.
   Interfaccia pubblica: window.Carillon (vedi in fondo). */
(function () {
'use strict';

const BPM = 72, Q = 60 / BPM;      // secondi per quarto
const QUARTI_BATTUTA = 2;          // metro 2/4
const MIX_RIVERBERO = 0.35;        // quota wet del riverbero (0..1)

/* ---------- Dati del brano ----------
   Formato: [nota, durata in quarti]; 'R' = pausa. Una riga = una battuta (somma 2).
   Fonte: MusicXML di Ted Muller (tedmuller.us), battute 5-20 della parte di celesta
   (voce piu' alta della mano destra) e pizzicato di violoncelli/viole; battuta 17 aggiunta
   a mano come chiusura sulla tonica. */
const MELODIA = [
  ['R', .5], ['G6', .25], ['E6', .25], ['G6', .5], ['F#6', .5], // 1
  ['D#6', .5], ['E6', .5], ['D6', .25], ['D6', .25], ['D6', .5], // 2
  ['C#6', .25], ['C#6', .25], ['C#6', .5], ['C6', .25], ['C6', .25], ['C6', .5], // 3
  ['B5', .25], ['E6', .25], ['C6', .25], ['E6', .25], ['B5', .5], ['R', .5], // 4
  ['R', .5], ['G5', .25], ['E5', .25], ['G5', .5], ['F#5', .5], // 5
  ['C6', .5], ['B5', .5], ['G6', .25], ['G6', .25], ['G6', .5], // 6
  ['F#6', .25], ['F#6', .25], ['F#6', .5], ['E6', .25], ['E6', .25], ['E6', .5], // 7
  ['D#6', .25], ['F#6', .25], ['E6', .25], ['F#6', .25], ['D#6', .5], ['R', .5], // 8
  ['R', .5], ['G6', .25], ['E6', .25], ['G6', .5], ['F#6', .5], // 9
  ['D#6', .5], ['E6', .5], ['D6', .25], ['D6', .25], ['D6', .5], // 10
  ['C#6', .25], ['C#6', .25], ['C#6', .5], ['C6', .25], ['C6', .25], ['C6', .5], // 11
  ['B5', .25], ['E6', .25], ['C6', .25], ['E6', .25], ['B5', .5], ['R', .5], // 12
  ['R', .5], ['E6', .25], ['C#6', .25], ['E6', .5], ['D#6', .5], // 13
  ['R', .5], ['D6', .25], ['B5', .25], ['D6', .5], ['C#6', .5], // 14
  ['R', .5], ['C6', .25], ['A5', .25], ['C6', .5], ['B5', .5], // 15
  ['R', .5], ['B5', .125], ['D#6', .125], ['F#6', .125], ['B6', .125], ['B5', .5], ['R', .5], // 16
  ['E6', 1.5], ['R', .5], // 17 (chiusura aggiunta, non in partitura)
];

// Basso: violoncelli/contrabbassi sul tempo, viole sul controtempo (pizzicato). Battute 13-15 senza archi.
const BASSO = [
  ['E3', .5], ['G3', .5], ['E3', .5], ['A3', .5], // 1
  ['E3', .5], ['A#3', .5], ['E3', .5], ['B3', .5], // 2
  ['E3', .5], ['C#4', .5], ['E3', .5], ['D#4', .5], // 3
  ['E4', .5], ['E4', .5], ['E4', .5], ['R', .5], // 4
  ['A#2', .5], ['E3', .5], ['A2', .5], ['F#3', .5], // 5
  ['G2', .5], ['E3', .5], ['F#2', .5], ['F#3', .5], // 6
  ['F#3', .5], ['G#3', .5], ['F#2', .5], ['F#3', .5], // 7
  ['B2', .5], ['C3', .5], ['B2', .5], ['R', .5], // 8
  ['E3', .5], ['G3', .5], ['E3', .5], ['A3', .5], // 9
  ['E3', .5], ['A#3', .5], ['E3', .5], ['B3', .5], // 10
  ['E3', .5], ['C#4', .5], ['E3', .5], ['D#4', .5], // 11
  ['E4', .5], ['E4', .5], ['E4', .5], ['R', .5], // 12
  ['R', 6], // 13-15
  ['R', 1.5], ['B2', .5], // 16
  ['E3', .5], ['R', 1.5], // 17 (chiusura aggiunta)
];

/* ---------- Utilita' ---------- */
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function frequenza(nota) {                       // 'F#5' -> Hz (La4 = 440)
  const m = /^([A-G])([#b]?)(\d)$/.exec(nota);
  if (!m) return 0;
  const s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (+m[3] + 1);
  return 440 * Math.pow(2, (s - 69) / 12);
}
function eventi(dati) {                          // [[nota,dur]] -> [{t,f}] con t in quarti, senza pause
  let t = 0; const o = [];
  for (const [n, d] of dati) { if (n !== 'R') o.push({ t, f: frequenza(n) }); t += d; }
  return { ev: o, tot: t };
}
const M = eventi(MELODIA), B = eventi(BASSO);
const EV_MEL = M.ev, EV_BAS = B.ev, LUNGHEZZA = M.tot;   // quarti
const TOT_BATTUTE = Math.round(LUNGHEZZA / QUARTI_BATTUTA);

// Rallentando finale: ultime 2 battute. Tempo (secondi) di una posizione in quarti.
const RIT_LEN = 2 * QUARTI_BATTUTA, RIT_INI = LUNGHEZZA - RIT_LEN, RIT_K = 1.4;
const rit = q => Math.min(1, Math.max(0, (q - RIT_INI) / RIT_LEN));
const secondi = q => { const x = Math.max(0, q - RIT_INI); return Q * (q + RIT_K * x * x / (2 * RIT_LEN)); };

/* ---------- Grafo audio ---------- */
let ctx = null, dry, rev, rumore;
function inizializza() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.8;
    const lim = ctx.createDynamicsCompressor();  // limiter leggero
    lim.threshold.value = -10; lim.knee.value = 10; lim.ratio.value = 8; lim.attack.value = 0.003; lim.release.value = 0.2;
    master.connect(lim); lim.connect(ctx.destination);
    dry = ctx.createGain(); dry.gain.value = 1 - MIX_RIVERBERO * 0.5; dry.connect(master);
    rev = ctx.createConvolver();                 // impulso: rumore con decadimento (~2 s)
    const n = Math.floor(ctx.sampleRate * 2.2), imp = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = imp.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5); }
    rev.buffer = imp;
    const wet = ctx.createGain(); wet.gain.value = MIX_RIVERBERO;
    rev.connect(wet); wet.connect(master);
    rumore = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const r = rumore.getChannelData(0); for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
  }
  if (ctx.state !== 'running') { try { const p = ctx.resume(); p && p.catch && p.catch(() => {}); } catch (_) {} }   // anche 'interrupted' (iOS)
}

// Uscita di una voce: sempre sul secco, e (se wet > 0) anche sul riverbero.
function uscita(wet) {
  const g = ctx.createGain(); g.connect(dry);
  if (wet > 0) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s); s.connect(rev); }
  return g;
}
function inviluppo(vol, t, dur) {                // attacco istantaneo, decadimento esponenziale
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return g;
}

// Timbro carillon "lamella": fondamentale + parziali alte (x4.2 e x9.1 inarmoniche), piu' brevi.
const PARZIALI = [[1, 1, 1.3], [4.2, 0.14, 0.3], [9.1, 0.05, 0.1]];   // [rapporto, ampiezza, decadimento in s]
function lamella(f, t, vol, cents, wet) {
  const out = uscita(wet);
  for (const [r, a, d] of PARZIALI) {
    const o = ctx.createOscillator(), g = inviluppo(vol * a, t, d);
    o.frequency.value = f * r; o.detune.value = cents;
    o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.05);
  }
}
// Basso pizzicato: sinusoide + triangolo filtrato, decadimento breve.
function pizzicato(f, t, vol, cents, wet) {
  const out = uscita(wet), g = inviluppo(vol, t, 0.4), lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900;
  lp.connect(g); g.connect(out);
  for (const [tipo, a] of [['sine', 1], ['triangle', 0.45]]) {
    const o = ctx.createOscillator(), ga = ctx.createGain();
    o.type = tipo; o.frequency.value = f; o.detune.value = cents; ga.gain.value = a;
    o.connect(ga); ga.connect(lp); o.start(t); o.stop(t + 0.45);
  }
}

/* ---------- Fase "carica": scatti e note sparse ---------- */
let indice = 0;                                   // prossima nota della melodia da suonare a mano
function azzera() { indice = 0; }
function scatto(carica) {                         // burst brevissimo di rumore passa-banda
  if (!ctx) return;
  const t = ctx.currentTime, s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = inviluppo(0.35 + 0.25 * carica, t, 0.03);
  s.buffer = rumore; bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 1400; bp.Q.value = 2.5;
  s.connect(bp); bp.connect(g); g.connect(dry); s.start(t); s.stop(t + 0.05);
}
function notaSuccessiva(carica) {                 // carica 0..1: piu' forte e meno stonata col crescere della carica
  if (!ctx) return;
  const e = EV_MEL[indice++ % EV_MEL.length];
  const cents = (Math.random() * 2 - 1) * (10 + 70 * (1 - carica));
  lamella(e.f, ctx.currentTime, 0.06 + 0.3 * carica, cents, 0);
}
function battutaCorrente() {                      // battuta (da 1) dell'ultima nota suonata a mano
  return Math.floor(EV_MEL[Math.max(0, indice - 1) % EV_MEL.length].t / QUARTI_BATTUTA) + 1;
}

/* ---------- Autoplay con scheduler a lookahead sull'orologio di AudioContext ---------- */
let timer = null;
function ferma() { clearInterval(timer); timer = null; }
function avviaAutoplay(daBattuta, onBattuta, onFine) {
  ferma();
  // Orologio di riferimento: performance.now() (avanza sempre, anche con l'audio sospeso).
  // Battute e fine seguono questo orologio; le note vanno sull'audio solo se ctx e' 'running'.
  const adesso = () => performance.now() / 1000;
  const q0 = (daBattuta - 1) * QUARTI_BATTUTA, t0 = adesso() + 0.25 - secondi(q0);   // t0 = istante del quarto 0
  let iM = EV_MEL.findIndex(e => e.t >= q0), iB = EV_BAS.findIndex(e => e.t >= q0), bat = daBattuta;
  const fine = t0 + secondi(LUNGHEZZA) + 1.2, LOOK = 0.5;
  const pianifica = (lista, i, fn) => {
    const ora = adesso(), suona = ctx && ctx.state === 'running';
    while (i >= 0 && i < lista.length && t0 + secondi(lista[i].t) < ora + LOOK) {
      const e = lista[i++], t = t0 + secondi(e.t);
      // note scadute (o audio sospeso) si saltano; il tempo si converte sull'orologio audio
      if (suona && t > ora - 0.05) fn(e.f, Math.max(ctx.currentTime + (t - ora), ctx.currentTime), -200 * rit(e.t));   // calo d'intonazione
    }
    return i;
  };
  timer = setInterval(() => {
    iM = pianifica(EV_MEL, iM, (f, t, c) => lamella(f, t, 0.34, c, 1));
    iB = pianifica(EV_BAS, iB, (f, t, c) => pizzicato(f, t, 0.5, c, 0.25));
    while (bat <= TOT_BATTUTE && t0 + secondi((bat - 1) * QUARTI_BATTUTA) <= adesso()) onBattuta && onBattuta(bat++);
    if (adesso() >= fine) { ferma(); onFine && onFine(); }
  }, 40);
}

window.Carillon = { inizializza, scatto, notaSuccessiva, battutaCorrente, azzera, avviaAutoplay, ferma, TOT_BATTUTE };
})();
