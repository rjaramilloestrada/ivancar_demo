import { patrolRoutes } from '@/mocks/fleetRoutes';
import type { LatLng } from '@/types';
import { cumulativeDistances, pointAlong, seededRandom } from './geo';

/**
 * Patrulla de la flota con reloj de pared (central de despacho).
 *
 * La posición de cada unidad libre depende solo de la hora: `patrolPosition(id, now)`.
 * Así el mapa (que la dibuja cada frame) y el store (que elige la unidad más cercana)
 * ven exactamente el mismo punto, y dos pestañas de la central muestran la flota igual.
 * Mismo arranque por unidad que `FleetLayer` (semilla por id) y la misma velocidad.
 */

export const PATROL_SPEED_MPS = 9;

interface Prepared {
  path: LatLng[];
  cum: number[];
  length: number;
  phase0: number;
}

const prepared = new Map<string, Prepared | null>();

function prep(unitId: string): Prepared | null {
  let p = prepared.get(unitId);
  if (p !== undefined) return p;
  const route = patrolRoutes[unitId];
  if (!route || route.path.length < 2) {
    prepared.set(unitId, null);
    return null;
  }
  const cum = cumulativeDistances(route.path);
  p = {
    path: route.path,
    cum,
    length: cum[cum.length - 1] || 1,
    phase0: seededRandom(parseInt(unitId.replace(/\D/g, ''), 10) || 1)(),
  };
  prepared.set(unitId, p);
  return p;
}

export interface FleetPose {
  point: LatLng;
  /** Rumbo en grados (0 = norte). */
  bearing: number;
}

/** Posición y rumbo de una unidad en patrulla a la hora `now` (ms de época). */
export function patrolPosition(unitId: string, now: number, fallback?: LatLng): FleetPose {
  const p = prep(unitId);
  if (!p) return { point: fallback ?? [0, 0], bearing: 0 };
  const laps = p.phase0 + (now / 1000) * (PATROL_SPEED_MPS / p.length);
  const f = laps - Math.floor(laps);
  const pt = pointAlong(p.path, f, p.cum);
  return { point: pt.point, bearing: pt.bearing };
}

/* ------------------------------------------------ Polilíneas con caché */

const cumCache = new WeakMap<readonly LatLng[], number[]>();

/** Distancias acumuladas de una polilínea, memorizadas por referencia. */
export function cumOf(path: readonly LatLng[]): number[] {
  let c = cumCache.get(path);
  if (!c) {
    c = cumulativeDistances(path);
    cumCache.set(path, c);
  }
  return c;
}

/** Punto y rumbo a una fracción de la polilínea (con caché de distancias). */
export function poseAlong(path: readonly LatLng[], fraction: number): FleetPose {
  const pt = pointAlong(path, fraction, cumOf(path));
  return { point: pt.point, bearing: pt.bearing };
}
