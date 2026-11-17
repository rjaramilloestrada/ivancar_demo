import { fleetById, LOCAL_UNIT_IDS } from '@/mocks/drivers';
import { patrolRoutes } from '@/mocks/fleetRoutes';
import type { LatLng } from '@/types';
import { cumOf, getFleetPlan, type FleetPlan, type FleetPlanUnit } from './fleetSim';
import { curvedPath, destinationPoint, haversine, pointAlong, removeSpurs, seededRandom } from './geo';
import { getLoop } from './routing';

/**
 * Flota alrededor del pasajero: al fijar la recogida, las unidades de zona pasan a
 * recorrer dos circuitos por calles reales alrededor de ese punto (uno interior y otro
 * exterior), repartidas para que al empezar haya 4–6 a 0,4–1,8 km.
 *
 * - Circuitos: OSRM `route` por 4 puntos alrededor de la recogida y de vuelta al primero
 *   (OSRM los ajusta a la calle más cercana; si alguno queda lejos de toda calle, se acerca
 *   ese punto y se pide otra vez). Una o dos peticiones por circuito, una tras otra.
 * - Sin OSRM: el circuito incluido (`mocks/fleetRoutes.ts`) que pase más cerca, y si no
 *   hay ninguno, circuitos estimados (curvas suaves; no siguen calles).
 * - Se reutiliza el plan vigente mientras la recogida no se aleje más de `REUSE_M`.
 */

/** Mientras la recogida esté a menos de esto del centro del plan, no se pide otro (m). */
export const REUSE_M = 1_100;

interface Ring {
  rMin: number;
  rMax: number;
  rot: number;
  /** Distancias aceptables de las unidades al empezar (m). */
  near: [number, number];
}

const RINGS: Ring[] = [
  { rMin: 420, rMax: 760, rot: 20, near: [380, 900] },
  { rMin: 850, rMax: 1_400, rot: 65, near: [550, 1_800] },
];

/** Tipos por circuito: así cualquier servicio tiene una unidad compatible cerca. */
const LOOP_UNITS: string[][] = [
  ['drv-15', 'drv-18', 'drv-16'], // taxi, ejecutivo, taxi
  ['drv-17', 'drv-19', 'drv-20'], // taxi, suv, camioneta
];

const MAX_SNAP_M = 320;

function ringPoints(center: LatLng, ring: Ring, rnd: () => number): LatLng[] {
  return [0, 1, 2, 3].map((i) => destinationPoint(center, ring.rot + i * 90 + (rnd() - 0.5) * 30, ring.rMin + rnd() * (ring.rMax - ring.rMin)));
}

/** Fracción del circuito (por largo) a menos de `maxM` del centro. */
function coverage(path: LatLng[], center: LatLng, maxM: number): number {
  const cum = cumOf(path);
  const total = cum[cum.length - 1] || 1;
  let inside = 0;
  for (let i = 1; i < path.length; i++) if (haversine(path[i], center) <= maxM) inside += cum[i] - cum[i - 1];
  return inside / total;
}

async function streetLoop(center: LatLng, ring: Ring, rnd: () => number): Promise<LatLng[] | null> {
  let pts = ringPoints(center, ring, rnd);
  for (let attempt = 0; attempt < 2; attempt++) {
    const loop = await getLoop(pts);
    if (!loop) return null; // sin red: no insistir
    const far = loop.snaps.map((d) => d > MAX_SNAP_M);
    const path = removeSpurs(loop.path);
    const okShape = loop.distance_m >= 1_800 && loop.distance_m <= 16_000 && coverage(path, center, 2_300) >= 0.75;
    if (!far.some(Boolean) && okShape) return path;
    if (attempt === 1) return okShape ? path : null;
    // Puntos lejos de toda calle (río, estero, manzana cerrada): acercarlos al centro.
    pts = pts.map((p, i) => (far[i] || !okShape ? destinationPoint(center, ring.rot + i * 90 + (rnd() - 0.5) * 50, ring.rMin * (0.55 + rnd() * 0.3)) : p));
  }
  return null;
}

/** Circuito incluido que más recorre cerca del centro (respaldo sin red). */
function bundledLoops(center: LatLng): LatLng[][] {
  return Object.values(patrolRoutes)
    .map((r) => ({ path: r.path, cov: coverage(r.path, center, 1_800), min: Math.min(...r.path.map((p) => haversine(p, center))) }))
    .filter((r) => r.min < 1_200 && r.cov > 0.2)
    .sort((a, b) => b.cov - a.cov)
    .slice(0, 2)
    .map((r) => r.path);
}

