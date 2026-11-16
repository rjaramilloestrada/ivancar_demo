import type { LatLng } from '@/types';
import { curvedPath, haversine } from './geo';

/**
 * Rutas para el demo.
 *
 * 1. Intenta el OSRM público (router.project-osrm.org, perfil auto) con timeout de 2 s.
 *    Comprobado desde el entorno de desarrollo (nov-2026): responde en ~0,7 s con CORS.
 *    Es un servicio de demostración sin SLA: puede fallar o limitar, por eso hay respaldo.
 * 2. Si falla, tarda o devuelve algo raro: curva suave entre los puntos (`curvedPath`),
 *    distancia = línea recta × ROAD_FACTOR y duración a velocidad urbana promedio.
 *
 * `getRoute` nunca rechaza (salvo AbortError si el llamador aborta): siempre hay ruta.
 * Cachea por par origen-destino (redondeado a ~1 m), incluidas las peticiones en curso.
 */

export interface Route {
  path: LatLng[];
  distance_m: number;
  duration_s: number;
  source: 'osrm' | 'fallback';
}

export const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';
export const ROUTE_TIMEOUT_MS = 2000;
/** Factor de rodeo urbano típico sobre la distancia en línea recta. */
export const ROAD_FACTOR = 1.35;
/** Velocidad urbana promedio para estimar duración (km/h). */
export const URBAN_SPEED_KMH = 24;

const cache = new Map<string, Route>();
const inflight = new Map<string, Promise<Route>>();

const key = (a: LatLng, b: LatLng) => `${a[0].toFixed(5)},${a[1].toFixed(5)};${b[0].toFixed(5)},${b[1].toFixed(5)}`;

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

interface OsrmResponse {
  code: string;
  routes?: Array<{ distance: number; duration: number; geometry: { coordinates: [number, number][] } }>;
}

async function fetchOsrm(from: LatLng, to: LatLng, signal: AbortSignal): Promise<Route> {
  const url = `${OSRM_URL}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  const r = data.routes?.[0];
  if (data.code !== 'Ok' || !r || r.geometry.coordinates.length < 2) throw new Error(`OSRM ${data.code}`);
  const path: LatLng[] = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  // Une la ruta a los puntos exactos (OSRM la "pega" a la calle más cercana).
  path.unshift(from);
  path.push(to);
  return { path, distance_m: Math.round(r.distance), duration_s: Math.round(r.duration), source: 'osrm' };
}

/**
 * Ruta entre dos puntos. Intenta OSRM (timeout `timeoutMs`), si no, respaldo.
 * Abortar `signal` rechaza con AbortError (el llamador ya no la quiere).
 */
export async function getRoute(
  from: LatLng,
  to: LatLng,
  { signal, timeoutMs = ROUTE_TIMEOUT_MS }: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<Route> {
  const k = key(from, to);
  const hit = cache.get(k);
  if (hit) return hit;

  let p = inflight.get(k);
  if (!p) {
    p = (async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const route = await fetchOsrm(from, to, ctrl.signal);
        cache.set(k, route);
        return route;
      } catch {
        // Sin caché del respaldo: la próxima vez se reintenta OSRM.
        return estimateRoute(from, to);
      } finally {
        clearTimeout(timer);
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

/** Vacía la caché (tests). */
export function clearRouteCache() {
  cache.clear();
  inflight.clear();
}
