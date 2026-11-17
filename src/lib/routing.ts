import type { LatLng } from '@/types';
import { curvedPath, haversine, simplifyPath } from './geo';

/**
 * Rutas para el demo.
 *
 * 1. Intenta el OSRM público (router.project-osrm.org, perfil auto) con timeout corto.
 *    Comprobado desde el entorno de desarrollo (nov-2026): responde en ~0,7 s con CORS.
 *    Es un servicio de demostración sin SLA: puede fallar o limitar, por eso hay respaldo.
 * 2. Si falla, tarda o devuelve algo raro: curva suave entre los puntos (`curvedPath`),
 *    distancia = línea recta × ROAD_FACTOR y duración a velocidad urbana promedio.
 *
 * Uso justo del servidor público: caché por par origen-destino (incluidas las peticiones
 * en curso), como mucho 2 peticiones a la vez y 350 ms entre una y la siguiente (sin
 * ráfagas), y si falla 3 veces seguidas se deja de llamar durante 60 s (todo usa el
 * respaldo mientras tanto).
 *
 * `getRoute` nunca rechaza (salvo AbortError si el llamador aborta): siempre hay ruta.
 * La geometría es la de OSRM tal cual: empieza y termina en la calle (no se une con una
 * recta al punto exacto), así el auto se detiene en la vía y no gira hacia la vereda.
 */

export interface Route {
  path: LatLng[];
  distance_m: number;
  duration_s: number;
  source: 'osrm' | 'fallback';
}

export const OSRM_BASE = 'https://router.project-osrm.org';
export const OSRM_URL = `${OSRM_BASE}/route/v1/driving`;
export const ROUTE_TIMEOUT_MS = 2000;
/** Factor de rodeo urbano típico sobre la distancia en línea recta. */
export const ROAD_FACTOR = 1.35;
/** Velocidad urbana promedio para estimar duración (km/h). */
export const URBAN_SPEED_KMH = 24;

/* ------------------------------------------------------------ Control de ritmo */

const MAX_CONCURRENT = 2;
const MIN_GAP_MS = 350;
const BREAKER_FAILS = 3;
const BREAKER_PAUSE_MS = 60_000;

let active = 0;
let lastStart = 0;
let fails = 0;
let pausedUntil = 0;
const waiting: Array<() => void> = [];

function pump() {
  if (!waiting.length || active >= MAX_CONCURRENT) return;
  const wait = lastStart + MIN_GAP_MS - Date.now();
  if (wait > 0) {
    setTimeout(pump, wait);
    return;
  }
  lastStart = Date.now();
  active++;
  waiting.shift()!();
}

/** true si el cortacircuitos está abierto (OSRM falló varias veces seguidas). */
export function osrmPaused(now = Date.now()): boolean {
  return now < pausedUntil;
}

/**
 * GET a OSRM respetando el ritmo y el cortacircuitos. Rechaza si está en pausa, si
 * `signal` aborta o si la respuesta no es 2xx.
 */
async function osrmJson<T>(url: string, signal: AbortSignal): Promise<T> {
  if (osrmPaused()) throw new Error('OSRM en pausa');
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const go = () => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = () => {
      const i = waiting.indexOf(go);
      if (i >= 0) waiting.splice(i, 1);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    waiting.push(go);
    pump();
  });
  try {
    const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`OSRM ${res.status}`);
    const data = (await res.json()) as T;
    fails = 0;
    return data;
  } catch (err) {
    if (++fails >= BREAKER_FAILS) {
      pausedUntil = Date.now() + BREAKER_PAUSE_MS;
      fails = 0;
    }
    throw err;
  } finally {
    active--;
    pump();
  }
}

/** Ejecuta `fn` con un AbortSignal que vence a los `timeoutMs`. */
async function withTimeout<T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ Rutas A → B */

const cache = new Map<string, Route>();
const inflight = new Map<string, Promise<Route>>();
const CACHE_MAX = 80;

const fx = (p: LatLng) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
const key = (a: LatLng, b: LatLng, brg?: number, end?: number) =>
  `${fx(a)};${fx(b)}${brg != null ? `@${Math.round(brg / 15)}` : ''}${end != null ? `>${Math.round(end / 15)}` : ''}`;
const deg = (b: number) => Math.round(((b % 360) + 360) % 360);

function remember(k: string, r: Route) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(k, r);
}

/** Ruta de respaldo instantánea, sin red. */
export function estimateRoute(from: LatLng, to: LatLng): Route {
  const straight = haversine(from, to);
  const distance = straight * ROAD_FACTOR;
  return {
    path: curvedPath(from, to, { segments: Math.min(64, Math.max(12, Math.round(straight / 120))) }),
    distance_m: Math.round(distance),
    duration_s: Math.round(distance / ((URBAN_SPEED_KMH * 1000) / 3600)),
    source: 'fallback',
  };
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
}
interface OsrmResponse {
  code: string;
  routes?: OsrmRoute[];
  waypoints?: Array<{ distance: number; location: [number, number] }>;
}

