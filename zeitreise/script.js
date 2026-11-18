'use strict';

/* =====================================================================
   WAS KOSTETE DAS DAMALS? – Grundgerüst

   Aufbau dieser Datei:
     1. Konfiguration & Daten   (hier pflegst du Läden, Produkte, Preise)
     2. Zustand
     3. Hilfsfunktionen
     4. Zeitrad
     5. Zeitstrahl
     6. Laden & Hände
     7. Start

   Keine externen Bibliotheken, keine CDN-Links – läuft auch offline,
   z. B. direkt aus einem Ordner oder auf einem Ausstellungsrechner.
   ===================================================================== */


/* ---------------------------------------------------------------------
   1. KONFIGURATION & DATEN
   --------------------------------------------------------------------- */

const YEAR_MIN   = 1900;
const YEAR_MAX   = 2025;
const START_YEAR = 1960;
const SWEEP      = 270;   // Drehbereich des Rades in Grad (-135° … +135°)

/* Währungsepochen (Blick auf Deutschland, ohne DDR).
   Preise werden nur INNERHALB einer Epoche interpoliert, damit z. B. der
   Sprung von DM zu Euro nicht verrechnet wird. */
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

   Neuen Laden hinzufügen (z. B. 'kino' oder 'technik'): einfach einen
   weiteren Eintrag in SHOPS anlegen und später mit enterShop('kino')
   betreten. */
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
  yearFloat: START_YEAR,   // exakte Radstellung (kann zwischen Jahren liegen)
  shownYear: null,         // zuletzt dargestelltes ganzes Jahr
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
   4. ZEITRAD
   --------------------------------------------------------------------- */

const dialSvg = $('dial');
const CX = 200, CY = 200;
const SVG_NS = 'http://www.w3.org/2000/svg';
let knobEl, yearTextEl, eraTextEl;

function svgEl(tag, attrs, parent) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
}

