'use strict';

/* =====================================================================
   WAS KOSTETE DAS DAMALS? – Grundgerüst (Tuner-Version)

   Aufbau:
     1. Konfiguration & Daten   (hier pflegst du Läden, Produkte, Preise)
     2. Zustand
     3. Hilfsfunktionen
     4. Tuner (Skala, Zeiger, Rändelrad)
     5. Laden & Hände
     6. Start

   Keine externen Bibliotheken – läuft auch offline.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. KONFIGURATION & DATEN
   --------------------------------------------------------------------- */

const YEAR_MIN   = 1900;
const YEAR_MAX   = 2025;
const START_YEAR = 1960;
const PPY        = 14;    // Pixel pro Jahr auf der Skala (= Abstand der Rillen am Rad)

/* Währungsepochen (Blick auf Deutschland, ohne DDR).
   Preise werden nur INNERHALB einer Epoche interpoliert. */
const ERAS = [
  { from: 1900, to: 1923, symbol: 'M',  name: 'Mark' },
  { from: 1924, to: 1947, symbol: 'RM', name: 'Reichsmark' },
  { from: 1948, to: 2001, symbol: 'DM', name: 'D-Mark' },
  { from: 2002, to: 2025, symbol: '€',  name: 'Euro' },
];

/* Läden und Produkte.
   prices = Stützpunkte { Jahr: Preis in der damaligen Währung }.
   Dazwischen wird linear interpoliert.

   ACHTUNG: Alle Preise unten sind PLATZHALTER zum Testen, nicht recherchiert!

   Neuen Laden hinzufügen (z. B. 'kino', 'technik'): weiteren Eintrag in
   SHOPS anlegen und mit enterShop('kino') betreten. */
const SHOPS = {
  lebensmittel: {
    name: 'Lebensmittelladen',
    products: [
      { id: 'brot',   name: 'Brot',   unit: '1 kg',     image: 'graphics/lebensmittel1.png', emoji: '🍞',
        prices: { 1900: 0.30, 1913: 0.35, 1924: 0.40, 1938: 0.33, 1947: 0.37,
                  1948: 0.50, 1960: 0.95, 1970: 1.40, 1980: 2.50, 1990: 3.20, 2001: 3.60,
                  2002: 1.90, 2010: 2.50, 2025: 4.20 } },
      { id: 'milch',  name: 'Milch',  unit: '1 Liter',  image: 'graphics/lebensmittel2.png', emoji: '🥛',
        prices: { 1900: 0.20, 1913: 0.22, 1924: 0.22, 1938: 0.23, 1947: 0.28,
                  1948: 0.40, 1960: 0.50, 1970: 0.65, 1980: 1.00, 1990: 1.15, 2001: 1.20,
                  2002: 0.65, 2010: 0.65, 2025: 1.20 } },
      { id: 'eier',   name: 'Eier',   unit: '10 Stück', image: 'graphics/lebensmittel3.png', emoji: '🥚',
        prices: { 1900: 0.80, 1913: 1.00, 1924: 1.40, 1938: 1.20, 1947: 1.50,
                  1948: 3.00, 1960: 2.80, 1970: 2.40, 1980: 2.60, 1990: 2.50, 2001: 2.60,
                  2002: 1.35, 2010: 1.60, 2025: 3.00 } },
      { id: 'butter', name: 'Butter', unit: '250 g',    image: 'graphics/lebensmittel4.png', emoji: '🧈',
        prices: { 1900: 0.60, 1913: 0.70, 1924: 0.75, 1938: 0.80, 1947: 0.85,
                  1948: 1.10, 1960: 1.30, 1970: 1.40, 1980: 2.50, 1990: 2.30, 2001: 1.80,
                  2002: 0.95, 2010: 1.20, 2025: 2.30 } },
      { id: 'kaffee', name: 'Kaffee', unit: '500 g',    image: 'graphics/lebensmittel5.png', emoji: '☕',
        prices: { 1900: 1.30, 1913: 1.50, 1924: 2.20, 1938: 3.30, 1947: 4.00,
                  1948: 9.00, 1960: 5.50, 1970: 7.00, 1980: 8.50, 1990: 7.50, 2001: 6.00,
                  2002: 3.20, 2010: 3.90, 2025: 7.00 } },
    ],
  },
};

/* Bilder der Hände (Ordner "graphics", Dateinamen klein geschrieben!) */
const HAND_LEFT_IMG  = 'graphics/handlinks.png';
const HAND_RIGHT_IMG = 'graphics/handrechts.png';


