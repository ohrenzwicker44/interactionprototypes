/* =====================================================================
   PROGRAMM-TEXTE  –  HIER KANNST DU DIE TEXTE BEARBEITEN
   ---------------------------------------------------------------------
   Jeder Eintrag entspricht einem Programm (Reihenfolge = gen1 … gen6).
     titel:  die Überschrift unter dem Regler
     inhalt: der Fließtext (Zeilenumbrüche mit \n sind möglich)
   ===================================================================== */
const PROGRAMME = [
  { titel: "Generation 1", inhalt: "Inhalt" },   // gen1.mp3
  { titel: "Generation 2", inhalt: "Inhalt" },   // gen2.mp3
  { titel: "Generation 3", inhalt: "Inhalt" },   // gen3.mp3
  { titel: "Generation 4", inhalt: "Inhalt" },   // gen4.mp3
  { titel: "Generation 5", inhalt: "Inhalt" },   // gen5.mp3
  { titel: "Generation 6", inhalt: "Inhalt" },   // gen6.mp3
];
/* ===================== ENDE DER PROGRAMM-TEXTE ===================== */


/* =====================================================================
   EINSTELLUNGEN
   ===================================================================== */
const SOUND_ORDNER   = "sound";      // Ordner mit den Audiodateien
const NOISE_DATEI    = "noise.mp3";
const CROSSFADE_SEK  = 0.5;          // Dauer des Crossfades
const STOPP_VERZOEGERUNG_MS = 250;   // so lange ohne Bewegung = "Regler steht"
const MAX_WINKEL     = 135;          // Regler dreht von -135° bis +135°

const ANZAHL = PROGRAMME.length;
const DATEIEN = PROGRAMME.map((_, i) => `${SOUND_ORDNER}/gen${i + 1}.mp3`);


/* =====================================================================
   ELEMENTE
   ===================================================================== */
const knob       = document.getElementById("knob");
const needle     = document.getElementById("needle");
const ticksEl    = document.getElementById("ticks");
const startEl    = document.getElementById("start");
const startBtn   = document.getElementById("startBtn");
const programmEl = document.getElementById("programm");
const titelEl    = document.getElementById("programmTitel");
const inhaltEl   = document.getElementById("programmInhalt");


/* =====================================================================
   SKALA AUFBAUEN
   ===================================================================== */
const labelEls = [];
(function baueSkala() {
  // Feine Striche
  const strichAnzahl = ANZAHL * 10;
  for (let i = 0; i <= strichAnzahl; i++) {
    const t = document.createElement("div");
    const major = i % 10 === 0;
    t.className = "tick" + (major ? " major" : "");
    t.style.left = (i / strichAnzahl * 100) + "%";
    t.style.height = major ? "34px" : "18px";
    ticksEl.appendChild(t);
  }
  // Senderbeschriftung in der Mitte jedes Abschnitts
  for (let i = 0; i < ANZAHL; i++) {
    const l = document.createElement("div");
    l.className = "label";
    l.textContent = String(i + 1);
    l.style.left = ((i + 0.5) / ANZAHL * 100) + "%";
    ticksEl.appendChild(l);
    labelEls.push(l);
  }
})();


/* =====================================================================
   AUDIO (Web Audio API für nahtlose Loops)
   ===================================================================== */
let ctx = null;
let noiseGain = null;
let programmGains = [];
let audioBereit = false;

async function ladeBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const data = await res.arrayBuffer();
  return ctx.decodeAudioData(data);
}

function starteLoop(buffer) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(gain);
  return { src, gain };
}

async function audioStarten() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  await ctx.resume();

  const alle = await Promise.all([NOISE_DATEI, ...DATEIEN.map(d => d)]
    .map((d, i) => ladeBuffer(i === 0 ? `${SOUND_ORDNER}/${d}` : d)));

  const noise = starteLoop(alle[0]);
  noiseGain = noise.gain;

  const loops = alle.slice(1).map(starteLoop);
  programmGains = loops.map(l => l.gain);

  // Alle Loops starten gleichzeitig und laufen stumm mit,
  // wie bei einem echten Radio (die Sender laufen ja immer).
  const t0 = ctx.currentTime + 0.1;
  noise.src.start(t0);
  loops.forEach(l => l.src.start(t0));

  audioBereit = true;
  aktualisiereAudio(true);
}

