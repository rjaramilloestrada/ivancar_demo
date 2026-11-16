#!/usr/bin/env node
/**
 * Recorrido E2E del pasajero (P1 → P8) con Playwright sobre `vite preview`.
 *
 *   npm run build && node scripts/e2e-passenger.mjs
 *   node scripts/e2e-passenger.mjs --only=full,central --shots=/tmp/shots
 *
 * Opciones:
 *   --base=URL      App ya servida (default http://localhost:4173/ivancar_demo/). Si no
 *                   responde, el script levanta `vite preview` y lo detiene al terminar.
 *   --shots=DIR     Carpeta de capturas (default ./e2e-shots, ignorada por git).
 *   --only=a,b      Escenarios a correr (default: todos). Ver SCENARIOS abajo.
 *
 * Falla (exit 1) ante cualquier error o warning de consola, error de página o respuesta
 * propia (localhost) ≥ 400. Cuenta toques hasta pedir (≤ 3) y mide P1 → P8 (< 60 s) con
 * los tiempos reales de la simulación. Los demás escenarios usan `?sim=N` para acelerar.
 * Requiere Playwright con Chromium (local o global: `npm i -g playwright`).
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/* ------------------------------------------------------------ Argumentos */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=') || true];
  }),
);
const BASE = String(args.base ?? 'http://localhost:4173/ivancar_demo/');
const SHOTS = path.resolve(String(args.shots ?? 'e2e-shots'));
const ONLY = args.only ? String(args.only).split(',') : null;
mkdirSync(SHOTS, { recursive: true });

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const root = execSync('npm root -g').toString().trim();
    return createRequire(path.join(root, 'noop.js'))('playwright');
  }
}
const { chromium } = await loadPlaywright();