/** Circuito estimado (sin calles): curvas suaves entre 4 puntos alrededor del centro. */
function estimatedLoop(center: LatLng, ring: Ring, rnd: () => number): LatLng[] {
  const pts = ringPoints(center, ring, rnd);
  const out: LatLng[] = [];
  for (let i = 0; i < pts.length; i++) {
    const seg = curvedPath(pts[i], pts[(i + 1) % pts.length], { segments: 16, bend: 0.12 });
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return out;
}

/**
 * Fases de `n` unidades en un circuito: repartidas a 1/n de vuelta y, entre todas las
 * rotaciones posibles, la que deja más unidades dentro de `near` (y lo más cerca posible).
 */
export function choosePhases(path: LatLng[], center: LatLng, n: number, near: [number, number]): number[] {
  const cum = cumOf(path);
  const SAMPLES = 96;
  let best: number[] = [];
  let bestScore = -Infinity;
  for (let s = 0; s < SAMPLES; s++) {
    const phases = Array.from({ length: n }, (_, i) => (s / SAMPLES + i / n) % 1);
    let score = 0;
    for (const f of phases) {
      const d = haversine(pointAlong(path, f, cum).point, center);
      if (d >= near[0] && d <= near[1]) score += 10 - d / 1_000;
      else score -= d < near[0] ? 4 : 2 + d / 2_000;
    }
    if (score > bestScore) {
      bestScore = score;
      best = phases;
    }
  }
  return best;
}

/** Arma el plan con los circuitos dados (uno por anillo, o los que haya). */
export function planFrom(center: LatLng, loops: LatLng[][], source: FleetPlan['source'], epoch = Date.now()): FleetPlan {
  const units: FleetPlanUnit[] = [];
  if (loops.length === 1) {
    const ids = LOOP_UNITS.flat();
    choosePhases(loops[0], center, ids.length, [RINGS[0].near[0], RINGS[1].near[1]]).forEach((phase0, i) => units.push({ id: ids[i], loop: 0, phase0 }));
  } else {
    loops.slice(0, 2).forEach((loop, k) => {
      const ids = LOOP_UNITS[k];
      choosePhases(loop, center, ids.length, RINGS[k].near).forEach((phase0, i) => units.push({ id: ids[i], loop: k, phase0 }));
    });
  }
  return {
    id: `${epoch.toString(36)}-${Math.round((center[0] + center[1]) * 1e5).toString(36)}`,
    epoch,
    center,
    source,
    loops: loops.slice(0, 2).map((l) => l.map(([a, b]) => [Math.round(a * 1e6) / 1e6, Math.round(b * 1e6) / 1e6] as LatLng)),
    units: units.filter((u) => fleetById[u.id] && LOCAL_UNIT_IDS.includes(u.id)),
  };
}

/** Circuitos por calles ya pedidos, por recogida (evita repetir peticiones al volver). */
const loopCache = new Map<string, { loops: LatLng[][]; source: FleetPlan['source'] }>();
const cacheKey = (c: LatLng) => `${c[0].toFixed(3)},${c[1].toFixed(3)}`;
let pending: { key: string; promise: Promise<FleetPlan | null> } | null = null;

/** ¿Hace falta un plan nuevo para esta recogida? */
export function needsPlan(center: LatLng, current: FleetPlan | null = getFleetPlan()): boolean {
  return !current || haversine(current.center, center) > REUSE_M;
}

/**
 * Plan de flota para una recogida. null si el vigente ya sirve. Nunca rechaza: sin red
 * usa los circuitos incluidos o estimados.
 */
export function buildLocalFleet(center: LatLng, { force = false } = {}): Promise<FleetPlan | null> {
  if (!force && !needsPlan(center)) return Promise.resolve(null);
  const key = cacheKey(center);
  if (pending?.key === key) return pending.promise;
  const promise = (async () => {
    let entry = loopCache.get(key);
    if (!entry) {
      const rnd = seededRandom(Math.abs(Math.round(center[0] * 1e4) * 31 + Math.round(center[1] * 1e4)) || 7);
      const loops: LatLng[][] = [];
      for (const ring of RINGS) {
        const l = await streetLoop(center, ring, rnd);
        if (!l) break;
        loops.push(l);
      }
      if (loops.length === RINGS.length) entry = { loops, source: 'osrm' };
      else {
        const bundled = bundledLoops(center);
        entry = bundled.length ? { loops: bundled, source: 'circuits' } : { loops: RINGS.map((r) => estimatedLoop(center, r, rnd)), source: 'fallback' };
      }
      // Solo se recuerdan los circuitos por calles: sin red, la próxima vez se reintenta.
      if (entry.source === 'osrm') {
        if (loopCache.size > 8) loopCache.delete(loopCache.keys().next().value!);
        loopCache.set(key, entry);
      }
    }
    return planFrom(center, entry.loops, entry.source);
  })().finally(() => {
    if (pending?.key === key) pending = null;
  });
  pending = { key, promise };
  return promise;
}
