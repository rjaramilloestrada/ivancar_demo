import { estimateFare } from '@/lib/pricing';
import type { LatLng, ServiceId, TripHistoryItem } from '@/types';
import { fleetById } from './drivers';
import { placesById, savedPlaces } from './places';
import { servicesById } from './services';

/**
 * Historial simulado del pasajero demo (P9). Viajes ficticios con rutas reales
 * simplificadas (OSRM sobre OpenStreetMap, ~20 m) para dibujar mini mapas en SVG.
 * Las fechas son relativas a hoy (ver `ago`). Totales calculados con la tarifa referencial de demo (no son precios reales).
 */
const ROUTE_01: LatLng[] = [[-2.14776,-79.86952],[-2.14875,-79.86946],[-2.14865,-79.86704],[-2.14893,-79.8654],[-2.14932,-79.86546],[-2.14934,-79.8661],[-2.1496,-79.86484],[-2.15083,-79.86516],[-2.15136,-79.86626],[-2.1522,-79.86707],[-2.15438,-79.87688],[-2.15531,-79.87969],[-2.15582,-79.88019],[-2.15855,-79.88047],[-2.16825,-79.87993],[-2.17031,-79.88003],[-2.17059,-79.88058],[-2.17101,-79.89132],[-2.17036,-79.89169],[-2.16479,-79.89188],[-2.15942,-79.88889],[-2.15933,-79.88829],[-2.15993,-79.88722],[-2.15775,-79.88601],[-2.1574,-79.8836]];
const ROUTE_02: LatLng[] = [[-2.16031,-79.89951],[-2.16032,-79.89979],[-2.15978,-79.8998],[-2.15787,-79.89922],[-2.15818,-79.89823],[-2.15556,-79.89571],[-2.15005,-79.89231],[-2.14918,-79.89215],[-2.14789,-79.89288],[-2.14634,-79.8896],[-2.14436,-79.88699],[-2.14498,-79.88625],[-2.14544,-79.8849],[-2.1442,-79.88425],[-2.14013,-79.88229],[-2.13764,-79.88165],[-2.12772,-79.88225],[-2.12698,-79.88208],[-2.12545,-79.87181],[-2.12188,-79.86574],[-2.12138,-79.86575],[-2.1189,-79.86703],[-2.11241,-79.87069],[-2.11045,-79.87142],[-2.10026,-79.87378],[-2.0926,-79.87373],[-2.09833,-79.87409]];
const ROUTE_03: LatLng[] = [[-2.19382,-79.88009],[-2.18966,-79.87874],[-2.18424,-79.87614],[-2.1792,-79.87829],[-2.1751,-79.87887],[-2.17386,-79.87939],[-2.15943,-79.88024],[-2.15766,-79.88005],[-2.1558,-79.87912],[-2.15492,-79.8779],[-2.15284,-79.86943],[-2.15252,-79.86734],[-2.15301,-79.86466],[-2.15332,-79.86427],[-2.15389,-79.8644],[-2.15397,-79.86503],[-2.1534,-79.86532],[-2.1479,-79.86446],[-2.14943,-79.86481],[-2.14932,-79.86546],[-2.14893,-79.8654],[-2.14865,-79.86704],[-2.14875,-79.86946],[-2.14776,-79.86952]];
const ROUTE_04: LatLng[] = [[-2.14776,-79.86952],[-2.14875,-79.86946],[-2.14865,-79.86704],[-2.14893,-79.8654],[-2.14932,-79.86546],[-2.14934,-79.8661],[-2.1496,-79.86484],[-2.15083,-79.86516],[-2.15136,-79.86626],[-2.15224,-79.86718],[-2.15438,-79.87688],[-2.15526,-79.87958],[-2.15582,-79.88019],[-2.15855,-79.88047],[-2.16987,-79.87988],[-2.17054,-79.88038],[-2.17125,-79.89303],[-2.17123,-79.89741],[-2.17075,-79.89845],[-2.16729,-79.90289],[-2.16665,-79.9053],[-2.16701,-79.90561],[-2.16667,-79.90659],[-2.16722,-79.90725],[-2.16748,-79.90708],[-2.16791,-79.90756],[-2.17363,-79.9146],[-2.16838,-79.92025],[-2.1643,-79.92376],[-2.16262,-79.92471],[-2.16198,-79.92601],[-2.16231,-79.9271],[-2.16215,-79.92881],[-2.16272,-79.93053],[-2.16491,-79.93319],[-2.1692,-79.93726],[-2.17615,-79.94283],[-2.17582,-79.94296],[-2.1762,-79.94325]];
const ROUTE_05: LatLng[] = [[-2.14288,-79.87962],[-2.14261,-79.87884],[-2.14322,-79.87862],[-2.14395,-79.88036],[-2.14434,-79.88042],[-2.14446,-79.8801],[-2.14349,-79.8778],[-2.14614,-79.87676],[-2.14823,-79.8765],[-2.15151,-79.87729],[-2.15489,-79.8799],[-2.15666,-79.88047],[-2.16987,-79.87988],[-2.17036,-79.88008],[-2.17059,-79.88058],[-2.17109,-79.88975],[-2.17125,-79.89724],[-2.17075,-79.89845],[-2.16729,-79.90289],[-2.16665,-79.9053],[-2.16701,-79.90561],[-2.16667,-79.90659],[-2.16722,-79.90725],[-2.16748,-79.90708],[-2.16972,-79.90973],[-2.16851,-79.91043],[-2.1685,-79.9104]];
const ROUTE_06: LatLng[] = [[-2.09833,-79.87409],[-2.10222,-79.8737],[-2.1111,-79.87154],[-2.11365,-79.87035],[-2.12582,-79.86341],[-2.12734,-79.86298],[-2.13801,-79.86353],[-2.1388,-79.86516],[-2.14078,-79.86525],[-2.14244,-79.86586],[-2.14275,-79.86776],[-2.14403,-79.86718],[-2.14533,-79.86704],[-2.1455,-79.86966],[-2.14776,-79.86952]];

