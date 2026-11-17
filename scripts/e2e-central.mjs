#!/usr/bin/env node
/**
 * E2E de la central de despacho con Playwright sobre `vite preview`: pasajero (390×844) y
 * central (1440×900) en dos páginas del MISMO contexto (comparten BroadcastChannel), más
 * la vista `#/demo` (iframes) y `reducedMotion: 'reduce'`.
 *
 *   npm run build && node scripts/e2e-central.mjs
 *   node scripts/e2e-central.mjs --only=flow,alert --shots=/tmp/shots
 *
 * Opciones: --base=URL (default http://localhost:4173/ivancar_demo/; si no responde, levanta
 * `vite preview` y lo detiene al terminar), --shots=DIR (default ./e2e-shots), --only=a,b.
 *
 * Falla (exit 1) ante errores o warnings de consola, errores de página o respuestas propias
 * (localhost) ≥ 400. Usa `?sim=2` (tiempos a la mitad) salvo donde se indica.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

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
    return (await fetch(url)).ok;
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
// El aviso "GPU stall due to ReadPixels" lo emite el driver por software de Chromium headless
// (SwiftShader) ante CUALQUIER lienzo WebGL al componer el cuadro; no viene del código de la
// app (se reproduce con una página que solo limpia un canvas WebGL) y no existe con GPU real.
const IGNORED_CONSOLE = [/Service Worker registration blocked/, /^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, [A-Z_]+, High\): GPU stall due to ReadPixels/];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Junta errores de consola, de página y respuestas propias ≥ 400 de varias páginas. */
function watch(pages, tag) {
  const issues = [];
  for (const [name, page] of pages) {
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      if (IGNORED_CONSOLE.some((r) => r.test(m.text()))) return;
      issues.push(`[${name} ${m.type()}] ${m.text()}`);
    });
    page.on('pageerror', (e) => issues.push(`[${name} pageerror] ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().startsWith(new URL(BASE).origin)) issues.push(`[${name} http ${r.status()}] ${r.url()}`);
    });
  }
  return () => check(`[${tag}] sin errores de consola ni respuestas propias ≥ 400`, issues.length === 0, issues.slice(0, 5).join(' | '));
}

async function newContext(browser, { reduced = false } = {}) {
  return browser.newContext({
    serviceWorkers: 'block',
    reducedMotion: reduced ? 'reduce' : 'no-preference',
    locale: 'es-EC',
    timezoneId: 'America/Guayaquil',
  });
}

/** Pasajero (390×844, táctil) y central (1440×900) en el mismo contexto. */
async function pair(browser, { reduced = false, sim = 2, centralSize = [1440, 900] } = {}) {
  const ctx = await newContext(browser, { reduced });
  const central = await ctx.newPage();
  await central.setViewportSize({ width: centralSize[0], height: centralSize[1] });
  const passenger = await ctx.newPage();
  await passenger.setViewportSize({ width: 390, height: 844 });
  await central.goto(`${BASE}#/central?sim=${sim}`);
  await central.waitForSelector('[data-testid=central]');
  await central.waitForSelector('[data-order-card]', { timeout: 8000 });
  await passenger.goto(`${BASE}#/?sim=${sim}`);
  return { ctx, central, passenger };
}

const stepIs = (page, step, timeout = 20_000) => page.waitForSelector(`main[data-step="${step}"]`, { timeout });

async function waitHome(page) {
  await stepIs(page, 'home');
  await page.waitForSelector('[data-testid=pickup-label]', { timeout: 15_000 });
  await sleep(500);
}

/** Pide un taxi con el camino mínimo y devuelve el id del pedido. */
async function order(page) {
  await page.locator('[data-testid=suggested-place]').first().click();
  await stepIs(page, 'service');
  await page.waitForSelector('[data-testid=cta-request]:not([aria-busy])', { timeout: 8000 });
  await page.locator('[data-testid=cta-request]').click();
  await stepIs(page, 'searching');
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('ivancar-ride')).state.ride.id);
}

const cardSel = (id) => `[data-order-card][data-order-id="${id}"]`;
const cardStatus = (page, id) => page.getAttribute(cardSel(id), 'data-status').catch(() => null);
const cardPlate = (page, id) => page.textContent(`${cardSel(id)} [data-testid=order-plate]`).catch(() => null);
const passengerPlate = (page) => page.textContent('[data-testid=plate]').then((t) => t?.trim() ?? null).catch(() => null);