/* ------------------------------------------------------- Servidor preview */
let server = null;
async function reachable(url) {
  try {
    const r = await fetch(url);
    return r.ok;
  } catch {
    return false;
  }
}
async function ensureServer() {
  if (await reachable(BASE)) return;
  const port = new URL(BASE).port || '4173';
  server = spawn('npx', ['vite', 'preview', '--port', port, '--strictPort'], { stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) {
    if (await reachable(BASE)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`vite preview no respondió en ${BASE} (¿corriste npm run build?)`);
}
function stopServer() {
  if (server?.pid) {
    try {
      process.kill(-server.pid);
    } catch {
      /* ya terminó */
    }
  }
}

/* -------------------------------------------------------------- Utilidades */
const results = [];
function check(name, pass, detail = '') {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  · ${detail}` : ''}`);
}
const IGNORED_CONSOLE = [/Service Worker registration blocked/];

function watch(page, tag, { allowThirdParty = [] } = {}) {
  const issues = [];
  page.on('console', (m) => {
    if (m.type() !== 'error' && m.type() !== 'warning') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((r) => r.test(text))) return;
    const url = m.location()?.url ?? '';
    // Fallos de red que el propio escenario provoca (p. ej. OSRM bloqueado) no cuentan.
    if (allowThirdParty.some((h) => text.includes(h) || url.includes(h))) return;
    if (/Failed to load resource/.test(text) && allowThirdParty.length && !url.startsWith('http://localhost')) return;
    issues.push(`[${m.type()}] ${text}`);
  });
  page.on('pageerror', (e) => issues.push(`[pageerror] ${e.message}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(new URL(BASE).origin)) issues.push(`[http ${r.status()}] ${r.url()}`);
  });
  return () => check(`[${tag}] sin errores de consola ni respuestas propias ≥ 400`, issues.length === 0, issues.slice(0, 5).join(' | '));
}

const stepIs = (page, step, timeout = 20_000) => page.waitForSelector(`main[data-step="${step}"]`, { timeout });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser, { width = 390, height = 844, reduced = false, geo = null, permissions = [] } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'block',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
    geolocation: geo ?? undefined,
    permissions,
  });
  const page = await ctx.newPage();
  return { ctx, page };
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** Espera a que el mapa tenga tiles (o se rinda) y la recogida tenga etiqueta. */
async function waitHome(page) {
  await stepIs(page, 'home');
  await page.waitForSelector('[data-testid=pickup-label]', { timeout: 15_000 });
  await page.waitForFunction(() => document.querySelector('[data-tile-status]')?.getAttribute('data-tile-status') !== 'loading', null, {
    timeout: 15_000,
  }).catch(() => {});
  await sleep(600);
}

async function hrefOf(page, testId) {
  return page.getAttribute(`[data-testid=${testId}]`, 'href');
}

/** Pide un taxi con el camino mínimo (destino sugerido → Pedir). Devuelve los toques. */
async function orderFast(page) {
  let taps = 0;
  await page.locator('[data-testid=suggested-place]').first().click();
  taps++;
  await stepIs(page, 'service');
  await page.waitForSelector('[data-testid=cta-request]:not([aria-busy])', { timeout: 8000 });
  await page.locator('[data-testid=cta-request]').click();
  taps++;
  await stepIs(page, 'searching');
  return taps;
}

/* ------------------------------------------------------------- Escenarios */
const SCENARIOS = {
  /** Recorrido completo con tiempos reales: toques, tiempo, hrefs y capturas por pantalla. */
  async full(browser) {
    const tag = 'full-390x844';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    const t0 = Date.now();
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitHome(page);
    await shot(page, `${tag}-p1-inicio`);

    const fallback = await hrefOf(page, 'fallback-whatsapp');
    check(`[${tag}] respaldo WhatsApp a wa.me/593980100100`, fallback?.startsWith('https://wa.me/593980100100'), fallback);
    check(`[${tag}] respaldo Llamar ahora a tel:0980100100`, (await hrefOf(page, 'fallback-call')) === 'tel:0980100100');
    check(`[${tag}] banner "Demo conceptual · IGNIS" visible`, await page.getByText('Demo conceptual · IGNIS').first().isVisible());

    // Toque 1: destino sugerido (servicio ya preseleccionado).
    let taps = 0;
    const dest = (await page.locator('[data-testid=suggested-place] span.truncate').first().textContent())?.trim();
    await page.locator('[data-testid=suggested-place]').first().click();
    taps++;
    await stepIs(page, 'service');
    await page.waitForSelector('[data-testid=cta-request]:not([aria-busy])', { timeout: 8000 });
    await sleep(700);
    const focus3 = await page.evaluate(() => document.activeElement?.textContent);
    check(`[${tag}] el foco pasa al título del nuevo paso`, focus3 === 'Elige tu servicio', focus3 ?? '');
    await shot(page, `${tag}-p3-servicio`);
    check(`[${tag}] "Taxi normal" preseleccionado`, (await page.getAttribute('[data-testid=service-taxi]', 'data-selected')) === 'true');
    check(`[${tag}] etiqueta "Tarifa referencial de demo" visible`, await page.locator('[data-testid=fare-notice]').isVisible());
    check(`[${tag}] 6 servicios con precio`, (await page.locator('[data-testid^=service-]').count()) === 6);
    check(`[${tag}] pago por defecto: efectivo`, (await page.textContent('[data-testid=options-row]'))?.includes('Efectivo'));

    // Toque 2: pedir.
    await page.locator('[data-testid=cta-request]').click();
    taps++;
    await stepIs(page, 'searching');
    const tOrder = Date.now();
    check(`[${tag}] toques hasta pedir ≤ 3`, taps <= 3, `${taps} toques`);
    await sleep(900);
    await shot(page, `${tag}-p5-buscando`);

    await stepIs(page, 'assigned', 12_000);
    const searchS = (Date.now() - tOrder) / 1000;
    check(`[${tag}] búsqueda entre 1 y 8 s`, searchS >= 1 && searchS <= 8, `${searchS.toFixed(1)} s`);
    await page.waitForSelector('[data-testid=eta]');
    await sleep(1500);
    await shot(page, `${tag}-p6-asignado`);

    const eta1 = await page.textContent('[data-testid=eta]');
    const driver = (await page.textContent('[data-testid=driver-name]'))?.trim();
    const plate = (await page.textContent('[data-testid=plate]'))?.trim();
    check(`[${tag}] Llamar → tel:0980100100`, (await hrefOf(page, 'call-driver')) === 'tel:0980100100');
    const share = await hrefOf(page, 'share-trip');
    const text = share?.startsWith('https://wa.me/?text=') ? decodeURIComponent(share.split('?text=')[1]) : '';
    check(
      `[${tag}] Compartir viaje: wa.me con conductor, placa y destino`,
      !!text && text.includes(driver) && text.includes(plate) && (!dest || text.includes(dest)),
      JSON.stringify(text.split('\n').slice(0, 3)),
    );
    await page.locator('[data-testid=chat-driver]').click();
    await sleep(400);
    check(`[${tag}] Chat abre el chat con el conductor`, await page.locator('dialog[open][data-testid=chat]').isVisible());
    await shot(page, `${tag}-p6-chat`);
    await page.keyboard.press('Escape');
    await sleep(2500);
    const eta2 = await page.textContent('[data-testid=eta]').catch(() => null);
    check(`[${tag}] ETA en vivo baja`, eta2 == null || parseInt(eta2) < parseInt(eta1) || parseInt(eta2) <= parseInt(eta1), `${eta1} → ${eta2 ?? 'llegando'}`);

    await page.waitForSelector('text=Tu IVANCAR llegó', { timeout: 15_000 });
    check(`[${tag}] aviso "Tu IVANCAR llegó"`, true);
    await sleep(300);
    await shot(page, `${tag}-p6-llego`);

    await stepIs(page, 'inTrip', 10_000);
    await sleep(2500);
    await shot(page, `${tag}-p7-en-viaje`);
    const loc = await hrefOf(page, 'share-location');
    const locText = loc ? decodeURIComponent(loc.split('?text=')[1] ?? '') : '';
    check(`[${tag}] Compartir ubicación por WhatsApp`, loc?.startsWith('https://wa.me/?text=') && locText.includes('maps.google.com/?q='), locText.split('\n')[0]);
    await page.locator('[data-testid=emergency]').click();
    await sleep(400);
    const sosText = await page.locator('dialog[open]').textContent();
    check(`[${tag}] Emergencia: diálogo dice que es simulado`, /simulaci/i.test(sosText ?? ''));
    await shot(page, `${tag}-p7-emergencia`);
    await page.keyboard.press('Escape');

    await stepIs(page, 'rating', 25_000);
    const totalS = (Date.now() - t0) / 1000;
    check(`[${tag}] P1 → P8 en menos de 60 s`, totalS < 60, `${totalS.toFixed(1)} s`);
    await sleep(500);
    await shot(page, `${tag}-p8-calificacion`);
    check(`[${tag}] resumen con tarifa referencial`, (await page.textContent('[data-testid=trip-summary]'))?.includes('Tarifa referencial de demo'));
    await page.locator('[data-testid=star-5]').click();
    // Propina: radios nativos ocultos (sr-only); se toca su etiqueta, como haría una persona.
    await page.locator('label', { has: page.getByRole('radio', { name: '$1,00' }) }).click();
    await page.locator('[data-testid=toggle-receipt]').click();
    await sleep(300);
    await page.locator('[data-testid=receipt]').scrollIntoViewIfNeeded();
    await shot(page, `${tag}-p8-recibo`);
    await page.locator('[data-testid=finish]').click();
    await stepIs(page, 'home');

    await page.locator('[data-testid=open-history]').click();
    await stepIs(page, 'history');
    await sleep(500);
    const first = await page.locator('[data-testid=history-list] li').first().textContent();
    check(`[${tag}] viaje terminado en el historial`, !!dest && first?.includes(dest) && first.includes(plate), first?.slice(0, 80));
    await shot(page, `${tag}-p9-mis-viajes`);

    const events = await page.evaluate(() => (window.__ivancarEvents ?? []).map((e) => e.event));
    check(
      `[${tag}] analítica: hitos registrados`,
      ['app_open', 'destination_selected', 'ride_requested', 'ride_assigned', 'driver_arrived', 'trip_started', 'trip_completed', 'rating_submitted'].every((e) =>
        events.includes(e),
      ),
      events.join(','),
    );
    const trackers = await page.evaluate(() => [...document.scripts].filter((s) => /googletagmanager|facebook/.test(s.src)).length);
    check(`[${tag}] sin IDs no se cargan Pixel ni GA4`, trackers === 0);
    done();
    await ctx.close();
    return { taps, totalS };
  },

  /** Destino por buscador (tildes), Elegir en el mapa y Pago y opciones. */
  async options(browser) {
    const tag = 'opciones';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    await page.goto(BASE + '#/?sim=5');
    await waitHome(page);
    await page.locator('[data-testid=cta-destination]').click();
    await stepIs(page, 'destination');
    await sleep(500);
    check(`[${tag}] foco en el buscador`, await page.evaluate(() => document.activeElement?.id === 'dest-search'));
    await shot(page, `${tag}-p2-destino`);
    await page.fill('#dest-search', 'MALECON');
    await sleep(300);
    check(`[${tag}] buscador tolera tildes y mayúsculas`, (await page.textContent('[data-testid=dest-results]'))?.includes('Malecón 2000'));
    await page.fill('#dest-search', 'zzzz');
    await sleep(300);
    check(`[${tag}] estado vacío diseñado`, await page.locator('[data-testid=dest-empty]').isVisible());
    await shot(page, `${tag}-p2-vacio`);
    await page.fill('#dest-search', '');
    await page.locator('[data-testid=pick-on-map]').click();
    await sleep(900);
    await shot(page, `${tag}-p2-mapa`);
    await page.waitForSelector('[data-testid=confirm-map-destination]:not([disabled])', { timeout: 8000 });
    await page.locator('[data-testid=confirm-map-destination]').click();
    await stepIs(page, 'service');
    // Como una persona: sube el panel para ver todos los servicios.
    await page.locator('section[aria-label="Pedido de taxi"] button[aria-controls]').click();
    await sleep(500);
    await page.locator('[data-testid=service-por_horas]').click();
    check(`[${tag}] servicio por horas muestra selector de horas`, await page.locator('[data-testid=hours-picker]').isVisible());
    await page.getByRole('button', { name: 'Más horas' }).click();
    await sleep(300);
    await shot(page, `${tag}-p3-por-horas`);
    await page.locator('[data-testid=service-encomiendas]').click();
    check(`[${tag}] encomiendas con nota`, await page.getByText('hasta 20 kg').first().isVisible());
    await page.locator('[data-testid=service-taxi]').click();
    await page.locator('[data-testid=options-row]').click();
    await stepIs(page, 'payment');
    await page.getByText('Vale corporativo').click();
    await page.locator('[data-testid=when-later]').click();
    await page.fill('textarea', 'Estoy en la garita principal');
    await sleep(400);
    await shot(page, `${tag}-p4-pago-opciones`);
    await page.locator('[data-testid=options-done]').click();
    await stepIs(page, 'service');
    const row = await page.textContent('[data-testid=options-row]');
    check(`[${tag}] fila de opciones refleja vale y programación`, row?.includes('Vale corporativo') && /Hoy|Mañana/.test(row ?? ''), row ?? '');
    check(`[${tag}] botón dice Programar`, (await page.textContent('[data-testid=cta-request]'))?.includes('Programar'));
    done();
    await ctx.close();
  },

  async 'cancel-search'(browser) {
    const tag = 'cancelar-busqueda';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    await page.goto(BASE + '#/?sim=2');
    await waitHome(page);
    await orderFast(page);
    await sleep(500);
    await page.locator('[data-testid=cancel-search]').click();
    await stepIs(page, 'home', 3000);
    await sleep(4000); // la autoasignación no debe dispararse después de cancelar
    check(`[${tag}] vuelve a inicio y no asigna`, (await page.getAttribute('main', 'data-step')) === 'home');
    await shot(page, `${tag}-inicio`);
    done();
    await ctx.close();
  },

  async 'cancel-assigned'(browser) {
    const tag = 'cancelar-asignado';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    await page.goto(BASE + '#/?sim=3');
    await waitHome(page);
    await orderFast(page);
    await stepIs(page, 'assigned');
    await page.locator('[data-testid=cancel-ride]').click();
    await sleep(400);
    await shot(page, `${tag}-confirmacion`);
    const focused = await page.evaluate(() => document.activeElement?.textContent);
    check(`[${tag}] confirmación enfoca la opción segura`, focused?.includes('seguir esperando'), focused ?? '');
    await page.locator('[data-testid=confirm-cancel]').click();
    await stepIs(page, 'home', 3000);
    check(`[${tag}] vuelve a inicio`, true);
    const ev = await page.evaluate(() => (window.__ivancarEvents ?? []).map((e) => e.event));
    check(`[${tag}] registra ride_cancelled`, ev.includes('ride_cancelled'));
    done();
    await ctx.close();
  },

  async geo(browser) {
    // Concedida: Kennedy, Guayaquil.
    {
      const tag = 'geo-concedida';
      const { ctx, page } = await newPage(browser, { geo: { latitude: -2.1668, longitude: -79.8966 }, permissions: ['geolocation'] });
      const done = watch(page, tag);
      await page.goto(BASE);
      await waitHome(page);
      await sleep(2000);
      const label = await page.textContent('[data-testid=pickup-label]');
      const note = await page.getByText('Ubicación aproximada').count();
      check(`[${tag}] el pin va a la ubicación real`, !/Parque Histórico/.test(label ?? '') && note === 0, label ?? '');
      await shot(page, `${tag}-p1`);
      done();
      await ctx.close();
    }
    // Denegada.
    {
      const tag = 'geo-denegada';
      const { ctx, page } = await newPage(browser, { permissions: [] });
      const done = watch(page, tag);
      await page.goto(BASE);
      await waitHome(page);
      await sleep(800);
      check(`[${tag}] default Samborondón con aviso discreto`, (await page.getByText('Ubicación aproximada').count()) === 1);
      await shot(page, `${tag}-p1`);
      done();
      await ctx.close();
    }
  },

  /** OSRM bloqueado: ruta estimada, aviso, y el pedido termina igual. */
  async 'osrm-blocked'(browser) {
    const tag = 'osrm-bloqueado';
    const { ctx, page } = await newPage(browser);
    await ctx.route('**/router.project-osrm.org/**', (r) => r.abort());
    const done = watch(page, tag, { allowThirdParty: ['router.project-osrm.org'] });
    await page.goto(BASE + '#/?sim=5');
    await waitHome(page);
    await page.locator('[data-testid=suggested-place]').first().click();
    await page.waitForSelector('[data-testid=route-summary]');
    check(`[${tag}] ruta estimada`, (await page.getAttribute('[data-testid=route-summary]', 'data-route-source')) === 'fallback');
    check(`[${tag}] aviso de ruta aproximada`, await page.getByText('Ruta aproximada').isVisible());
    await shot(page, `${tag}-p3`);
    await page.locator('[data-testid=cta-request]').click();
    await stepIs(page, 'assigned', 10_000);
    await stepIs(page, 'rating', 20_000);
    check(`[${tag}] el pedido termina igual`, true);
    done();
    await ctx.close();
  },

  async reduced(browser) {
    const tag = 'reduced-motion';
    const { ctx, page } = await newPage(browser, { reduced: true });
    const done = watch(page, tag);
    const t0 = Date.now();
    await page.goto(BASE + '#/?sim=3');
    await waitHome(page);
    await orderFast(page);
    await stepIs(page, 'assigned', 10_000);
    await sleep(800);
    await shot(page, `${tag}-p6`);
    await stepIs(page, 'inTrip', 15_000);
    await sleep(800);
    await shot(page, `${tag}-p7`);
    await stepIs(page, 'rating', 15_000);
    check(`[${tag}] flujo completo con reduce`, true, `${((Date.now() - t0) / 1000).toFixed(1)} s con sim=3`);
    done();
    await ctx.close();
  },

  async reload(browser) {
    const tag = 'recarga';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    await page.goto(BASE + '#/?sim=2');
    await waitHome(page);
    await orderFast(page);
    await stepIs(page, 'inTrip', 20_000);
    await sleep(1500);
    const before = await page.textContent('[data-testid=plate]');
    await page.reload();
    await stepIs(page, 'inTrip', 5000);
    await page.waitForSelector('.iv-car--active', { timeout: 5000 });
    const after = await page.textContent('[data-testid=plate]');
    check(`[${tag}] retoma el viaje con la misma unidad`, before === after, `${before}`);
    await shot(page, `${tag}-p7-tras-recargar`);
    await stepIs(page, 'rating', 15_000);
    check(`[${tag}] y lo termina`, true);
    done();
    await ctx.close();
  },

  /** Con una segunda página haciendo de central (#/map-lab?role=central). */
  async central(browser) {
    const tag = 'con-central';
    const { ctx, page } = await newPage(browser);
    const central = await ctx.newPage();
    const done = watch(page, tag);
    await central.goto(BASE + '#/map-lab?role=central');
    await page.goto(BASE + '#/?sim=2');
    await waitHome(page);
    await page.waitForSelector('main[data-central=online]', { timeout: 6000 });
    check(`[${tag}] el pasajero detecta la central`, true);
    await orderFast(page);
    await stepIs(page, 'assigned', 10_000);
    const eyebrow = await page.getByText('Asignada por la Central IVANCAR').count();
    check(`[${tag}] asigna la central`, eyebrow > 0);
    const last = await central.textContent('[data-testid=channel-last]');
    check(`[${tag}] la central recibió mensajes del pasajero`, /ride:(created|status|assigned)/.test(last ?? ''), last ?? '');
    await shot(page, `${tag}-p6`);

    // Reasignación enviada por la central (mensaje crudo del protocolo).
    const state = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ivancar-ride')).state);
    await central.evaluate(({ ride, unit }) => {
      const other = { ...unit, id: 'drv-02', display_name: 'Luis V.', full_name: 'Luis Vera', initials: 'LV', vehicle_id: 'veh-02', vehicle: { ...unit.vehicle, id: 'veh-02', plate: 'GSD-1736', model: 'Rio', make: 'Kia' } };
      const bc = new BroadcastChannel('ivancar-demo');
      bc.postMessage({
        v: 1,
        id: 'test-' + Date.now(),
        tab: 'test-central',
        role: 'central',
        sent_at: new Date().toISOString(),
        msg: { type: 'ride:reassigned', ride_id: ride.id, unit: other, previous_driver_id: unit.id, eta_s: 300, reason: 'Prueba', at: new Date().toISOString() },
      });
      bc.close();
    }, { ride: state.ride, unit: state.unit });
    await page.waitForSelector('text=Cambiamos tu unidad', { timeout: 5000 });
    const plate = await page.textContent('[data-testid=plate]');
    check(`[${tag}] reasignación cambia la unidad con aviso`, plate === 'GSD-1736', plate ?? '');
    await shot(page, `${tag}-p6-reasignada`);
    await stepIs(page, 'rating', 25_000);
    check(`[${tag}] termina el viaje`, true);
    done();
    await ctx.close();
  },

  /** Sin central: autoasignación (también lo cubre `full`). */
  async 'no-central'(browser) {
    const tag = 'sin-central';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    await page.goto(BASE + '#/?sim=2');
    await waitHome(page);
    check(`[${tag}] sin central detectada`, (await page.getAttribute('main', 'data-central')) === 'offline');
    await orderFast(page);
    await stepIs(page, 'assigned', 6000);
    check(`[${tag}] se autoasigna`, (await page.getByText('Unidad asignada').count()) > 0);
    done();
    await ctx.close();
  },

  /** P9 · Mis viajes: estado vacío, ejemplos con mini mapa, detalle con recibo y "Repetir viaje". */
  async history(browser) {
    const tag = 'mis-viajes';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    await page.goto(BASE + '#/?sim=4');
    await waitHome(page);
    await page.locator('[data-testid=open-history]').click();
    await stepIs(page, 'history');
    await sleep(600);
    check(`[${tag}] estado vacío diseñado sin viajes de la sesión`, await page.locator('[data-testid=history-empty]').isVisible());
    const n = await page.locator('[data-testid=history-examples] li').count();
    const maps = await page.locator('[data-testid=history-examples] svg[data-testid=mini-map] path').count();
    check(`[${tag}] viajes de ejemplo con mini mapa SVG (sin Leaflet)`, n >= 6 && maps >= n * 2 && (await page.locator('[data-testid=history-examples] .leaflet-container').count()) === 0, `${n} viajes`);
    const first = await page.locator('[data-testid=history-examples] li').first().textContent();
    check(`[${tag}] tarjeta con fecha relativa, total, tarifa referencial, conductor y placa`, /(Hoy|Ayer|Hace[^·]*|\d+ \w+) ·/.test(first ?? '') && /\$\d/.test(first ?? '') && /Tarifa referencial de demo/.test(first ?? '') && /GS[A-Z]-\d{4}/.test(first ?? ''), first?.slice(0, 90));
    await shot(page, `${tag}-p9-lista-vacia`);
    const dest = await page.locator('[data-testid=history-examples] li').nth(1).locator('[data-testid=trip-dropoff]').textContent();
    await page.locator('[data-testid=history-examples] li').nth(1).locator('button').click();
    await page.waitForSelector('[data-testid=trip-detail]');
    await sleep(500);
    check(`[${tag}] detalle con recibo simulado`, /Recibo simulado del demo/.test((await page.textContent('[data-testid=history-receipt]')) ?? ''));
    const focus = await page.evaluate(() => document.activeElement?.tagName);
    check(`[${tag}] el foco pasa al título del detalle`, focus === 'H2', focus ?? '');
    await shot(page, `${tag}-p9-detalle`);
    await page.locator('[data-testid=repeat-trip]').click();
    await stepIs(page, 'service');
    await page.waitForSelector('[data-testid=cta-request]:not([aria-busy])', { timeout: 8000 });
    await sleep(700);
    const st = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ivancar-ride')).state);
    check(`[${tag}] "Repetir viaje" precarga el destino y lleva a elegir servicio`, st.destination?.label === dest?.trim() && st.step === 'service', `${dest?.trim()} → ${st.destination?.label}`);
    await shot(page, `${tag}-p3-repetir`);
    // Pedir el repetido y comprobar que entra a "Tus viajes".
    await page.locator('[data-testid=cta-request]').click();
    await stepIs(page, 'rating', 25_000);
    await page.locator('[data-testid=finish]').click();
    await stepIs(page, 'home');
    await page.locator('[data-testid=open-history]').click();
    await stepIs(page, 'history');
    await sleep(500);
    check(`[${tag}] el viaje nuevo aparece primero en "Tus viajes"`, (await page.locator('[data-testid=history-list] li').first().textContent())?.includes(dest?.trim() ?? '###'));
    check(`[${tag}] ya no muestra el estado vacío`, (await page.locator('[data-testid=history-empty]').count()) === 0);
    await shot(page, `${tag}-p9-con-viaje`);
    done();
    await ctx.close();
  },

  /** Chat simulado: saludo, escribiendo, respuestas rápidas, hora, Escape, no leídos y limpieza. */
  async chat(browser) {
    const tag = 'chat';
    const { ctx, page } = await newPage(browser);
    const done = watch(page, tag);
    await page.goto(BASE + '#/?sim=1');
    await waitHome(page);
    await orderFast(page);
    await stepIs(page, 'assigned', 10_000);
    await sleep(600);
    await page.locator('[data-testid=chat-driver]').click();
    await page.waitForSelector('dialog[open][data-testid=chat]');
    await sleep(200);
    check(`[${tag}] foco en el campo de texto al abrir`, await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'chat-input'));
    check(`[${tag}] conversación como role=log`, (await page.locator('[role=log][aria-live=polite]').count()) === 1);
    check(`[${tag}] aviso de chat de demostración`, await page.getByText('Chat de demostración').isVisible());
    await page.waitForSelector('[data-testid=chat-typing]', { timeout: 3000 }).catch(() => {});
    check(`[${tag}] indicador "escribiendo"`, (await page.locator('[data-testid=chat-typing]').count()) + (await page.locator('[data-from=driver]').count()) > 0);
    await page.waitForSelector('[data-from=driver]', { timeout: 5000 });
    const greet = await page.locator('[data-from=driver]').first().textContent();
    check(`[${tag}] saludo del conductor con contexto ("ya voy")`, /Ya voy en camino/.test(greet ?? ''), greet ?? '');
    check(`[${tag}] hora en cada mensaje`, /\d{2}:\d{2}/.test(greet ?? ''));
    await page.getByRole('button', { name: '¿Cuánto falta?' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-from=driver]').length >= 2, null, { timeout: 5000 });
    const r1 = await page.locator('[data-from=driver]').nth(1).textContent();
    check(`[${tag}] "¿Cuánto falta?" responde con el tiempo`, /min|llegar|afuera/.test(r1 ?? ''), r1 ?? '');
    await page.fill('[data-testid=chat-input]', 'Hola, una pregunta');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('[data-from=driver]').length >= 3, null, { timeout: 5000 });
    const r2 = await page.locator('[data-from=driver]').nth(2).textContent();
    check(`[${tag}] pregunta "dónde estás" con contexto`, /Me esperas en la entrada principal/.test(r2 ?? ''), r2 ?? '');
    await shot(page, `${tag}-p6-conversacion`);
    await page.keyboard.press('Escape');
    await sleep(300);
    check(`[${tag}] Escape cierra el chat`, (await page.locator('dialog[open][data-testid=chat]').count()) === 0);
    // Al llegar, "Ya estoy afuera" con el chat cerrado → no leídos.
    await page.waitForSelector('[data-testid=chat-unread]', { timeout: 20_000 });
    check(`[${tag}] "estoy afuera" al llegar suma no leídos`, (await page.textContent('[data-testid=chat-unread]')) === '1');
    await page.locator('[data-testid=chat-driver]').click();
    await sleep(400);
    const last = await page.locator('[data-from=driver]').last().textContent();
    check(`[${tag}] mensaje "Ya estoy afuera" con placa`, /Ya estoy afuera/.test(last ?? '') && /GS[A-Z]-\d{4}/.test(last ?? ''), last ?? '');
    await shot(page, `${tag}-p6-afuera`);
    await page.keyboard.press('Escape');
    await stepIs(page, 'rating', 40_000);
    const left = await page.evaluate(() => JSON.parse(sessionStorage.getItem('ivancar-chat') ?? '{"state":{"messages":[]}}').state.messages.length);
    check(`[${tag}] el historial del chat se limpia al terminar el viaje`, left === 0, `${left} mensajes`);
    done();
    await ctx.close();
  },

  /** Capturas en otros tamaños de teléfono. */
  async sizes(browser) {
    for (const [w, h] of [
      [360, 740],
      [390, 844],
      [430, 932],
    ]) {
      const tag = `${w}x${h}`;
      const { ctx, page } = await newPage(browser, { width: w, height: h });
      const done = watch(page, tag);
      await page.goto(BASE + '#/?sim=3');
      await waitHome(page);
      const box = await page.locator('[data-testid=suggested-place]').first().boundingBox();
      const footerTop = await page.evaluate(() => document.querySelector('[data-testid=cta-destination]')?.getBoundingClientRect().top ?? 0);
      check(`[${tag}] primer destino sugerido visible sin desplazar`, !!box && box.y + box.height / 2 < footerTop - 4, `y=${box?.y.toFixed(0)} footer=${footerTop.toFixed(0)}`);
      await shot(page, `${tag}-p1`);
      await page.locator('[data-testid=suggested-place]').first().click();
      await page.waitForSelector('[data-testid=cta-request]:not([aria-busy])', { timeout: 8000 });
      await sleep(700);
      await shot(page, `${tag}-p3`);
      await page.locator('[data-testid=cta-request]').click();
      await stepIs(page, 'assigned', 10_000);
      await sleep(800);
      await shot(page, `${tag}-p6`);
      // Unidad asignada: Llamar / Chat / Cancelar completos sobre el pie fijo, sin arrastrar.
      const acts = await page.evaluate(() => {
        const foot = document.querySelector('[data-testid=share-trip]')?.parentElement?.closest('.absolute')?.getBoundingClientRect().top ?? 0;
        return ['call-driver', 'chat-driver', 'cancel-ride'].map((id) => document.querySelector(`[data-testid=${id}]`)?.getBoundingClientRect().bottom ?? 1e9).map((b) => [Math.round(b), Math.round(foot)]);
      });
      check(`[${tag}] Llamar / Chat / Cancelar visibles y tocables sin arrastrar`, acts.every(([b, f]) => b <= f), JSON.stringify(acts));
      await stepIs(page, 'inTrip', 15_000);
      await sleep(1500); // deja terminar el encuadre del mapa
      await shot(page, `${tag}-p7`);
      await stepIs(page, 'rating', 15_000);
      await sleep(500);
      await shot(page, `${tag}-p8`);
      done();
      await ctx.close();
    }
  },
};

/* ------------------------------------------------------------------ Main */
let browser;
try {
  await ensureServer();
  browser = await chromium.launch();
  for (const [name, fn] of Object.entries(SCENARIOS)) {
    if (ONLY && !ONLY.includes(name)) continue;
    console.log(`\n— ${name}`);
    try {
      await fn(browser);
    } catch (e) {
      check(`[${name}] terminó sin excepción`, false, e.message.split('\n')[0]);
    }
  }
} finally {
  await browser?.close();
  stopServer();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} comprobaciones OK · capturas en ${SHOTS}`);
process.exit(failed.length ? 1 : 0);
