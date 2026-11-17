/* Carillon con ballerina: interazione e macchina a stati (document.body.dataset.fase):
   ferma -> carica -> suona -> aperto -> (fine brano) ferma. Richiede js/audio.js (window.Carillon). */
(function () {
'use strict';

const BATTUTA_CASSETTO = 8;   // il cassetto si apre al termine di questa battuta
const SCATTO_GRADI = 30;      // rotazione oraria accumulata per ogni scatto
const GIRI_AGGANCIO = 3;      // giri di carica dopo i quali parte il brano
const GIRI_NOTE = 1;          // dal 1o giro ogni scatto suona anche una nota

/* Unico punto da ritoccare per il layout: left/top/width in % del contenitore (2:3); l'altezza segue
   le proporzioni dell'immagine. Misure sull'immagine cassa ritagliata (871x1019), larga 88%:
   punta ballerina sulla pedana a (52.2%, 52.3%); nicchia (cornice d'oro) x 32.1-72.7%, y 69.5-85.1%. */
const LAYOUT = {
  cassa:     { left: 6,    top: 21.4, width: 88 },
  ballerina: { left: 41.05, top: 33.7, width: 22 },   // punta del piede (centro del bordo basso) sul centro della pedana
  biglietto: { left: 32.1, top: 65.5, width: 40 },     // chiuso (scale .55) sta tutto dietro il frontale del cassetto
  cassetto:  { left: 23,   top: 68.7, width: 58.3 },   // altezza = nicchia + margine; sborda ai lati sulla cornice
};
/* Manovella: cx/cy = centro del disco (% del contenitore); hit = lato dell'area di tocco; img = larghezza dell'immagine
   (il disco e' il 25,1% del lato dell'immagine). Il centro di rotazione e' il centro dell'area di tocco. */
const MANOVELLA = { cx: 87.5, cy: 74.9, hit: 24, img: 68.5 };
LAYOUT.manovella = { left: MANOVELLA.cx - MANOVELLA.hit / 2, top: MANOVELLA.cy - MANOVELLA.hit / 3, width: MANOVELLA.hit };
LAYOUT.freccia = { left: MANOVELLA.cx - 12, top: MANOVELLA.cy - 12 / 1.5, width: 24 };   // centrata sul disco
for (const id in LAYOUT) {
  const s = document.getElementById(id).style, l = LAYOUT[id];
  s.left = l.left + '%'; s.top = l.top + '%'; s.width = l.width + '%';
}
{
  const r = MANOVELLA.img / MANOVELLA.hit * 100, s = document.getElementById('manovella-ruota').style;
  s.width = r + '%'; s.left = s.top = -(r - 100) / 2 + '%';
}

const $ = id => document.getElementById(id);
const body = document.body, manovella = $('manovella'), ruota = $('manovella-ruota');
let timerScritta = 0;   // sfumatura della scritta dopo l'aggancio
let frenata = 0;   // identifica la frenata in corso (annullabile se si riparte)
let fase = 'ferma', accumulato = 0, scatti = 0, rot = 0, ultimo = null, spostato = 0, daBattuta = 1;

function setFase(f) { fase = body.dataset.fase = f; }

/* ---------- Manovella ---------- */
const angolo = e => {
  const r = manovella.getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
};

manovella.addEventListener('pointerdown', e => {
  e.preventDefault();
  manovella.setPointerCapture(e.pointerId);
  Carillon.inizializza();                       // il gesto utente sblocca l'audio (iOS)
  if (fase === 'ferma') { accumulato = scatti = 0; Carillon.azzera(); setFase('carica'); }
  ultimo = angolo(e); spostato = 0;
});

manovella.addEventListener('pointermove', e => {
  if (ultimo === null) return;
  const a = angolo(e);
  let d = a - ultimo; ultimo = a;
  if (d > 180) d -= 360; else if (d < -180) d += 360;
  if (d <= 0) return;                           // solo senso orario: l'antiorario si ignora
  rot += d; spostato += d;
  if (fase !== 'carica') return;                // durante suona/aperto i giri non aggiungono nulla
  accumulato += d;
  while (fase === 'carica' && accumulato >= (scatti + 1) * SCATTO_GRADI) { scatti++; scatto(); }
});

function fineGesto() {
  if (ultimo !== null && spostato < 8) {        // tocco senza trascinare: la freccia pulsa
    const f = $('freccia'); f.classList.remove('pulsa'); void f.offsetWidth; f.classList.add('pulsa');
  }
  ultimo = null;
}
manovella.addEventListener('pointerup', fineGesto);
manovella.addEventListener('pointercancel', fineGesto);

/* Sblocco audio robusto (mobile: l'attivazione utente puo' arrivare su pointerup/touchend/click). */
const sblocca = () => Carillon.inizializza();
['pointerup', 'touchend', 'click', 'keydown'].forEach(n => document.addEventListener(n, sblocca, { passive: true }));
manovella.addEventListener('pointerup', sblocca);
manovella.addEventListener('pointercancel', sblocca);
const riprendi = () => { if (document.visibilityState !== 'hidden' && (fase === 'suona' || fase === 'aperto')) Carillon.inizializza(); };
document.addEventListener('visibilitychange', riprendi);
window.addEventListener('pageshow', riprendi);
$('freccia').addEventListener('animationend', e => e.currentTarget.classList.remove('pulsa'));

function scatto() {
  const giri = scatti * SCATTO_GRADI / 360;
  if (giri >= GIRI_AGGANCIO) return aggancia();
  const c = giri / GIRI_AGGANCIO;
  if (giri >= 2) body.dataset.scritta = '2';    // seconda riga sotto la prima
  else if (giri >= GIRI_NOTE) body.dataset.scritta = '1';
  Carillon.scatto(c);
  if (giri >= GIRI_NOTE) Carillon.notaSuccessiva((giri - GIRI_NOTE) / (GIRI_AGGANCIO - GIRI_NOTE));
}

/* ---------- Brano ---------- */
function aggancia() {
  frenata++; delete body.dataset.frena;         // se la ballerina sta ancora frenando, riparte a velocita' piena
  $('ballerina').getAnimations({ subtree: true }).forEach(a => { a.playbackRate = 1; });
  setFase('suona');
  clearTimeout(timerScritta);                   // la scritta resta ~10 s e poi sfuma
  timerScritta = setTimeout(() => { if (body.dataset.scritta) body.dataset.scritta = 'fine'; }, 10000);
  daBattuta = Carillon.battutaCorrente();       // riparte dall'inizio della battuta corrente
  Carillon.avviaAutoplay(daBattuta, battuta => {
    if (battuta > Math.max(BATTUTA_CASSETTO, daBattuta) && fase === 'suona') {
      body.dataset.cassetto = 'aperto'; setFase('aperto');
    }
  }, fineBrano);
}

function fineBrano() {
  frenaBallerina();
  setFase('ferma');
  clearTimeout(timerScritta); delete body.dataset.scritta;   // torna l'invito
  accumulato = scatti = 0; Carillon.azzera();   // si puo' ricaricare; il cassetto resta aperto
}

// La ballerina rallenta in ease-out (playbackRate -> 0) e si ferma di fronte, a fine giro.
function frenaBallerina() {
  const anim = $('ballerina').getAnimations({ subtree: true });
  const giro = anim.find(a => a.animationName === 'piroetta');
  if (!giro) return;
  const mia = ++frenata;
  body.dataset.frena = '1';                      // tiene attiva l'animazione durante la frenata
  const D = 2600, r0 = giro.playbackRate;
  let resto = D - (giro.currentTime % D);
  if (resto < D * 0.3) resto += D;              // frenata abbastanza dolce (fino a ~6 s)
  const T = 2 * resto / r0, t0 = performance.now();   // r(s) = r0*(1 - s/T): ferma esattamente a fine giro
  (function passo(ora) {
    if (mia !== frenata) return;
    const s = (ora - t0) / T;
    if (s >= 1) { delete body.dataset.frena; return; }
    anim.forEach(a => { a.playbackRate = r0 * (1 - s); });
    requestAnimationFrame(passo);
  })(t0);
}

/* ---------- Rotazione visiva: segue la mano; da sola e lenta durante il brano ---------- */
let tPrec = performance.now();
(function frame(t) {
  if (fase === 'suona' || fase === 'aperto') rot += (t - tPrec) * 0.022;   // ~22 gradi/s
  tPrec = t;
  ruota.style.transform = 'rotate(' + rot.toFixed(1) + 'deg)';
  requestAnimationFrame(frame);
})(tPrec);

/* ---------- Biglietto a tutto schermo ---------- */
const zoom = $('zoom');
$('biglietto').addEventListener('click', () => {
  const c = $('biglietto').firstElementChild.cloneNode(true);
  c.setAttribute('role', 'img'); c.setAttribute('aria-label', 'Biglietto'); if (c.tagName === 'IMG' && !c.alt) c.alt = 'Biglietto';
  $('zoom-carta').replaceChildren(c);
  zoom.hidden = false;
});
const chiudi = () => { zoom.hidden = true; };
zoom.addEventListener('click', chiudi);          // anche toccando fuori (la carta ha pointer-events:none)
$('chiudi').addEventListener('click', chiudi);
document.addEventListener('keydown', e => { if (e.key === 'Escape') chiudi(); });

/* ---------- Copertina "apri il regalo" ----------
   Il 'click' arriva dopo il touchend: e' il gesto valido per sbloccare l'audio sui telefoni. */
const copertina = $('copertina');
copertina.addEventListener('click', () => {
  copertina.classList.add('aperta');            // subito non intercetta piu' i tocchi, poi sfuma
  Carillon.inizializza();
  Carillon.campanella();
  setTimeout(() => { copertina.hidden = true; }, 1300);
}, { once: true });
})();
