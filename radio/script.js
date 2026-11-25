/* =====================================================================
   PROGRAMM-TEXTE  –  HIER KANNST DU DIE TEXTE BEARBEITEN
   ---------------------------------------------------------------------
   Jeder Eintrag entspricht einem Programm (Reihenfolge = gen1 … gen6).
     frequenz: Position auf der Skala in MHz (zwischen 87.5 und 108)
     titel:    die Überschrift auf der Texttafel
     inhalt:   der Fließtext (Zeilenumbrüche mit \n sind möglich)
   ===================================================================== */
const PROGRAMME = [
  { frequenz:  89.0, titel: "Generation 1", inhalt: "Inhalt" },   // sound/gen1.mp3
  { frequenz:  92.5, titel: "Generation 2", inhalt: "Inhalt" },   // sound/gen2.mp3
  { frequenz:  96.0, titel: "Generation 3", inhalt: "Inhalt" },   // sound/gen3.mp3
  { frequenz:  99.5, titel: "Generation 4", inhalt: "Inhalt" },   // sound/gen4.mp3
  { frequenz: 103.0, titel: "Generation 5", inhalt: "Inhalt" },   // sound/gen5.mp3
  { frequenz: 106.5, titel: "Generation 6", inhalt: "Inhalt" },   // sound/gen6.mp3
];
/* ===================== ENDE DER PROGRAMM-TEXTE ===================== */


/* =====================================================================
   EINSTELLUNGEN
   ===================================================================== */
const CROSSFADE_SEK         = 0.5;   // Dauer des Crossfades
const STOPP_VERZOEGERUNG_MS = 250;   // so lange ohne Bewegung = "Regler steht"
const MAX_WINKEL            = 150;   // Regler dreht von -150° bis +150°
const F_MIN = 87.5;                  // Skalenanfang in MHz
const F_MAX = 108;                   // Skalenende in MHz

// Audiodateien (relativ zu index.html)
const NOISE_PFAD = "sound/noise.mp3";
const PFADE      = PROGRAMME.map((_, i) => `sound/gen${i + 1}.mp3`);


/* =====================================================================
   ELEMENTE
   ===================================================================== */
const $ = id => document.getElementById(id);
const knob = $("knob"), needle = $("needle"), scaleEl = $("scale");
const startEl = $("startBtn").parentElement, startBtn = $("startBtn");
const lamp = $("lamp"), freqEl = $("freq"), statusEl = $("status");
const plate = $("plate"), metaEl = $("plateMeta"),
      titelEl = $("plateTitel"), inhaltEl = $("plateInhalt");

const proz = f => ((f - F_MIN) / (F_MAX - F_MIN)) * 100;
const fmt  = f => f.toFixed(1).replace(".", ",");


/* =====================================================================
   SKALA AUFBAUEN (realistische FM-Skala 88–108 MHz)
   ===================================================================== */
const markerEls = [];
(function baueSkala() {
  for (let f = 88; f <= 108; f += 0.5) {
    const ganz  = Number.isInteger(f);
    const major = f % 4 === 0;
    const t = document.createElement("div");
    t.className = "tick " + (major ? "major" : ganz ? "whole" : "half");
    t.style.left = proz(f) + "%";
    scaleEl.insertBefore(t, needle);
    if (major) {
      const n = document.createElement("div");
      n.className = "num";
      n.textContent = f;
      n.style.left = proz(f) + "%";
      scaleEl.insertBefore(n, needle);
    }
  }
  PROGRAMME.forEach((p, i) => {
    const s = document.createElement("div");
    s.className = "station";
    s.style.left = proz(p.frequenz) + "%";
    s.innerHTML = `<i></i><span>${i + 1}</span>`;
    scaleEl.insertBefore(s, needle);
    markerEls.push(s);
  });
})();


/* =====================================================================
   AUDIO
   Einfache <audio>-Elemente mit relativen Pfaden (sound/gen1.mp3 …).
   Alle Loops laufen stumm mit und werden nur lauter/leiser geregelt –
   wie bei einem echten Radio, bei dem die Sender immer senden.
   ===================================================================== */
let ctx = null;            // nur wenn über http(s) geöffnet (für saubere Lautstärke auch auf iOS)
let noiseKanal = null;
let programmKanaele = [];
let audioBereit = false;
const fehler = [];

function meldeFehler(pfad) {
  if (!fehler.includes(pfad)) fehler.push(pfad);
  statusEl.textContent = "Datei nicht gefunden / nicht lesbar: " + fehler.join(", ");
}

function erstelleKanal(pfad) {
  const el = new Audio(pfad);
  el.loop = true;
  el.preload = "auto";
  el.addEventListener("error", () => meldeFehler(pfad));
  const kanal = { el, gain: null, level: 0, anim: false };

  if (ctx) {
    try {
      const src = ctx.createMediaElementSource(el);
      kanal.gain = ctx.createGain();
      kanal.gain.gain.value = 0;
      src.connect(kanal.gain).connect(ctx.destination);
    } catch (e) { kanal.gain = null; el.volume = 0; }
  } else {
    el.volume = 0;
  }
  return kanal;
}

function setLevel(k, v) {
  k.level = Math.max(0, Math.min(1, v));
  if (k.gain) k.gain.gain.value = k.level;
  else k.el.volume = k.level;
}