const casa = savedPlaces[0];
const oficina = savedPlaces[1];
const p = placesById;
const at = (label: string, g: { lat: number; lng: number }) => ({ label, lat: g.lat, lng: g.lng });

/**
 * Fecha relativa a hoy, en hora de Guayaquil (UTC-5, sin horario de verano): hace `days`
 * días a las `hhmm`. Así "Ayer", "Hace 2 días" y "la semana pasada" siempre cuadran.
 */
export function ago(days: number, hhmm: string, now: number = Date.now()): string {
  const local = new Date(now - 5 * 3_600_000 - days * 86_400_000);
  const day = local.toISOString().slice(0, 10);
  return `${day}T${hhmm}:00-05:00`;
}

interface Seed {
  id: string;
  completed_at: string;
  minutes: number;
  service_id: ServiceId;
  payment_method: TripHistoryItem['payment_method'];
  from: { label: string; lat: number; lng: number };
  to: { label: string; lat: number; lng: number };
  distance_m: number;
  driver_id: string;
  route: LatLng[];
  rating: number;
  tip_usd: number | null;
}

const seeds: Seed[] = [
  { id: 'ride-h01', completed_at: ago(1, '05:12'), minutes: 14, service_id: 'ejecutivo', payment_method: 'card', from: at(casa.label, casa), to: at(p['plc-aeropuerto'].short_name, p['plc-aeropuerto']), distance_m: 7770, driver_id: 'drv-07', route: ROUTE_01, rating: 5, tip_usd: 1 },
  { id: 'ride-h02', completed_at: ago(2, '18:40'), minutes: 17, service_id: 'taxi', payment_method: 'cash', from: at(oficina.label, oficina), to: at(p['plc-plaza-lagos'].short_name, p['plc-plaza-lagos']), distance_m: 10995, driver_id: 'drv-01', route: ROUTE_02, rating: 5, tip_usd: null },
  { id: 'ride-h03', completed_at: ago(6, '21:05'), minutes: 14, service_id: 'taxi', payment_method: 'cash', from: at(p['plc-malecon'].short_name, p['plc-malecon']), to: at(casa.label, casa), distance_m: 7833, driver_id: 'drv-06', route: ROUTE_03, rating: 4, tip_usd: null },
  { id: 'ride-h04', completed_at: ago(8, '13:25'), minutes: 24, service_id: 'suv', payment_method: 'voucher', from: at(casa.label, casa), to: at(p['plc-riocentro-ceibos'].short_name, p['plc-riocentro-ceibos']), distance_m: 13251, driver_id: 'drv-04', route: ROUTE_04, rating: 5, tip_usd: 2 },
  { id: 'ride-h05', completed_at: ago(12, '07:50'), minutes: 15, service_id: 'taxi', payment_method: 'cash', from: at(p['plc-terminal'].short_name, p['plc-terminal']), to: at(p['plc-urdesa'].short_name, p['plc-urdesa']), distance_m: 7710, driver_id: 'drv-08', route: ROUTE_05, rating: 5, tip_usd: null },
  { id: 'ride-h06', completed_at: ago(16, '16:15'), minutes: 10, service_id: 'ejecutivo', payment_method: 'card', from: at(p['plc-plaza-lagos'].short_name, p['plc-plaza-lagos']), to: at(casa.label, casa), distance_m: 6348, driver_id: 'drv-03', route: ROUTE_06, rating: 5, tip_usd: 1 },
];

function shift(iso: string, minutes: number): string {
  // Mantiene el offset -05:00 de Guayaquil en el texto.
  const d = new Date(new Date(iso).getTime() + minutes * 60_000 - 5 * 3_600_000);
  return d.toISOString().replace('Z', '-05:00').replace(/\.\d{3}/, '');
}

/** Viajes pasados, del más reciente al más antiguo. */
export const tripHistory: TripHistoryItem[] = seeds.map((s) => {
  const unit = fleetById[s.driver_id];
  const fare = estimateFare(servicesById[s.service_id], s.distance_m).amount;
  const created = shift(s.completed_at, -(s.minutes + 6));
  return {
    id: s.id,
    created_at: created,
    updated_at: s.completed_at,
    status: 'completed',
    service_id: s.service_id,
    payment_method: s.payment_method,
    pickup_lat: s.from.lat,
    pickup_lng: s.from.lng,
    pickup_label: s.from.label,
    dropoff_lat: s.to.lat,
    dropoff_lng: s.to.lng,
    dropoff_label: s.to.label,
    distance_m: s.distance_m,
    duration_s: s.minutes * 60,
    fare_estimate_usd: fare,
    fare_final_usd: fare,
    driver_id: s.driver_id,
    vehicle_id: unit.vehicle_id,
    assigned_at: shift(s.completed_at, -(s.minutes + 5)),
    completed_at: s.completed_at,
    cancelled_at: null,
    scheduled_for: null,
    note: null,
    passenger_name: null,
    rating: s.rating,
    tip_usd: s.tip_usd,
    route: s.route,
    driver_display_name: unit.display_name,
    vehicle_plate: unit.vehicle.plate,
  };
});