async function waitStatus(page, id, statuses, timeout = 15_000) {
  const want = [].concat(statuses);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (want.includes(await cardStatus(page, id))) return true;
    await sleep(150);
  }
  return false;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

async function cardIds(page) {
  return page.$$eval('[data-order-card]', (els) => els.map((e) => e.getAttribute('data-order-id')));
}

/** rAF durante `ms` y métricas del hilo principal por CDP. */
async function measureFrames(page, ctx, ms) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const m0 = await get();
  const r = await page.evaluate(
    (dur) =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        const t0 = last;
        const loop = (t) => {
          gaps.push(t - last);
          last = t;
          if (t - t0 < dur) requestAnimationFrame(loop);
          else {
            gaps.shift();
            const s = [...gaps].sort((a, b) => a - b);
            resolve({ fps: gaps.length / ((t - t0) / 1000), p95: s[Math.floor(s.length * 0.95)], over50: gaps.filter((g) => g > 50).length, secs: (t - t0) / 1000 });
          }
        };
        requestAnimationFrame(loop);
      }),
    ms,
  );
  const m1 = await get();
  await cdp.detach();
  return { ...r, scriptPct: ((m1.ScriptDuration - m0.ScriptDuration) / r.secs) * 100, taskPct: ((m1.TaskDuration - m0.TaskDuration) / r.secs) * 100 };
}

