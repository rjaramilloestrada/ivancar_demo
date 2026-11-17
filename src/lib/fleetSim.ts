import { LOCAL_DEFAULT_CIRCUIT, LOCAL_UNIT_IDS } from '@/mocks/drivers';
import { patrolRoutes } from '@/mocks/fleetRoutes';
import type { LatLng } from '@/types';
import { cumulativeDistances, poseOnPath, seededRandom, slicePath } from './geo';

/**
 * Reloj único de la flota (pasajero y central).
 *
 * La posición de cada unidad libre depende solo de la hora: `patrolPosition(id, now)`.
 * El mapa del pasajero, el de la central y la asignación ven exactamente el mismo punto,
 * en cualquier pestaña, porque comparten este módulo y el mismo "plan de flota".
 *
 * - Por defecto cada unidad recorre su circuito de `mocks/fleetRoutes.ts` (las unidades de
 *   zona usan el circuito de otra unidad con un desfase).
 * - Cuando el pasajero fija su recogida, `lib/localFleet.ts` arma un plan: circuitos por
 *   calles alrededor de ese punto para las unidades de zona, con un instante de inicio
 *   (`epoch`) y la fase de cada una. El pasajero lo publica por el canal y la central lo
 *   aplica igual: desde ese momento las dos dibujan las unidades en el mismo lugar.
 * - El plan se guarda en sessionStorage: tras recargar, todo sigue donde estaba.
 */

/** Velocidad de patrulla (m/s, ≈ 36 km/h). */
export const PATROL_SPEED_MPS = 10;

export interface FleetPlanUnit {
  id: string;
  /** Índice en `loops`. */
  loop: number;
  /** Fracción del circuito donde está la unidad en `epoch`. */
  phase0: number;
}

export interface FleetPlan {
  id: string;
  /** Inicio del plan (ms de época). */
  epoch: number;
  /** Recogida para la que se armó. */
  center: LatLng;
  /** 'osrm' = circuitos por calles pedidos ahora; 'circuits' = circuitos incluidos; 'fallback' = estimados. */
  source: 'osrm' | 'circuits' | 'fallback';
  loops: LatLng[][];
  units: FleetPlanUnit[];
}

interface Prepared {
  path: LatLng[];
  cum: number[];
  length: number;
  phase0: number;
  epoch: number;
}

const unitSeed = (unitId: string) => seededRandom(parseInt(unitId.replace(/\D/g, ''), 10) || 1)();

/* ------------------------------------------------------------------ Plan actual */

export const FLEET_STORAGE_KEY = 'ivancar-fleet';

let plan: FleetPlan | null = null;
const prepared = new Map<string, Prepared | null>();
const planListeners = new Set<(p: FleetPlan | null) => void>();

function validPlan(p: unknown): p is FleetPlan {
  const x = p as FleetPlan;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.epoch === 'number' &&
    Array.isArray(x.loops) &&
    Array.isArray(x.units) &&
    x.loops.every((l) => Array.isArray(l) && l.length >= 2) &&
    x.units.every((u) => typeof u.id === 'string' && x.loops[u.loop] != null && typeof u.phase0 === 'number')
  );
}

