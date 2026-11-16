/**
 * Tipos de dominio del demo, con la forma de las filas que tendrá Supabase en la Fase 1:
 * ids string, columnas en snake_case, timestamps ISO 8601, coordenadas como `lat`/`lng`.
 * Las funciones de geometría (`lib/geo.ts`) trabajan con tuplas `LatLng` [lat, lng];
 * `toLatLng(row)` convierte una fila a tupla.
 */

/** [lat, lng] en grados decimales (WGS84). Mismo orden que Leaflet. */
export type LatLng = [lat: number, lng: number];

/** Fila con coordenadas. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export type IsoDateTime = string;

/* ------------------------------------------------------------------ Lugares */

export type PlaceCategory =
  | 'airport'
  | 'bus_terminal'
  | 'mall'
  | 'landmark'
  | 'university'
  | 'residential'
  | 'business'
  | 'nature';

export type Zone = 'samborondon' | 'guayaquil' | 'via_costa';

/** Tabla `places` (lugares frecuentes del catálogo). */
export interface Place extends GeoPoint {
  id: string;
  name: string;
  /** Nombre corto para chips y etiquetas ("Aeropuerto"). */
  short_name: string;
  category: PlaceCategory;
  zone: Zone;
  /** Sector o barrio ("La Puntilla", "Kennedy"). */
  sector: string;
  /** Referencia de dirección corta, sin pretender ser exacta. */
  address_hint: string;
  /** 0..1, peso base para ordenar sugerencias. */
  popularity: number;
}

export type SavedPlaceKind = 'home' | 'work' | 'other';

/** Tabla `saved_places` (por usuario). */
export interface SavedPlace extends GeoPoint {
  id: string;
  user_id: string;
  kind: SavedPlaceKind;
  label: string;
  address_hint: string;
  sector: string;
  created_at: IsoDateTime;
}

/** Sector o barrio con su centro aproximado (para la etiqueta local del pin). */
export interface Sector extends GeoPoint {
  id: string;
  name: string;
  /** Ciudad o cantón ("Guayaquil", "Samborondón"). */
  city: string;
  zone: Zone;
  /** Radio aproximado en metros dentro del cual el sector "manda". */
  radius_m: number;
}

/* ---------------------------------------------------------------- Servicios */

export type ServiceId = 'taxi' | 'ejecutivo' | 'suv' | 'camioneta' | 'encomiendas' | 'por_horas';

export type PricingMode = 'distance' | 'hourly';

/** Tabla `services`. */
export interface Service {
  id: ServiceId;
  name: string;
  description: string;
  /** Pasajeros (0 para encomiendas). */
  capacity: number;
  /** Texto corto de capacidad ("4 pasajeros", "Paquetes hasta 20 kg"). */
  capacity_label: string;
  pricing_mode: PricingMode;
  /** Multiplicador sobre la tarifa base de demo (modo distancia). */
  price_factor: number;
  /** USD por hora (solo modo por horas). Valor de ejemplo. */
  hourly_rate: number | null;
  /** Horas mínimas (solo modo por horas). */
  min_hours: number | null;
  /** Minutos de llegada típicos de la unidad, para el demo. */
  pickup_eta_min: number;
  sort_order: number;
  active: boolean;
}

/* --------------------------------------------------------- Flota y choferes */

export type DriverStatus = 'available' | 'busy' | 'offline';

/** Tabla `vehicles`. */
export interface Vehicle {
  id: string;
  /** Formato de placa del Guayas: GSx-xxxx. Ficticia. */
  plate: string;
  make: string;
  model: string;
  year: number;
  color: string;
  color_hex: string;
  service_id: ServiceId;
}

/** Tabla `drivers`. */
export interface Driver extends GeoPoint {
  id: string;
  full_name: string;
  /** Nombre que se muestra al pasajero ("Carlos M."). */
  display_name: string;
  initials: string;
  /** Tono (0..360) del avatar generado. Sin fotos de personas reales. */
  avatar_hue: number;
  rating: number;
  trips_count: number;
  vehicle_id: string;
  status: DriverStatus;
  /** Rumbo en grados (0 = norte). */
  heading: number;
  joined_at: IsoDateTime;
  updated_at: IsoDateTime;
}

/** Vista `fleet_units`: chofer + vehículo, lo que consumen el mapa y la central. */
export interface FleetUnit extends Driver {
  vehicle: Vehicle;
}

/* ------------------------------------------------------------------ Pedidos */

export type RideStatus =
  | 'requested'
  | 'assigned'
  | 'en_route'
  | 'arrived'
  | 'in_trip'
  | 'completed'
  | 'cancelled';

export type PaymentMethod = 'cash' | 'card' | 'voucher';

/** Tabla `rides`. */
export interface Ride {
  id: string;
  created_at: IsoDateTime;
  updated_at: IsoDateTime;
  status: RideStatus;
  service_id: ServiceId;
  payment_method: PaymentMethod;
  pickup_lat: number;
  pickup_lng: number;
  pickup_label: string;
  dropoff_lat: number;
  dropoff_lng: number;
  dropoff_label: string;
  /** Distancia y duración estimadas de la ruta. */
  distance_m: number;
  duration_s: number;
  /** Tarifa referencial de demo en USD (no es tarifa real). */
  fare_estimate_usd: number;
  fare_final_usd: number | null;
  driver_id: string | null;
  vehicle_id: string | null;
  assigned_at: IsoDateTime | null;
  completed_at: IsoDateTime | null;
  cancelled_at: IsoDateTime | null;
  scheduled_for: IsoDateTime | null;
  note: string | null;
  passenger_name: string | null;
  rating: number | null;
  tip_usd: number | null;
}

/** Fila de historial: un viaje terminado con su ruta simplificada para el mini mapa. */
export interface TripHistoryItem extends Ride {
  status: 'completed';
  /** Polilínea simplificada [lat, lng][] (para SVG estático, sin Leaflet). */
  route: LatLng[];
  driver_display_name: string;
  vehicle_plate: string;
}

export function toLatLng(p: GeoPoint): LatLng {
  return [p.lat, p.lng];
}