/* ------------------------------------------------------------- Escenarios */
const SCENARIOS = {
  /** Pedido real: entra, se asigna, misma placa, reasignación manual, estados hasta finalizado. */
  async flow(browser) {
    const tag = 'flujo';
    const { ctx, central, passenger } = await pair(browser);
    const done = watch([['central', central], ['pasajero', passenger]], tag);
    await shot(central, `central-${tag}-0-inicio`);
    const seeded = await cardIds(central);
    check(`[${tag}] la central abre con actividad sembrada`, seeded.length >= 5, `${seeded.length} pedidos`);
    check(`[${tag}] banner "Demo conceptual · IGNIS" en la central`, await central.getByText('Demo conceptual · IGNIS').first().isVisible());
    await waitHome(passenger);
    await passenger.waitForSelector('main[data-central=online]', { timeout: 8000 });
    check(`[${tag}] el pasajero detecta la central`, true);

    const t0 = Date.now();
    const id = await order(passenger);
    await central.waitForSelector(cardSel(id), { timeout: 4000 });
    const tIn = Date.now() - t0;
    check(`[${tag}] el pedido aparece en la central`, true, `${tIn} ms`);
    check(`[${tag}] marcado como pedido de la app`, (await central.getAttribute(cardSel(id), 'data-source')) === 'app');
    check(`[${tag}] destacado al entrar`, (await central.getAttribute(cardSel(id), 'data-fresh')) === 'true');
    const detailId = await central.getAttribute('[data-testid=order-detail]', 'data-order-id').catch(() => null);
    check(`[${tag}] la central lo selecciona y lo encuadra`, detailId === id);
    await sleep(300);
    await shot(central, `central-${tag}-1-pedido-entra`);
    const live = await central.textContent('[data-testid=central-live]');
    check(`[${tag}] anuncio aria-live del pedido nuevo`, /Pedido nuevo desde la app/.test(live ?? ''), live ?? '');

    await stepIs(passenger, 'assigned', 10_000);
    check(`[${tag}] la central asigna (no la app)`, (await passenger.getByText('Asignada por la Central IVANCAR').count()) > 0);
    await waitStatus(central, id, ['assigned', 'en_route'], 4000);
    const pPlate = await passengerPlate(passenger);
    const cPlate = (await cardPlate(central, id))?.trim();
    check(`[${tag}] el pasajero ve la misma placa que la central`, !!pPlate && pPlate === cPlate, `${pPlate} = ${cPlate}`);
    check(`[${tag}] pasa a "en camino" en la central`, await waitStatus(central, id, 'en_route', 4000));
    await sleep(600);
    await shot(central, `central-${tag}-2-asignado`);
    await shot(passenger, `pasajero-${tag}-asignado`);

    // Reasignación manual antes de la llegada.
    await central.locator('[data-testid=open-reassign]').click();
    await central.waitForSelector('[data-testid=unit-picker]');
    await sleep(300);
    await shot(central, `central-${tag}-3-reasignar`);
    const pick = central.locator('[data-testid^=pick-]').first();
    const newUnit = (await pick.getAttribute('data-testid')).replace('pick-', '');
    const newPlate = (await pick.getAttribute('aria-label')).match(/GS[A-Z]-\d{4}/)?.[0];
    await pick.click();
    await passenger.waitForSelector('text=Cambiamos tu unidad', { timeout: 6000 }).catch(() => {});
    await sleep(400);
    const pPlate2 = await passengerPlate(passenger);
    const cPlate2 = (await cardPlate(central, id))?.trim();
    check(`[${tag}] la reasignación cambia la placa en el pasajero`, pPlate2 === newPlate && pPlate2 !== pPlate, `${pPlate} → ${pPlate2} (${newUnit})`);
    check(`[${tag}] y la central muestra la misma placa`, cPlate2 === newPlate, cPlate2 ?? '');
    await shot(passenger, `pasajero-${tag}-reasignado`);

    // La unidad sigue en la central la misma ruta y reloj que en el pasajero.
    const sync = await central.evaluate((rideId) => {
      const s = JSON.parse(sessionStorage.getItem('ivancar-dispatch')).state;
      const o = s.orders.find((x) => x.id === rideId);
      return o?.approach ? { started: o.approach.started_at, n: o.approach.path.length, unit: o.unit_id } : null;
    }, id);
    const pState = await passenger.evaluate(() => JSON.parse(sessionStorage.getItem('ivancar-ride')).state);
    check(
      `[${tag}] misma ruta de llegada y mismo reloj en ambos lados`,
      sync && sync.started === pState.phaseStartedAt && sync.unit === pState.unit.id,
      JSON.stringify({ central: sync, pasajero: { started: pState.phaseStartedAt, unit: pState.unit.id, n: pState.approach.path.length } }),
    );

    // Estados hasta finalizado.
    const seen = new Set();
    const tEnd = Date.now() + 40_000;
    while (Date.now() < tEnd) {
      const st = await cardStatus(central, id);
      if (st) seen.add(st);
      if (st === 'in_trip' && !seen.has('_shot')) {
        seen.add('_shot');
        await shot(central, `central-${tag}-4-en-viaje`);
      }
      if (st === 'completed') break;
      await sleep(200);
    }
    check(`[${tag}] estados en la central: llegó → en viaje → finalizado`, ['arrived', 'in_trip', 'completed'].every((s) => seen.has(s)), [...seen].filter((s) => !s.startsWith('_')).join(' → '));
    await stepIs(passenger, 'rating', 10_000);
    check(`[${tag}] el pasajero termina en la calificación`, true);
    const kpi = await central.textContent('[data-testid=kpi-avg-value]');
    check(`[${tag}] indicador de asignación promedio con datos`, /\d/.test(kpi ?? ''), kpi ?? '');
    await shot(central, `central-${tag}-5-finalizado`);
    done();
    await ctx.close();
  },

  /** Cancelación del pasajero reflejada en la central. */
  async cancel(browser) {
    const tag = 'cancelacion';
    const { ctx, central, passenger } = await pair(browser);
    const done = watch([['central', central], ['pasajero', passenger]], tag);
    await waitHome(passenger);
    await passenger.waitForSelector('main[data-central=online]', { timeout: 8000 });
    const id = await order(passenger);
    await stepIs(passenger, 'assigned', 10_000);
    await waitStatus(central, id, 'en_route', 4000);
    const unit = await central.evaluate((rideId) => JSON.parse(sessionStorage.getItem('ivancar-dispatch')).state.orders.find((o) => o.id === rideId).unit_id, id);
    const freeBefore = Number(await central.textContent('[data-testid=kpi-units-value]'));
    await passenger.locator('[data-testid=cancel-ride]').click();
    await passenger.locator('[data-testid=confirm-cancel]').click();
    check(`[${tag}] la central marca el pedido como cancelado`, await waitStatus(central, id, 'cancelled', 4000));
    await sleep(400);
    const freeAfter = Number(await central.textContent('[data-testid=kpi-units-value]'));
    check(`[${tag}] la unidad vuelve a estar disponible`, freeAfter === freeBefore + 1, `${unit}: ${freeBefore} → ${freeAfter}`);
    const reason = await central.textContent(`${cardSel(id)}`);
    check(`[${tag}] la tarjeta dice quién canceló`, /Por el pasajero/.test(reason ?? ''));
    await shot(central, `central-${tag}`);
    done();
    await ctx.close();
  },

  /** Modo manual: el operador elige la unidad; el pasajero espera al operador. */
  async manual(browser) {
    const tag = 'manual';
    const { ctx, central, passenger } = await pair(browser);
    const done = watch([['central', central], ['pasajero', passenger]], tag);
    await central.locator('[data-testid=mode-manual]').click();
    check(`[${tag}] interruptor en Manual`, (await central.getAttribute('[data-testid=central]', 'data-mode')) === 'manual');
    await waitHome(passenger);
    await passenger.waitForSelector('main[data-central=online]', { timeout: 8000 });
    const id = await order(passenger);
    await central.waitForSelector(cardSel(id));
    await passenger.waitForSelector('text=Un operador de la central está asignando tu unidad', { timeout: 4000 }).catch(() => {});
    check(`[${tag}] el pasajero sabe que un operador asigna`, (await passenger.getByText('Un operador de la central').count()) > 0);
    await sleep(3500); // más que la espera normal con central (3 s con sim=2)
    check(`[${tag}] sin asignación automática`, (await cardStatus(central, id)) === 'requested' && (await passenger.getAttribute('main', 'data-step')) === 'searching');
    await shot(central, `central-${tag}-1-esperando`);
    await central.locator(`${cardSel(id)} [data-testid=card-assign]`).click();
    await central.waitForSelector('[data-testid=unit-picker]');
    const rows = await central.$$eval('[data-testid^=pick-]', (els) => els.map((e) => e.getAttribute('aria-label')));
    const etas = rows.map((r) => Number(r.match(/a (\d+) minutos/)?.[1]));
    check(`[${tag}] lista de unidades libres ordenada por llegada, con ETA`, rows.length >= 3 && etas.every((e, i) => Number.isFinite(e) && (i === 0 || e >= etas[i - 1])), rows.slice(0, 3).join(' | '));
    await shot(central, `central-${tag}-2-selector`);
    const pick = central.locator('[data-testid^=pick-]').nth(1);
    const plate = (await pick.getAttribute('aria-label')).match(/GS[A-Z]-\d{4}/)?.[0];
    await pick.click();
    await stepIs(passenger, 'assigned', 6000);
    check(`[${tag}] el pasajero recibe la unidad elegida por el operador`, (await passengerPlate(passenger)) === plate, plate);
    check(`[${tag}] asignada por la central`, (await passenger.getByText('Asignada por la Central IVANCAR').count()) > 0);
    done();
    await ctx.close();
  },

  /** Alertas: el sembrado atascado y un pedido real sin asignar (modo manual). */
  async alert(browser) {
    const tag = 'alertas';
    const { ctx, central, passenger } = await pair(browser);
    const done = watch([['central', central], ['pasajero', passenger]], tag);
    // 1) Sembrado atascado: alerta a los pocos segundos de abrir.
    await central.waitForSelector('[data-testid=alerts-zone] [data-order-card][data-alert=true]', { timeout: 10_000 });
    const stuck = await central.getAttribute('[data-testid=alerts-zone] [data-order-card]', 'data-order-id');
    const stuckUnit = await central.evaluate((oid) => JSON.parse(sessionStorage.getItem('ivancar-dispatch')).state.orders.find((o) => o.id === oid).unit_id, stuck);
    check(`[${tag}] el pedido atascado sube a "Requiere atención" y pulsa`, !!stuck);
    const unitAlert = await central.locator(`.iv-unit.is-alert[data-unit-id="${stuckUnit}"]`).count();
    check(`[${tag}] la unidad atascada se marca en el mapa`, unitAlert === 1, stuckUnit);
    const live = await central.textContent('[data-testid=central-live]');
    check(`[${tag}] anuncio aria-live de la alerta`, /Alerta/.test(live ?? ''), live ?? '');
    await shot(central, `central-${tag}-1-atascado`);
    await central.locator('[data-testid=alerts-zone] [data-testid=alert-action]').first().click();
    await sleep(700);
    const after = await central.evaluate((oid) => JSON.parse(sessionStorage.getItem('ivancar-dispatch')).state.orders.find((o) => o.id === oid), stuck);
    const stillAlert = await central.locator(`[data-testid=alerts-zone] ${cardSel(stuck)}`).count();
    check(`[${tag}] "Reasignar ya" cambia la unidad y quita la alerta`, stillAlert === 0 && after.unit_id !== stuckUnit && after.stalled_at == null, `${stuckUnit} → ${after.unit_id}`);

    // 2) Pedido real sin asignar más allá del umbral (central en manual).
    await central.locator('[data-testid=mode-manual]').click();
    await waitHome(passenger);
    await passenger.waitForSelector('main[data-central=online]', { timeout: 8000 });
    const id = await order(passenger);
    await central.waitForSelector(`[data-testid=alerts-zone] ${cardSel(id)}`, { timeout: 12_000 });
    check(`[${tag}] pedido real sin asignar pasa a alerta`, (await central.getAttribute(cardSel(id), 'data-alert')) === 'true');
    await shot(central, `central-${tag}-2-sin-asignar`);
    await central.locator(`${cardSel(id)} [data-testid=alert-action]`).click();
    await stepIs(passenger, 'assigned', 6000);
    check(`[${tag}] "Asignar ya" asigna y el pasajero recibe la unidad`, (await passengerPlate(passenger)) === (await cardPlate(central, id))?.trim());
    await sleep(500);
    check(`[${tag}] la alerta desaparece`, (await central.locator(`[data-testid=alerts-zone] ${cardSel(id)}`).count()) === 0);
    done();
    await ctx.close();
  },

  /** Recargas: ni la del pasajero (reenvía ride:created) ni la de la central duplican. */
  async reload(browser) {
    const tag = 'recarga';
    const { ctx, central, passenger } = await pair(browser);
    const done = watch([['central', central], ['pasajero', passenger]], tag);
    await central.locator('[data-testid=mode-manual]').click();
    await waitHome(passenger);
    await passenger.waitForSelector('main[data-central=online]', { timeout: 8000 });
    const id = await order(passenger);
    await central.waitForSelector(cardSel(id));
    await passenger.reload();
    await stepIs(passenger, 'searching', 5000);
    await sleep(1200);
    const n1 = (await cardIds(central)).filter((x) => x === id).length;
    check(`[${tag}] recargar el pasajero no duplica el pedido`, n1 === 1, `${n1}`);
    const before = (await cardIds(central)).sort();
    await central.reload();
    await central.waitForSelector(cardSel(id), { timeout: 6000 });
    await sleep(800);
    const afterIds = await cardIds(central);
    check(`[${tag}] recargar la central conserva los pedidos sin duplicar`, new Set(afterIds).size === afterIds.length && before.every((x) => afterIds.includes(x)), `${before.length} → ${afterIds.length}`);
    check(`[${tag}] conserva el modo manual`, (await central.getAttribute('[data-testid=central]', 'data-mode')) === 'manual');
    // Y sigue operando: asigna desde la central recargada.
    await central.locator(`${cardSel(id)} [data-testid=card-assign]`).click();
    await central.locator('[data-testid^=pick-]').first().click();
    await stepIs(passenger, 'assigned', 6000);
    check(`[${tag}] la central recargada sigue asignando`, (await passengerPlate(passenger)) === (await cardPlate(central, id))?.trim());
    done();
    await ctx.close();
  },

  /** Lo esencial dentro de #/demo (iframes) y el botón de reinicio. */
  async demo(browser) {
    const tag = 'demo';
    const ctx = await newContext(browser);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    // Los mensajes de consola y errores de los iframes llegan por la página.
    const done = watch([['demo', page]], tag);
    await page.goto(`${BASE}#/demo?sim=2`);
    await page.waitForSelector('[data-testid=demo-passenger]');
    const pf = page.frameLocator('[data-testid=demo-passenger]');
    const cf = page.frameLocator('[data-testid=demo-central]');
    await cf.locator('[data-order-card]').first().waitFor({ timeout: 10_000 });
    await pf.locator('main[data-step=home] [data-testid=pickup-label]').waitFor({ timeout: 15_000 });
    await pf.locator('main[data-central=online]').waitFor({ timeout: 8000 });
    await sleep(600);
    await shot(page, `demo-${tag}-1440-inicio`);
    await pf.locator('[data-testid=suggested-place]').first().click();
    await pf.locator('[data-testid=cta-request]:not([aria-busy])').waitFor({ timeout: 8000 });
    await pf.locator('[data-testid=cta-request]').click();
    const appCard = cf.locator('[data-order-card][data-source=app]');
    await appCard.waitFor({ timeout: 5000 });
    check(`[${tag}] el pedido del teléfono aparece en la central (iframes)`, true);
    await sleep(500);
    await shot(page, `demo-${tag}-1440-pedido`);
    await pf.locator('main[data-step=assigned]').waitFor({ timeout: 10_000 });
    await sleep(800);
    const p = (await pf.locator('[data-testid=plate]').textContent())?.trim();
    const c = (await appCard.locator('[data-testid=order-plate]').textContent())?.trim();
    check(`[${tag}] misma placa en teléfono y central`, !!p && p === c, `${p} = ${c}`);
    await shot(page, `demo-${tag}-1440-asignado`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
    check(`[${tag}] 1440×900 sin desbordes`, !overflow);

    await page.locator('[data-testid=demo-reset]').click();
    await page.waitForSelector('text=Demo reiniciada', { timeout: 4000 });
    await pf.locator('main[data-step=home]').waitFor({ timeout: 15_000 });
    await cf.locator('[data-order-card]').first().waitFor({ timeout: 10_000 });
    await sleep(800);
    check(`[${tag}] reiniciar limpia la central (sin pedidos de la app)`, (await cf.locator('[data-order-card][data-source=app]').count()) === 0);
    check(`[${tag}] y el teléfono vuelve al inicio`, (await pf.locator('main[data-step=home]').count()) === 1);
    await shot(page, `demo-${tag}-1440-reiniciado`);

    for (const [w, h] of [
      [1920, 1080],
      [1280, 800],
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await sleep(1200);
      const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight);
      check(`[${tag}] ${w}×${h} sin desbordes`, !o);
      await shot(page, `demo-${tag}-${w}x${h}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(500);
    check(`[${tag}] en pantallas chicas ofrece enlaces a cada vista`, (await page.getByRole('link', { name: 'Central de despacho' }).count()) === 1);
    await shot(page, `demo-${tag}-390x844`);
    done();
    await ctx.close();
  },

  /** Lo esencial con prefers-reduced-motion. */
  async reduced(browser) {
    const tag = 'reduced-motion';
    const { ctx, central, passenger } = await pair(browser, { reduced: true, sim: 3 });
    const done = watch([['central', central], ['pasajero', passenger]], tag);
    await waitHome(passenger);
    await passenger.waitForSelector('main[data-central=online]', { timeout: 8000 });
    const id = await order(passenger);
    await central.waitForSelector(cardSel(id), { timeout: 4000 });
    await stepIs(passenger, 'assigned', 10_000);
    await sleep(500);
    check(`[${tag}] misma placa`, (await passengerPlate(passenger)) === (await cardPlate(central, id))?.trim());
    await shot(central, `central-${tag}`);
    check(`[${tag}] llega a finalizado`, await waitStatus(central, id, 'completed', 30_000));
    done();
    await ctx.close();
  },

  /** Capturas de la central en varios tamaños y control de desbordes. */
  async sizes(browser) {
    for (const [w, h] of [
      [1440, 900],
      [1280, 800],
      [1024, 768],
      [390, 844],
    ]) {
      const tag = `central-${w}x${h}`;
      const ctx = await newContext(browser);
      const page = await ctx.newPage();
      await page.setViewportSize({ width: w, height: h });
      const done = watch([['central', page]], tag);
      await page.goto(`${BASE}#/central`);
      await page.waitForSelector('[data-order-card]');
      await sleep(5500); // deja que salte la alerta del sembrado
      const o = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      check(`[${tag}] sin scroll horizontal`, !o);
      // Nada cortado por el borde derecho: interruptor de modo y KPIs dentro del viewport.
      const right = await page.evaluate(() =>
        Math.max(...[...document.querySelectorAll('[data-testid=mode-manual], [data-testid^=kpi-]')].map((e) => e.getBoundingClientRect().right)),
      );
      check(`[${tag}] cabecera e indicadores caben en el ancho`, right <= w, `borde derecho ${Math.round(right)} ≤ ${w}`);
      check(`[${tag}] banner "Demo conceptual · IGNIS" visible`, (await page.locator('text=Demo conceptual · IGNIS >> visible=true').count()) > 0);
      await shot(page, tag);
      if (w < 768) {
        await page.locator('[data-testid=tab-map]').click();
        await sleep(1500);
        await shot(page, `${tag}-mapa`);
        await page.$eval('[data-unit-id="drv-01"]', (e) => e.click());
        await sleep(900);
        check(`[${tag}] en móvil, la unidad muestra su detalle`, await page.locator('[data-testid=unit-detail]').isVisible());
        await shot(page, `${tag}-unidad`);
      } else {
        // La unidad puede estar fuera del encuadre actual: se activa como lo haría el teclado.
        await page.$eval('[data-unit-id="drv-01"]', (e) => e.click());
        await sleep(1200);
        const txt = await page.textContent('[data-testid=unit-detail]').catch(() => '');
        check(`[${tag}] al elegir una unidad se ve conductor, placa y vehículo`, /Carlos Mendoza/.test(txt) && /GSB-4821/.test(txt) && /Hyundai Accent/.test(txt));
        await shot(page, `${tag}-unidad`);
        if (w === 1440) {
          // Teclado: la unidad es enfocable y Enter la selecciona; Escape no rompe nada.
          await page.$eval('[data-unit-id="drv-02"]', (e) => e.focus());
          await page.keyboard.press('Enter');
          await sleep(600);
          check(`[${tag}] teclado: Enter sobre una unidad la selecciona`, /Luis Vera/.test((await page.textContent('[data-testid=unit-detail]').catch(() => '')) ?? ''));
          await page.locator('[data-order-button]').first().focus();
          await page.keyboard.press('ArrowDown');
          const second = await page.evaluate(() => [...document.querySelectorAll('[data-order-button]')].indexOf(document.activeElement));
          check(`[${tag}] teclado: flechas recorren la cola de pedidos`, second === 1, `${second}`);
          await page.keyboard.press('Enter');
          await sleep(500);
          check(`[${tag}] teclado: Enter abre el detalle del pedido`, await page.locator('[data-testid=order-detail]').isVisible());
        }
      }
      done();
      await ctx.close();
    }
  },

  /**
   * Framerate de la central con todo en movimiento: 14 unidades, rutas de los pedidos
   * activos y un pedido real seleccionado. Se mide en su propia página (el pasajero se
   * cierra tras la asignación: la unidad sigue con el reloj de la central). Además del
   * rAF, el tiempo de JS y de tareas del hilo principal (CDP). `#/demo` se informa aparte.
   */
  async fps(browser) {
    const tag = 'fps';
    const { ctx, central, passenger } = await pair(browser, { sim: 1 });
    const done = watch([['central', central]], tag);
    await waitHome(passenger);
    await passenger.waitForSelector('main[data-central=online]', { timeout: 8000 });
    await order(passenger);
    await stepIs(passenger, 'assigned', 10_000);
    await passenger.close();
    await sleep(1200);
    const r = await measureFrames(central, ctx, 5000);
    const units = await central.locator('[data-unit-id]').count();
    check(
      `[${tag}] central (1440×900) fluida con ${units} unidades en movimiento`,
      // Umbral holgado: el entorno de pruebas no tiene GPU (raster por software) y varía.
      r.fps >= 30 && r.scriptPct < 15,
      `${r.fps.toFixed(1)} fps · p95 ${r.p95.toFixed(1)} ms · ${r.over50} frames > 50 ms · JS ${r.scriptPct.toFixed(1)} % · tareas ${r.taskPct.toFixed(1)} % del hilo principal`,
    );
    done();
    await ctx.close();

    const dctx = await newContext(browser);
    const demo = await dctx.newPage();
    await demo.setViewportSize({ width: 1440, height: 900 });
    await demo.goto(`${BASE}#/demo`);
    await demo.frameLocator('[data-testid=demo-central]').locator('[data-order-card]').first().waitFor({ timeout: 10_000 });
    await sleep(4000);
    const d = await measureFrames(demo, dctx, 5000);
    console.log(
      `INFO  [${tag}] #/demo 1440×900 (dos mapas animados en una página): ${d.fps.toFixed(1)} fps · p95 ${d.p95.toFixed(1)} ms · JS ${d.scriptPct.toFixed(1)} % · tareas ${d.taskPct.toFixed(1)} %`,
    );
    await dctx.close();
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