/* Winkel in Grad, 0° = oben, im Uhrzeigersinn */
function polar(angleDeg, r) {
  const a = (angleDeg * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
}

const yearToAngle = (year) => -SWEEP / 2 + ((year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * SWEEP;

function buildDial() {
  /* Farbverlauf für den Drehknopf */
  const defs = svgEl('defs', {}, dialSvg);
  const grad = svgEl('radialGradient', { id: 'knobGrad', cx: '35%', cy: '30%', r: '80%' }, defs);
  svgEl('stop', { offset: '0%',   'stop-color': '#ecd08e' }, grad);
  svgEl('stop', { offset: '60%',  'stop-color': '#b8913f' }, grad);
  svgEl('stop', { offset: '100%', 'stop-color': '#6f5120' }, grad);

  /* Zifferblatt */
  svgEl('circle', { cx: CX, cy: CY, r: 198, fill: '#14110f', stroke: '#6f5120', 'stroke-width': 3 }, dialSvg);

  /* Skala: Striche für jedes Jahr, längere für 5er, 10er und 25er */
  for (let y = YEAR_MIN; y <= YEAR_MAX; y++) {
    const a = yearToAngle(y);
    let len = 6, width = 1, color = '#7d7467';
    if (y % 5 === 0)  { len = 10; color = '#b3a994'; }
    if (y % 10 === 0) { len = 16; width = 1.5; color = '#e0d6bf'; }
    if (y % 25 === 0) { len = 22; width = 2.5; color = '#c9a35a'; }
    const [x1, y1] = polar(a, 192);
    const [x2, y2] = polar(a, 192 - len);
    svgEl('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': width, 'stroke-linecap': 'round' }, dialSvg);

    if (y % 25 === 0) {
      const [tx, ty] = polar(a, 152);
      const label = svgEl('text', {
        x: tx, y: ty, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        fill: '#f4ecd8', 'font-size': 15, 'font-family': 'Georgia, serif',
      }, dialSvg);
      label.textContent = y;
    }
  }

  /* Drehknopf (rotiert) */
  knobEl = svgEl('g', { class: 'knob' }, dialSvg);
  svgEl('circle', { cx: CX, cy: CY, r: 112, fill: 'url(#knobGrad)', stroke: '#4a3615', 'stroke-width': 3 }, knobEl);

  for (let i = 0; i < 48; i++) {               // Rändelung am Rand
    const [x1, y1] = polar(i * 7.5, 100);
    const [x2, y2] = polar(i * 7.5, 111);
    svgEl('line', { x1, y1, x2, y2, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 2 }, knobEl);
  }

  const [px1, py1] = polar(0, 68);              // Markierungsstrich
  const [px2, py2] = polar(0, 100);
  svgEl('line', { x1: px1, y1: py1, x2: px2, y2: py2, stroke: '#2b2118', 'stroke-width': 5, 'stroke-linecap': 'round' }, knobEl);

  svgEl('polygon', {                            // Zeiger zur Skala hin
    points: `${CX},${CY - 143} ${CX - 6},${CY - 124} ${CX + 6},${CY - 124}`,
    fill: '#c9a35a', stroke: '#4a3615', 'stroke-width': 1,
  }, knobEl);

  /* Mittelkappe mit Jahreszahl (rotiert nicht) */
  svgEl('circle', { cx: CX, cy: CY, r: 64, fill: '#1d1b19', stroke: '#c9a35a', 'stroke-width': 2 }, dialSvg);
  yearTextEl = svgEl('text', {
    x: CX, y: CY, 'text-anchor': 'middle', 'dominant-baseline': 'central',
    fill: '#f4ecd8', 'font-size': 44, 'font-weight': 700, 'font-family': 'Georgia, serif',
  }, dialSvg);

  /* Währungsname unten in der Lücke der Skala */
  eraTextEl = svgEl('text', {
    x: CX, y: 352, 'text-anchor': 'middle',
    fill: '#c9a35a', 'font-size': 15, 'font-family': 'system-ui, sans-serif',
  }, dialSvg);

  bindDialEvents();
}

function pointerInfo(e) {
  const r = dialSvg.getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  return { angle: (Math.atan2(dx, -dy) * 180) / Math.PI, dist: Math.hypot(dx, dy), size: r.width };
}

function bindDialEvents() {
  let drag = null;

  dialSvg.addEventListener('pointerdown', (e) => {
    const info = pointerInfo(e);
    dialSvg.setPointerCapture(e.pointerId);
    drag = { last: info.angle };
    document.body.classList.add('dragging');
    dialSvg.focus({ preventScroll: true });
  });

  dialSvg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const info = pointerInfo(e);
    if (info.dist < info.size * 0.08) return;   // zu nah an der Mitte: Winkel instabil
    let delta = info.angle - drag.last;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    drag.last = info.angle;
    setYear(state.yearFloat + (delta / SWEEP) * (YEAR_MAX - YEAR_MIN));
  });

  const endDrag = () => {
    if (!drag) return;
    drag = null;
    document.body.classList.remove('dragging');
    setYear(Math.round(state.yearFloat));       // auf ganzes Jahr einrasten
  };
  dialSvg.addEventListener('pointerup', endDrag);
  dialSvg.addEventListener('pointercancel', endDrag);

  /* Mausrad: nach unten = später */
  let wheelAcc = 0;
  dialSvg.addEventListener('wheel', (e) => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    const steps = Math.trunc(wheelAcc / 40);
    if (steps !== 0) {
      wheelAcc -= steps * 40;
      setYear(getYear() + steps * (e.shiftKey ? 10 : 1));
    }
  }, { passive: false });

  /* Tastatur */
  dialSvg.addEventListener('keydown', (e) => {
    const keys = {
      ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10,
    };
    if (e.key in keys) { e.preventDefault(); setYear(getYear() + keys[e.key]); }
    if (e.key === 'Home') { e.preventDefault(); setYear(YEAR_MIN); }
    if (e.key === 'End')  { e.preventDefault(); setYear(YEAR_MAX); }
  });
}


