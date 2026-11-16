import type { LatLng, PaymentMethod, ServiceId } from '@/types';
import { tripHistory } from './history';
import { savedPlaces } from './places';

/**
 * Actividad simulada de la central (Bloque 4): recorridos para los pedidos sembrados.
 *
 * Se reutilizan las rutas reales simplificadas del historial de ejemplo (OSRM sobre
 * OpenStreetMap), en ambos sentidos, para que las unidades de los pedidos simulados
 * vayan por calles. Los lugares guardados del pasajero demo ("Casa", "Oficina") se
 * muestran con su sector: en la central no tienen sentido como nombre.
 * Todo es ficticio: no son pedidos ni clientes reales de IVANCAR.
 */
export interface SeedTrip {
  pickup: { label: string; lat: number; lng: number };
  dropoff: { label: string; lat: number; lng: number };
  path: LatLng[];
  distance_m: number;
  /** Duración creíble del viaje (s), para la ETA mostrada. */
  duration_s: number;
}

const relabel = (label: string) => savedPlaces.find((s) => s.label === label)?.address_hint ?? label;

const forward: SeedTrip[] = tripHistory.map((t) => ({
  pickup: { label: relabel(t.pickup_label), lat: t.pickup_lat, lng: t.pickup_lng },
  dropoff: { label: relabel(t.dropoff_label), lat: t.dropoff_lat, lng: t.dropoff_lng },
  path: t.route,
  distance_m: t.distance_m,
  duration_s: t.duration_s,
}));

/** 12 recorridos: los 6 del historial y sus inversos. */
export const seedTrips: SeedTrip[] = [
  ...forward,
  ...forward.map((t) => ({ ...t, pickup: t.dropoff, dropoff: t.pickup, path: [...t.path].reverse() })),
];

/** Mezcla de servicios y pagos de los pedidos simulados (ejemplo, no estadística real). */
export const seedServices: ServiceId[] = ['taxi', 'taxi', 'taxi', 'ejecutivo', 'taxi', 'suv', 'taxi', 'ejecutivo'];
export const seedPayments: PaymentMethod[] = ['cash', 'cash', 'card', 'cash', 'voucher', 'cash', 'card'];
