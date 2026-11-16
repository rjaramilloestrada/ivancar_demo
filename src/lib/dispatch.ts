import { fleet } from '@/mocks/drivers';
import type { FleetUnit, LatLng, ServiceId } from '@/types';
import { toLatLng } from '@/types';
import { bearing, destinationPoint, haversine } from './geo';
import { estimateRoute, getRoute, ROAD_FACTOR, URBAN_SPEED_KMH, type Route } from './routing';

/**
 * Asignación simulada (sin central): qué unidad va y por dónde llega.
 * La central del Bloque 4 puede usar las mismas funciones para su autoasignación.
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

/**
 * Unidad disponible más cercana del tipo correcto. Si no hay de ese tipo, la del
 * siguiente tipo compatible; como último recurso, cualquier disponible.
 */
export function pickUnit(
  serviceId: ServiceId,
  pickup: LatLng,
  { units = fleet, exclude = [] as string[] } = {},
): FleetUnit | null {
  const free = units.filter((u) => u.status === 'available' && !exclude.includes(u.id));
  const byDistance = (list: FleetUnit[]) =>
    list
      .map((u) => ({ u, d: haversine(pickup, toLatLng(u)) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.u);
  for (const type of COMPATIBLE[serviceId]) {
    const hit = byDistance(free.filter((u) => u.vehicle.service_id === type))[0];
    if (hit) return hit;
  }
  return byDistance(free)[0] ?? null;
}

/** Radio dentro del cual la unidad arranca desde su posición real (m). */
const NEAR_MAX_M = 3_200;
/** Distancia mínima del arranque, para que la llegada se vea (m). */
const NEAR_MIN_M = 900;

/**
 * Punto de partida de la unidad hacia la recogida: su posición si está a una distancia
 * razonable; si no, un punto en su dirección a 0,9–3,2 km (la demo no usa unidades a
 * 15 km ni encima del pasajero).
 */
export function approachStart(unit: FleetUnit, pickup: LatLng): LatLng {
  const pos = toLatLng(unit);
  const d = haversine(pickup, pos);
  if (d >= NEAR_MIN_M && d <= NEAR_MAX_M) return pos;
  const dir = d < 1 ? 35 : bearing(pickup, pos);
  return destinationPoint(pickup, dir, d < NEAR_MIN_M ? 1_300 : 2_400);
}

/** Minutos estimados de llegada de una unidad (sin red), mínimo 2. */
export function estimatePickupMinutes(unit: FleetUnit | null, pickup: LatLng): number {
  if (!unit) return 8;
  const d = haversine(pickup, approachStart(unit, pickup)) * ROAD_FACTOR;
  return Math.max(2, Math.round(d / ((URBAN_SPEED_KMH * 1000) / 60)));
}

/**
 * Ruta de la unidad hasta la recogida. Intenta OSRM con un tope corto y, si no llega a
 * tiempo, usa la estimada: la asignación nunca espera más de `timeoutMs`.
 */
export async function buildApproach(unit: FleetUnit, pickup: LatLng, timeoutMs = 1600): Promise<Route> {
  const from = approachStart(unit, pickup);
  try {
    return await getRoute(from, pickup, { timeoutMs });
  } catch {
    return estimateRoute(from, pickup);
  }
}