function readStored(): FleetPlan | null {
  try {
    const raw = sessionStorage.getItem(FLEET_STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : null;
    return validPlan(p) ? p : null;
  } catch {
    return null;
  }
}

plan = readStored();

/** Plan de flota vigente (null = circuitos por defecto). */
export function getFleetPlan(): FleetPlan | null {
  return plan;
}

/**
 * Aplica un plan. Ignora uno igual o más viejo que el vigente (llegan por el canal desde
 * varias pestañas). Devuelve true si cambió algo.
 */
export function setFleetPlan(next: FleetPlan | null, { force = false } = {}): boolean {
  if (next && !validPlan(next)) return false;
  if (!force && next && plan && (next.id === plan.id || next.epoch < plan.epoch)) return false;
  plan = next;
  prepared.clear();
  try {
    if (next) sessionStorage.setItem(FLEET_STORAGE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(FLEET_STORAGE_KEY);
  } catch {
    /* sin almacenamiento: queda en memoria */
  }
  for (const fn of [...planListeners]) fn(plan);
  return true;
}

export function onFleetPlan(fn: (p: FleetPlan | null) => void): () => void {
  planListeners.add(fn);
  return () => planListeners.delete(fn);
}

/** ¿La unidad recorre un circuito del plan (unidad de zona alrededor del pasajero)? */
export function inPlan(unitId: string): boolean {
  return !!plan?.units.some((u) => u.id === unitId);
}

/**
 * Unidades que ve el pasajero: las del plan si hay uno; si no, las unidades de zona en sus
 * circuitos por defecto.
 */
export function passengerUnitIds(): string[] {
  return plan ? plan.units.map((u) => u.id) : [...LOCAL_UNIT_IDS];
}

/* ------------------------------------------------------------------ Posiciones */

function prep(unitId: string): Prepared | null {
  let p = prepared.get(unitId);
  if (p !== undefined) return p;
  const pu = plan?.units.find((u) => u.id === unitId);
  if (pu && plan) {
    const path = plan.loops[pu.loop];
    const cum = cumOf(path);
    p = { path, cum, length: cum[cum.length - 1] || 1, phase0: pu.phase0, epoch: plan.epoch };
  } else {
    const borrowed = LOCAL_DEFAULT_CIRCUIT[unitId];
    const route = patrolRoutes[borrowed?.route ?? unitId];
    if (!route || route.path.length < 2) {
      p = null;
    } else {
      const cum = cumOf(route.path);
      p = { path: route.path, cum, length: cum[cum.length - 1] || 1, phase0: (unitSeed(unitId) + (borrowed?.phase ?? 0)) % 1, epoch: 0 };
    }
  }
  prepared.set(unitId, p);
  return p;
}

export interface FleetPose {
  point: LatLng;
  /** Rumbo en grados (0 = norte). */
  bearing: number;
}

function fractionAt(p: Prepared, now: number): number {
  const laps = p.phase0 + ((now - p.epoch) / 1000) * (PATROL_SPEED_MPS / p.length);
  return laps - Math.floor(laps);
}

/** Posición y rumbo de una unidad en patrulla a la hora `now` (ms de época). */
export function patrolPosition(unitId: string, now: number, fallback?: LatLng): FleetPose {
  const p = prep(unitId);
  if (!p) return { point: fallback ?? [0, 0], bearing: 0 };
  return poseOnPath(p.path, fractionAt(p, now), p.cum);
}

/**
 * Tramo del circuito que recorre la unidad entre `t0` y `t1` (t1 ≥ t0), para empalmar
 * su patrulla con la ruta hacia la recogida sin saltos. null si no tiene circuito.
 */
export function patrolSegment(unitId: string, t0: number, t1: number): LatLng[] | null {
  const p = prep(unitId);
  if (!p || t1 <= t0) return null;
  const f0 = fractionAt(p, t0);
  const meters = ((t1 - t0) / 1000) * PATROL_SPEED_MPS;
  const f1 = f0 + meters / p.length;
  if (f1 <= 1) return slicePath(p.path, f0, f1, p.cum);
  // Cruza el cierre del circuito.
  const a = slicePath(p.path, f0, 1, p.cum);
  const b = slicePath(p.path, 0, Math.min(1, f1 - 1), p.cum);
  return [...a, ...b.slice(1)];
}

/* ------------------------------------------------ Avance de un tramo con reloj */

/** Fracción del tiempo de un tramo en que el auto acelera (y, al final, frena). */
const RAMP = 0.08;

/**
 * Avance (0..1) sobre la ruta para una fracción de tiempo `u` (0..1): arranca y frena
 * suave (rampas de `RAMP`) y en medio va a velocidad constante. ETA, kilómetros que faltan
 * y posición del auto usan el mismo valor: bajan juntos y sin saltos.
 */
export function travelProgress(u: number): number {
  const t = Math.min(1, Math.max(0, u));
  const v = 1 / (1 - RAMP);
  if (t < RAMP) return (v * t * t) / (2 * RAMP);
  if (t > 1 - RAMP) return 1 - (v * (1 - t) * (1 - t)) / (2 * RAMP);
  return v * (RAMP / 2 + (t - RAMP));
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

/** Punto y rumbo (estable) a una fracción de la polilínea (con caché de distancias). */
export function poseAlong(path: readonly LatLng[], fraction: number): FleetPose {
  return poseOnPath(path, fraction, cumOf(path));
}