/* ---------------------------------------------------------------------
   2. ZUSTAND
   --------------------------------------------------------------------- */

const state = {
  yearFloat: START_YEAR,   // exakte Skalenposition (kann zwischen Jahren liegen)
  shownYear: null,         // zuletzt dargestelltes ganzes Jahr
  velocity: 0,             // Schwung nach dem Loslassen (Jahre pro Frame)
  target: null,            // Zieljahr für sanftes Gleiten (Tastatur, Klick)
  shopId: 'lebensmittel',  // aktueller Laden
  held: null,              // { shopId, id } – Produkt in der rechten Hand
  busy: false,             // true während das Produkt zur Hand fliegt
};


/* ---------------------------------------------------------------------
   3. HILFSFUNKTIONEN
   --------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const getYear = () => Math.round(state.yearFloat);
const eraOf = (year) => ERAS.find((e) => year >= e.from && year <= e.to);
const findProduct = (shopId, id) => SHOPS[shopId].products.find((p) => p.id === id);

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeEl(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/* Bild laden; fehlt die Datei, erscheint stattdessen ein Emoji als Platzhalter. */
function makeImage(src, alt, emoji) {
  const img = new Image();
  img.alt = alt;
  img.draggable = false;
  img.addEventListener('error', () => {
    const fallback = makeEl('span', 'emoji');
    fallback.textContent = emoji;
    fallback.setAttribute('role', 'img');
    fallback.setAttribute('aria-label', alt);
    img.replaceWith(fallback);
  });
  img.src = src;
  return img;
}