function rampe(param, ziel, dauer) {
  const jetzt = ctx.currentTime;
  param.cancelScheduledValues(jetzt);
  param.setValueAtTime(param.value, jetzt);
  param.linearRampToValueAtTime(ziel, jetzt + dauer);
}

/** Setzt Lautstärken je nach Zustand (dreht / steht) */
function aktualisiereAudio(sofortStumm = false) {
  if (!audioBereit) return;
  const dauer = sofortStumm ? 0.01 : CROSSFADE_SEK;
  rampe(noiseGain.gain, dreht ? 1 : 0, dauer);
  programmGains.forEach((g, i) => {
    const ziel = (!dreht && i === aktuellerSender) ? 1 : 0;
    rampe(g.gain, ziel, dauer);
  });
}


/* =====================================================================
   REGLER-ZUSTAND
   ===================================================================== */
let winkel = -MAX_WINKEL + (MAX_WINKEL * 2) / (ANZAHL * 2); // Start: Mitte von Sender 1
let aktuellerSender = senderAusWinkel();
let angezeigterSender = -1;
let dreht = false;
let stoppTimer = null;

function position() { return (winkel + MAX_WINKEL) / (MAX_WINKEL * 2); } // 0..1
function senderAusWinkel() {
  return Math.min(ANZAHL - 1, Math.floor(position() * ANZAHL));
}

function zeichne() {
  knob.style.transform = `rotate(${winkel}deg)`;
  needle.style.left = (position() * 100) + "%";
  const s = senderAusWinkel();
  labelEls.forEach((l, i) => l.classList.toggle("active", i === s));
  knob.setAttribute("aria-valuenow", s + 1);
}

function zeigeText(index) {
  if (index === angezeigterSender) return;
  angezeigterSender = index;
  programmEl.classList.add("fade");
  setTimeout(() => {
    titelEl.textContent = PROGRAMME[index].titel;
    inhaltEl.textContent = PROGRAMME[index].inhalt;
    programmEl.classList.remove("fade");
  }, 200);
}

function beiBewegung() {
  const warSchonAmDrehen = dreht;
  dreht = true;
  zeichne();
  if (!warSchonAmDrehen) aktualisiereAudio();   // Crossfade: Programm -> Rauschen
  clearTimeout(stoppTimer);
  if (!zeigerGedrueckt) planeStopp();
}

function planeStopp() {
  clearTimeout(stoppTimer);
  stoppTimer = setTimeout(beiStopp, STOPP_VERZOEGERUNG_MS);
}

function beiStopp() {
  dreht = false;
  aktuellerSender = senderAusWinkel();
  zeigeText(aktuellerSender);
  aktualisiereAudio();                          // Crossfade: Rauschen -> Programm
}

function setzeWinkel(neu) {
  const begrenzt = Math.max(-MAX_WINKEL, Math.min(MAX_WINKEL, neu));
  if (begrenzt === winkel) return;
  winkel = begrenzt;
  beiBewegung();
}


/* =====================================================================
   EINGABE: Ziehen (Maus/Touch), Mausrad, Tastatur
   ===================================================================== */
let zeigerGedrueckt = false;
let letzterZeigerWinkel = 0;

function zeigerWinkel(e) {
  const r = knob.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
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
  if (e.key === "ArrowRight" || e.key === "ArrowUp") { setzeWinkel(winkel + 6); e.preventDefault(); }
  if (e.key === "ArrowLeft"  || e.key === "ArrowDown") { setzeWinkel(winkel - 6); e.preventDefault(); }
});


/* =====================================================================
   START (Browser erlauben Ton erst nach einem Klick)
   ===================================================================== */
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  startBtn.textContent = "Lade Sender …";
  try {
    await audioStarten();
    startEl.style.display = "none";
  } catch (err) {
    console.error(err);
    startBtn.disabled = false;
    startBtn.textContent = "Fehler beim Laden – erneut versuchen";
    alert("Audiodateien konnten nicht geladen werden.\n" +
          "Liegen gen1.mp3 … gen6.mp3 und noise.mp3 im Ordner \"" + SOUND_ORDNER + "\"?\n" +
          "Lokal bitte über einen Server öffnen (nicht per Doppelklick).\n\n" + err.message);
  }
});


/* =====================================================================
   INIT
   ===================================================================== */
zeichne();
zeigeText(aktuellerSender);
