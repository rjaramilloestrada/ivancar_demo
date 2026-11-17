import { fleet, fleetById } from '@/mocks/drivers';
import type { FleetUnit, LatLng, ServiceId } from '@/types';
import { passengerUnitIds, patrolPosition, patrolSegment } from './fleetSim';
import { haversine, pathLength } from './geo';
import { estimateRoute, getRoute, ROAD_FACTOR, URBAN_SPEED_KMH, type Route } from './routing';

/**
 * Asignación simulada (sin central): qué unidad va y por dónde llega.
 * Las posiciones salen del reloj de flota (`fleetSim`): la unidad asignada es una de las que
 * el pasajero veía y arranca desde donde estaba en ese instante.
 */

/** Tipos de vehículo que pueden atender cada servicio, en orden de preferencia. */
export const COMPATIBLE: Record<ServiceId, ServiceId[]> = {
  taxi: ['taxi'],
  ejecutivo: ['ejecutivo'],
  suv: ['suv'],
  camioneta: ['camioneta'],
  encomiendas: ['encomiendas', 'taxi'],
  por_horas: ['ejecutivo', 'taxi'],
};

/** La unidad con su posición y rumbo a la hora `now` (reloj de flota). */
export function unitNow(unit: FleetUnit, now = Date.now()): FleetUnit {
  const pose = patrolPosition(unit.id, now, [unit.lat, unit.lng]);
  return { ...unit, lat: pose.point[0], lng: pose.point[1], heading: Math.round(pose.bearing), updated_at: new Date(now).toISOString() };
}

/** Unidades disponibles que ve el pasajero, con su posición a la hora `now`. */
export function visibleUnits(now = Date.now()): FleetUnit[] {
  return passengerUnitIds()
    .map((id) => fleetById[id])
    .filter((u): u is FleetUnit => !!u && u.status === 'available')
    .map((u) => unitNow(u, now));
}

/**
 * Unidad disponible más cercana del tipo correcto entre las que ve el pasajero (posición a
 * la hora `now`). Si no hay de ese tipo, la del siguiente tipo compatible; como último
 * recurso, cualquier disponible (también de la flota general).
 */
export function pickUnit(
  serviceId: ServiceId,
  pickup: LatLng,
  { now = Date.now(), units, exclude = [] as string[] }: { now?: number; units?: FleetUnit[]; exclude?: string[] } = {},
): FleetUnit | null {
  const pool = (units ?? visibleUnits(now)).filter((u) => u.status === 'available' && !exclude.includes(u.id));
  const byDistance = (list: FleetUnit[]) =>
    list
      .map((u) => ({ u, d: haversine(pickup, [u.lat, u.lng]) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.u);
  for (const type of COMPATIBLE[serviceId]) {
    const hit = byDistance(pool.filter((u) => u.vehicle.service_id === type))[0];
    if (hit) return hit;
  }
  if (pool.length) return byDistance(pool)[0];
  if (units) return null;
  const rest = fleet.filter((u) => u.status === 'available' && !exclude.includes(u.id)).map((u) => unitNow(u, now));
  return byDistance(rest)[0] ?? null;
}

/** Minutos estimados de llegada de una unidad (sin red), mínimo 2. */
export function estimatePickupMinutes(unit: FleetUnit | null, pickup: LatLng): number {
  if (!unit) return 8;
  const d = haversine(pickup, [unit.lat, unit.lng]) * ROAD_FACTOR;
  return Math.max(2, Math.round(d / ((URBAN_SPEED_KMH * 1000) / 60)));
}

/** Ruta de llegada preparada para empezar a la hora `at`, desde donde estará la unidad. */
export interface PlannedApproach {
  unitId: string;
  at: number;
  route: Route;
}

/**
 * Ruta de la unidad hasta la recogida, desde el punto en que estará a la hora `at` y con
 * su rumbo (sale hacia donde ya iba). `endBearing`: rumbo de llegada (el de salida del
 * viaje, para no girar en el lugar al empezarlo). Intenta OSRM con un tope corto y, si no llega a
 * tiempo, usa la estimada: nunca espera más de `timeoutMs`.
 */
export async function planApproach(
  unit: FleetUnit,
  pickup: LatLng,
  { at = Date.now(), timeoutMs = 1600, endBearing }: { at?: number; timeoutMs?: number; endBearing?: number } = {},
): Promise<PlannedApproach> {
  const pose = patrolPosition(unit.id, at, [unit.lat, unit.lng]);
  let route: Route;
  try {
    route = await getRoute(pose.point, pickup, { timeoutMs, startBearing: pose.bearing, endBearing });
  } catch {
    route = estimateRoute(pose.point, pickup);
  }
  return { unitId: unit.id, at, route };
}

/** Holgura para usar una ruta preparada aunque la asignación llegue un poco tarde (ms). */
const LATE_OK_MS = 1_500;

/**
 * Ruta de llegada definitiva al asignar a la hora `now`: la preparada, empalmada con el
 * tramo de patrulla que la unidad recorre entre `now` y `at` (así arranca desde donde se
 * veía, sin saltos). null si la preparada ya no sirve (la asignación llegó tarde).
 */
export function approachAt(planned: PlannedApproach, now = Date.now()): Route | null {
  if (now > planned.at + LATE_OK_MS) return null;
  const lead = now < planned.at ? patrolSegment(planned.unitId, now, planned.at) : null;
  if (!lead || lead.length < 2) return planned.route;
  const extra = pathLength(lead);
  return {
    ...planned.route,
    path: [...lead, ...planned.route.path],
    distance_m: Math.round(planned.route.distance_m + extra),
    duration_s: Math.round(planned.route.duration_s + extra / 8),
  };
}

/** Atajo: prepara y empalma la ruta de llegada para asignar ya. */
export async function buildApproach(unit: FleetUnit, pickup: LatLng, timeoutMs = 1600): Promise<Route> {
  // Se pide desde donde estará la unidad cuando la respuesta llegue (como mucho `timeoutMs`).
  const now = Date.now();
  const planned = await planApproach(unit, pickup, { at: now + Math.min(timeoutMs, 900), timeoutMs });
  return approachAt(planned, Date.now()) ?? (await planApproach(unit, pickup, { at: Date.now(), timeoutMs: 600 })).route;
}