// kleiner Fader für alle Kanäle
let tickerLaeuft = false;
function fadeTo(k, ziel, dauerSek) {
  if (dauerSek <= 0) { k.anim = false; setLevel(k, ziel); return; }
  k.from = k.level; k.to = ziel;
  k.t0 = performance.now(); k.dur = dauerSek * 1000;
  k.anim = true;
  if (!tickerLaeuft) { tickerLaeuft = true; requestAnimationFrame(ticker); }
}
function ticker(now) {
  let aktiv = false;
  [noiseKanal, ...programmKanaele].forEach(k => {
    if (!k || !k.anim) return;
    const p = Math.min(1, (now - k.t0) / k.dur);
    setLevel(k, k.from + (k.to - k.from) * p);
    if (p >= 1) k.anim = false; else aktiv = true;
  });
  if (aktiv) requestAnimationFrame(ticker); else tickerLaeuft = false;
}

async function audioStarten() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && location.protocol.startsWith("http")) {
    ctx = new AC();
    await ctx.resume();
  }
  noiseKanal = erstelleKanal(NOISE_PFAD);
  programmKanaele = PFADE.map(erstelleKanal);

  const alle = [noiseKanal, ...programmKanaele];
  await Promise.allSettled(alle.map(k => k.el.play()));

  audioBereit = true;
  lamp.classList.add("on");
  aktualisiereAudio(true);
}

/** Lautstärken je nach Zustand (dreht / steht) */
function aktualisiereAudio(sofort = false) {
  if (!audioBereit) return;
  const d = sofort ? 0 : CROSSFADE_SEK;
  fadeTo(noiseKanal, dreht ? 1 : 0, d);
  programmKanaele.forEach((k, i) => {
    fadeTo(k, (!dreht && i === aktuellerSender) ? 1 : 0, d);
  });
}


/* =====================================================================
   REGLER-ZUSTAND
   ===================================================================== */
const frequenzAusWinkel = w => F_MIN + ((w + MAX_WINKEL) / (MAX_WINKEL * 2)) * (F_MAX - F_MIN);
const winkelAusFrequenz = f => -MAX_WINKEL + ((f - F_MIN) / (F_MAX - F_MIN)) * MAX_WINKEL * 2;

function naechsterSender(f) {
  let best = 0, dist = Infinity;
  PROGRAMME.forEach((p, i) => {
    const d = Math.abs(p.frequenz - f);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

let winkel = winkelAusFrequenz(PROGRAMME[0].frequenz);
let aktuellerSender = naechsterSender(frequenzAusWinkel(winkel));
let dreht = false;
let stoppTimer = null;
let zeigerGedrueckt = false;

function zeichne() {
  const f = frequenzAusWinkel(winkel);
  knob.style.transform = `rotate(${winkel}deg)`;
  needle.style.left = proz(f) + "%";
  freqEl.textContent = fmt(f);
  const s = naechsterSender(f);
  markerEls.forEach((m, i) => m.classList.toggle("active", i === s));
  knob.setAttribute("aria-valuenow", s + 1);
}

function zeigeText(i) {
  const p = PROGRAMME[i];
  metaEl.textContent = `Programm ${i + 1} · ${fmt(p.frequenz)} MHz`;
  titelEl.textContent = p.titel;
  inhaltEl.textContent = p.inhalt;
}

function beiBewegung() {
  const warSchon = dreht;
  dreht = true;
  zeichne();
  if (!warSchon) {
    plate.classList.add("tuning");
    aktualisiereAudio();            // Crossfade: Programm -> Rauschen
  }
  clearTimeout(stoppTimer);
  if (!zeigerGedrueckt) planeStopp();
}

function planeStopp() {
  clearTimeout(stoppTimer);
  stoppTimer = setTimeout(beiStopp, STOPP_VERZOEGERUNG_MS);
}

function beiStopp() {
  dreht = false;
  aktuellerSender = naechsterSender(frequenzAusWinkel(winkel));
  zeigeText(aktuellerSender);
  plate.classList.remove("tuning");
  aktualisiereAudio();              // Crossfade: Rauschen -> Programm
}

function setzeWinkel(neu) {
  const b = Math.max(-MAX_WINKEL, Math.min(MAX_WINKEL, neu));
  if (b === winkel) return;
  winkel = b;
  beiBewegung();
}


/* =====================================================================
   EINGABE: Ziehen (Maus/Touch), Mausrad, Tastatur
   ===================================================================== */
let letzterZeigerWinkel = 0;

function zeigerWinkel(e) {
  const r = knob.getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2),
                    e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
}

knob.addEventListener("pointerdown", e => {
  zeigerGedrueckt = true;
  knob.setPointerCapture(e.pointerId);
  letzterZeigerWinkel = zeigerWinkel(e);
  e.preventDefault();
});

knob.addEventListener("pointermove", e => {
  if (!zeigerGedrueckt) return;
  const w = zeigerWinkel(e);
  let diff = w - letzterZeigerWinkel;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  letzterZeigerWinkel = w;
  setzeWinkel(winkel + diff);
});

function zeigerLos() {
  if (!zeigerGedrueckt) return;
  zeigerGedrueckt = false;
  if (dreht) planeStopp();
}
knob.addEventListener("pointerup", zeigerLos);
knob.addEventListener("pointercancel", zeigerLos);

knob.addEventListener("wheel", e => {
  e.preventDefault();
  setzeWinkel(winkel + e.deltaY * 0.25);
}, { passive: false });

knob.addEventListener("keydown", e => {
  if (e.key === "ArrowRight" || e.key === "ArrowUp")   { setzeWinkel(winkel + 4); e.preventDefault(); }
  if (e.key === "ArrowLeft"  || e.key === "ArrowDown") { setzeWinkel(winkel - 4); e.preventDefault(); }
});


/* =====================================================================
   START (Browser erlauben Ton erst nach einem Klick)
   ===================================================================== */
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  startBtn.textContent = "Lade …";
  try {
    await audioStarten();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Audio konnte nicht gestartet werden: " + err.message;
  }
  startEl.style.display = "none";
});


/* =====================================================================
   INIT
   ===================================================================== */
zeichne();
zeigeText(aktuellerSender);