/* Preis eines Produkts in einem bestimmten Jahr (null = keine Daten). */
function priceAt(product, year) {
  const era = eraOf(year);
  const points = Object.entries(product.prices)
    .map(([y, p]) => [Number(y), p])
    .filter(([y]) => eraOf(y) === era)
    .sort((a, b) => a[0] - b[0]);

  if (points.length === 0) return null;
  if (year <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (year >= last[0]) return last[1];

  for (let i = 1; i < points.length; i++) {
    if (year <= points[i][0]) {
      const [y0, p0] = points[i - 1];
      const [y1, p1] = points[i];
      return p0 + ((p1 - p0) * (year - y0)) / (y1 - y0);
    }
  }
  return null;
}

function formatPrice(price, era) {
  const num = price.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${num} ${era.symbol}`;
}

function stickerText(shopId, productId) {
  const year = getYear();
  const price = priceAt(findProduct(shopId, productId), year);
  return price === null ? '–' : formatPrice(price, eraOf(year));
}


/* ---------------------------------------------------------------------
   4. TUNER
   Die Skala (Canvas) läuft unter dem festen roten Zeiger durch.
   Darunter zeigt das Rändelrad dieselbe Bewegung: eine Rille pro Jahr.
   --------------------------------------------------------------------- */

const tunerEl  = $('tuner');
const canvas   = $('scale');
const ctx      = canvas.getContext('2d');
const wheelEl  = $('wheel');
const cssVar   = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

let canvasW = 0, canvasH = 0;

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvasW = canvas.clientWidth;
  canvasH = canvas.clientHeight;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawScale();
}

function drawScale() {
  if (!canvasW) return;
  ctx.clearRect(0, 0, canvasW, canvasH);

  const ink = cssVar('--ink');
  const muted = cssVar('--muted');
  const cx = canvasW / 2;
  const halfYears = cx / PPY;
  const from = Math.max(YEAR_MIN, Math.floor(state.yearFloat - halfYears) - 1);
  const to   = Math.min(YEAR_MAX, Math.ceil(state.yearFloat + halfYears) + 1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '13px system-ui, -apple-system, "Segoe UI", sans-serif';
  ctx.lineWidth = 1;

  for (let y = from; y <= to; y++) {
    const x = Math.round(cx + (y - state.yearFloat) * PPY) + 0.5;
    let len = 12, color = muted;
    if (y % 5 === 0)  len = 22;
    if (y % 10 === 0) { len = 34; color = ink; }

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, 36);
    ctx.lineTo(x, 36 + len);
    ctx.stroke();

    if (y % 10 === 0) {
      ctx.fillStyle = ink;
      ctx.fillText(String(y), x, 16);
    }
  }
}

/* Jahr setzen – zentrale Funktion, aktualisiert alles */
function setYear(value) {
  state.yearFloat = clamp(value, YEAR_MIN, YEAR_MAX);

  drawScale();
  wheelEl.style.backgroundPosition = `0 0, ${-state.yearFloat * PPY}px 0`;

  const year = getYear();
  if (year !== state.shownYear) {
    state.shownYear = year;
    $('year').textContent = year;
    $('era').textContent = eraOf(year).name;
    tunerEl.setAttribute('aria-valuenow', year);
    updatePrices();
  }
}

function updatePrices() {
  document.querySelectorAll('.sticker').forEach((sticker) => {
    const text = stickerText(sticker.dataset.shop, sticker.dataset.id);
    if (sticker.textContent !== text) {
      sticker.textContent = text;
      sticker.classList.remove('pop');
      void sticker.offsetWidth;          // Animation neu starten
      sticker.classList.add('pop');
    }
  });
}

/* Animationsschleife: Schwung nach dem Loslassen, danach sanft auf ein ganzes Jahr einrasten */
let raf = null;
let drag = null;

function startLoop() {
  if (!raf) raf = requestAnimationFrame(loop);
}

function loop() {
  raf = null;
  if (drag) return;

  if (reduceMotion) {
    setYear(state.target ?? Math.round(state.yearFloat));
    state.target = null;
    state.velocity = 0;
    return;
  }

  if (Math.abs(state.velocity) > 0.015) {            // Schwung
    setYear(state.yearFloat + state.velocity);
    state.velocity *= 0.94;
    if (state.yearFloat <= YEAR_MIN || state.yearFloat >= YEAR_MAX) state.velocity = 0;
    state.target = null;
    startLoop();
    return;
  }
  state.velocity = 0;

  const target = state.target ?? Math.round(state.yearFloat);   // Einrasten
  const diff = target - state.yearFloat;
  if (Math.abs(diff) < 0.004) {
    setYear(target);
    state.target = null;
    return;
  }
  setYear(state.yearFloat + diff * 0.22);
  startLoop();
}

function glideBy(years) {
  const base = state.target ?? getYear();
  state.target = clamp(base + years, YEAR_MIN, YEAR_MAX);
  state.velocity = 0;
  startLoop();
}

function bindTunerEvents() {
  /* Ziehen: Skala folgt dem Finger. Kurzer Klick: zum angeklickten Jahr gleiten. */
  tunerEl.addEventListener('pointerdown', (e) => {
    tunerEl.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, t: performance.now(), moved: 0 };
    state.velocity = 0;
    state.target = null;
    document.body.classList.add('dragging');
    tunerEl.focus({ preventScroll: true });
  });

  tunerEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const now = performance.now();
    const dx = e.clientX - drag.x;
    const dYears = -dx / PPY;                         // Skala nach links ziehen = spätere Jahre
    const dt = Math.max(1, now - drag.t);
    drag.x = e.clientX;
    drag.t = now;
    drag.moved += Math.abs(dx);
    state.velocity = 0.6 * state.velocity + 0.4 * ((dYears / dt) * 16.7);
    setYear(state.yearFloat + dYears);
  });

  const release = (e, cancelled) => {
    if (!drag) return;
    const wasClick = !cancelled && drag.moved < 4;
    if (performance.now() - drag.t > 80) state.velocity = 0;   // vor dem Loslassen angehalten
    drag = null;
    document.body.classList.remove('dragging');

    if (wasClick) {
      const r = tunerEl.getBoundingClientRect();
      const offsetYears = (e.clientX - (r.left + r.width / 2)) / PPY;
      state.target = clamp(Math.round(state.yearFloat + offsetYears), YEAR_MIN, YEAR_MAX);
      state.velocity = 0;
    }
    startLoop();
  };
  tunerEl.addEventListener('pointerup', (e) => release(e, false));
  tunerEl.addEventListener('pointercancel', (e) => release(e, true));

  /* Mausrad / Trackpad: nach unten oder rechts = später */
  let wheelAcc = 0;
  tunerEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    const steps = Math.trunc(wheelAcc / 30);
    if (steps !== 0) {
      wheelAcc -= steps * 30;
      glideBy(steps * (e.shiftKey ? 10 : 1));
    }
  }, { passive: false });

  /* Tastatur */
  tunerEl.addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in keys) { e.preventDefault(); glideBy(keys[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); state.target = YEAR_MIN; state.velocity = 0; startLoop(); }
    if (e.key === 'End')  { e.preventDefault(); state.target = YEAR_MAX; state.velocity = 0; startLoop(); }
  });

  new ResizeObserver(resizeCanvas).observe(canvas);
}


/* ---------------------------------------------------------------------
   5. LADEN & HÄNDE
   --------------------------------------------------------------------- */

const shelfEl   = $('shelf');
const heldEl    = $('held');
const captionEl = $('heldCaption');

/* Bild + Preis-Sticker */
function createStage(shopId, product) {
  const stage = makeEl('div', 'stage');
  stage.append(makeImage(product.image, product.name, product.emoji));
  const sticker = makeEl('div', 'sticker');
  sticker.dataset.shop = shopId;
  sticker.dataset.id = product.id;
  sticker.textContent = stickerText(shopId, product.id);
  stage.append(sticker);
  return stage;
}

function renderShelf() {
  const shop = SHOPS[state.shopId];
  $('shopName').textContent = shop.name;

  shelfEl.replaceChildren(...shop.products.map((product) => {
    const btn = makeEl('button', 'product');
    btn.type = 'button';
    btn.dataset.id = product.id;

    const taken = state.held && state.held.shopId === state.shopId && state.held.id === product.id;
    if (taken) btn.classList.add('taken');
    btn.setAttribute('aria-label', `${product.name}, ${product.unit}${taken ? ' (in der Hand)' : ''}`);

    const label = makeEl('div', 'product-label');
    label.append(product.name);
    const unit = makeEl('small');
    unit.textContent = product.unit;
    label.append(unit);

    btn.append(createStage(state.shopId, product), label);
    return btn;
  }));
}

function renderHeld() {
  if (!state.held) {
    heldEl.replaceChildren();
    heldEl.setAttribute('aria-label', 'Rechte Hand ist leer');
    captionEl.textContent = 'Hand leer';
    return;
  }
  const product = findProduct(state.held.shopId, state.held.id);
  heldEl.replaceChildren(createStage(state.held.shopId, product));
  heldEl.setAttribute('aria-label', `${product.name} zurück ins Regal legen`);
  captionEl.textContent = `${product.name} · ${product.unit}`;
}

/* Kleine Flugbahn des Produkts vom Regal in die Hand */
function flyTo(fromEl, toEl, done) {
  if (reduceMotion || !fromEl.animate) { done(); return; }

  const from = fromEl.getBoundingClientRect();
  const to = toEl.getBoundingClientRect();
  const ghost = fromEl.cloneNode(true);
  ghost.style.cssText =
    `position:fixed;left:${from.left}px;top:${from.top}px;width:${from.width}px;` +
    `height:${from.height}px;margin:0;z-index:50;pointer-events:none;visibility:visible;`;
  document.body.append(ghost);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const anim = ghost.animate(
    [
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 40}px) scale(1.12)`, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(1)` },
    ],
    { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1)' }
  );
  anim.onfinish = () => { ghost.remove(); done(); };
}

function putBack() {
  if (!state.held || state.busy) return;
  state.held = null;
  renderHeld();
  renderShelf();
}

function takeProduct(id) {
  if (state.busy) return;

  if (state.held) {                     // Hand ist voll: erst zurücklegen
    state.held = null;
    renderHeld();
    renderShelf();
  }

  const btn = shelfEl.querySelector(`[data-id="${id}"]`);
  const stage = btn.querySelector('.stage');
  state.busy = true;

  const arrive = () => {
    state.held = { shopId: state.shopId, id };
    state.busy = false;
    renderShelf();
    renderHeld();
  };

  flyTo(stage, heldEl, arrive);
  stage.style.visibility = 'hidden';    // erst NACH dem Klonen ausblenden
}

function bindShopEvents() {
  shelfEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.product');
    if (!btn) return;
    if (btn.classList.contains('taken')) { putBack(); return; }
    takeProduct(btn.dataset.id);
  });
  heldEl.addEventListener('click', putBack);
}

/* Für später: einen anderen Laden betreten */
function enterShop(shopId) {
  if (!SHOPS[shopId]) return;
  state.shopId = shopId;
  renderShelf();
}
window.enterShop = enterShop;   // zum Ausprobieren in der Browser-Konsole


/* ---------------------------------------------------------------------
   6. START
   --------------------------------------------------------------------- */

function init() {
  $('handLeftArt').append(makeImage(HAND_LEFT_IMG, 'Linke Hand', '✋'));
  $('handRightArt').append(makeImage(HAND_RIGHT_IMG, 'Rechte Hand', '✋'));

  renderShelf();
  renderHeld();
  bindShopEvents();
  bindTunerEvents();
  resizeCanvas();
  setYear(START_YEAR);
}

init();