/* ---------------------------------------------------------------------
   5. ZEITSTRAHL
   --------------------------------------------------------------------- */

const trackEl  = $('track');
const markerEl = $('marker');

function buildTimeline() {
  const span = YEAR_MAX - YEAR_MIN;

  ERAS.forEach((era) => {
    const band = makeEl('div', 'band');
    band.style.flex = `${era.to - era.from + 1} 0 0`;
    const long = makeEl('span', 'long');  long.textContent = era.name;
    const short = makeEl('span', 'short'); short.textContent = era.symbol;
    band.append(long, short);
    $('bands').append(band);
  });

  for (let y = YEAR_MIN; y <= YEAR_MAX; y += 25) {
    const tick = makeEl('span', 'tick');
    tick.style.left = `${((y - YEAR_MIN) / span) * 100}%`;
    tick.textContent = y;
    $('ticks').append(tick);
  }

  const yearFromPointer = (e) => {
    const r = trackEl.getBoundingClientRect();
    const t = clamp((e.clientX - r.left) / r.width, 0, 1);
    return Math.round(YEAR_MIN + t * span);
  };

  let dragging = false;
  trackEl.addEventListener('pointerdown', (e) => {
    trackEl.setPointerCapture(e.pointerId);
    dragging = true;
    setYear(yearFromPointer(e));
  });
  trackEl.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    document.body.classList.add('dragging');
    setYear(yearFromPointer(e));
  });
  const end = () => { dragging = false; document.body.classList.remove('dragging'); };
  trackEl.addEventListener('pointerup', end);
  trackEl.addEventListener('pointercancel', end);
}


/* ---------------------------------------------------------------------
   JAHR SETZEN – zentrale Funktion, aktualisiert alles
   --------------------------------------------------------------------- */

function setYear(value) {
  state.yearFloat = clamp(value, YEAR_MIN, YEAR_MAX);

  /* Rad und Zeitstrahl bewegen sich fließend mit */
  knobEl.style.transform = `rotate(${yearToAngle(state.yearFloat)}deg)`;
  markerEl.style.left = `${((state.yearFloat - YEAR_MIN) / (YEAR_MAX - YEAR_MIN)) * 100}%`;

  /* Texte und Preise nur bei Wechsel des ganzen Jahres */
  const year = getYear();
  if (year !== state.shownYear) {
    state.shownYear = year;
    yearTextEl.textContent = year;
    eraTextEl.textContent = eraOf(year).name;
    dialSvg.setAttribute('aria-valuenow', year);
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


/* ---------------------------------------------------------------------
   6. LADEN & HÄNDE
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
    captionEl.textContent = 'Die Hand ist leer – nimm dir etwas aus dem Regal.';
    return;
  }
  const product = findProduct(state.held.shopId, state.held.id);
  heldEl.replaceChildren(createStage(state.held.shopId, product));
  heldEl.setAttribute('aria-label', `${product.name} zurück ins Regal legen`);
  captionEl.textContent = `In der Hand: ${product.name} (${product.unit}) – anklicken zum Zurücklegen`;
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
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 40}px) scale(1.15)`, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(1)` },
    ],
    { duration: 450, easing: 'cubic-bezier(.3,.7,.3,1)' }
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
   7. START
   --------------------------------------------------------------------- */

function init() {
  $('handLeftArt').append(makeImage(HAND_LEFT_IMG, 'Linke Hand', '✋'));
  $('handRightArt').append(makeImage(HAND_RIGHT_IMG, 'Rechte Hand', '✋'));

  buildDial();
  buildTimeline();
  renderShelf();
  renderHeld();
  bindShopEvents();
  setYear(START_YEAR);
}

init();