const toPath = (r: OsrmRoute): LatLng[] => simplifyPath(r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as LatLng), 2);

async function fetchOsrm(from: LatLng, to: LatLng, signal: AbortSignal, startBearing?: number, endBearing?: number): Promise<Route> {
  // Con rumbo de salida: el auto arranca hacia donde ya iba (sin vuelta en U en el lugar).
  // Con rumbo de llegada: llega mirando hacia donde sigue después (p. ej. el viaje).
  const brg =
    startBearing != null || endBearing != null
      ? `&bearings=${startBearing != null ? `${deg(startBearing)},70` : ''};${endBearing != null ? `${deg(endBearing)},80` : ''}`
      : '';
  const url = `${OSRM_URL}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&alternatives=false&steps=false${brg}`;
  const data = await osrmJson<OsrmResponse>(url, signal);
  const r = data.routes?.[0];
  if (data.code !== 'Ok' || !r || r.geometry.coordinates.length < 2) throw new Error(`OSRM ${data.code}`);
  return { path: toPath(r), distance_m: Math.round(r.distance), duration_s: Math.round(r.duration), source: 'osrm' };
}

export interface RouteOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Rumbo con que sale el vehículo (grados). Si OSRM no encuentra ruta así, se pide sin rumbo. */
  startBearing?: number;
  /** Rumbo con que debe llegar (grados), con la misma regla. */
  endBearing?: number;
}

/**
 * Ruta entre dos puntos. Intenta OSRM (timeout `timeoutMs`), si no, respaldo.
 * Abortar `signal` rechaza con AbortError (el llamador ya no la quiere).
 */
export async function getRoute(
  from: LatLng,
  to: LatLng,
  { signal, timeoutMs = ROUTE_TIMEOUT_MS, startBearing, endBearing }: RouteOptions = {},
): Promise<Route> {
  const k = key(from, to, startBearing, endBearing);
  const hit = cache.get(k);
  if (hit) return hit;

  let p = inflight.get(k);
  if (!p) {
    p = (async () => {
      const t0 = Date.now();
      try {
        let route: Route;
        try {
          route = await withTimeout(timeoutMs, (s) => fetchOsrm(from, to, s, startBearing, endBearing));
        } catch (err) {
          // Sin ruta con ese rumbo (p. ej. calle sin salida): una vez más, sin rumbo, si queda tiempo.
          const left = timeoutMs - (Date.now() - t0);
          if ((startBearing == null && endBearing == null) || left < 400 || osrmPaused() || (err as Error)?.name === 'AbortError') throw err;
          route = await withTimeout(left, (s) => fetchOsrm(from, to, s));
        }
        remember(k, route);
        return route;
      } catch {
        // Sin caché del respaldo: la próxima vez se reintenta OSRM.
        return estimateRoute(from, to);
      } finally {
        inflight.delete(k);
      }
    })();
    inflight.set(k, p);
  }

  if (!signal) return p;
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  return new Promise<Route>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/* ------------------------------------------------------------- Circuitos cerrados */

export interface Loop {
  /** Circuito cerrado (el último punto coincide con el primero). */
  path: LatLng[];
  distance_m: number;
  /** Distancia (m) de cada punto pedido a la calle donde OSRM lo ajustó. */
  snaps: number[];
}

/**
 * Circuito por calles que pasa por `points` en orden y vuelve al primero (una sola
 * petición a OSRM, sin vueltas en U en los puntos intermedios). null si OSRM no responde.
 */
export async function getLoop(points: LatLng[], { timeoutMs = 3000 }: { timeoutMs?: number } = {}): Promise<Loop | null> {
  if (points.length < 2) return null;
  const coords = [...points, points[0]].map((p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join(';');
  const url = `${OSRM_URL}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false&continue_straight=true`;
  try {
    const data = await withTimeout(timeoutMs, (s) => osrmJson<OsrmResponse>(url, s));
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r || r.geometry.coordinates.length < 4) return null;
    const path = toPath(r);
    if (haversine(path[0], path[path.length - 1]) > 1) path.push(path[0]);
    return { path, distance_m: Math.round(r.distance), snaps: (data.waypoints ?? []).slice(0, points.length).map((w) => w.distance) };
  } catch {
    return null;
  }
}

/** Vacía la caché y el control de ritmo (tests). */
export function clearRouteCache() {
  cache.clear();
  inflight.clear();
  fails = 0;
  pausedUntil = 0;
  lastStart = 0;
}
