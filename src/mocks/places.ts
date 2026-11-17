import type { Place, PlaceCategory, SavedPlace, Sector } from '@/types';

/**
 * Lugares frecuentes (catálogo de demo). Coordenadas aproximadas, verificadas contra
 * OpenStreetMap (Nominatim, nov-2026): cada punto cae en tierra, sobre o junto al lugar.
 * Revisadas por nombre contra Nominatim: ninguna se desvía más de ~70 m (el aeropuerto va en
 * la terminal de pasajeros y Urdesa sobre la Av. Víctor Emilio Estrada).
 * Las referencias de dirección son orientativas.
 */
export const places: Place[] = [
  // Transporte
  {
    id: 'plc-aeropuerto',
    name: 'Aeropuerto José Joaquín de Olmedo',
    short_name: 'Aeropuerto',
    category: 'airport',
    zone: 'guayaquil',
    sector: 'Garzota',
    address_hint: 'Av. de las Américas',
    lat: -2.1574,
    lng: -79.8836,
    popularity: 1,
  },
  {
    id: 'plc-terminal',
    name: 'Terminal Terrestre de Guayaquil',
    short_name: 'Terminal Terrestre',
    category: 'bus_terminal',
    zone: 'guayaquil',
    sector: 'Garzota',
    address_hint: 'Av. Benjamín Rosales',
    lat: -2.14316,
    lng: -79.87951,
    popularity: 0.85,
  },
  // Samborondón y La Puntilla
  {
    id: 'plc-plaza-lagos',
    name: 'Plaza Lagos',
    short_name: 'Plaza Lagos',
    category: 'mall',
    zone: 'samborondon',
    sector: 'Samborondón',
    address_hint: 'Km 6,5 Av. Samborondón',
    lat: -2.09832,
    lng: -79.87466,
    popularity: 0.8,
  },
  {
    id: 'plc-las-terrazas',
    name: 'C.C. Las Terrazas',
    short_name: 'Las Terrazas',
    category: 'mall',
    zone: 'samborondon',
    sector: 'La Puntilla',
    address_hint: 'Av. Samborondón',
    lat: -2.14183,
    lng: -79.86587,
    popularity: 0.65,
  },
  {
    id: 'plc-xima',
    name: 'Xima',
    short_name: 'Xima',
    category: 'mall',
    zone: 'samborondon',
    sector: 'La Puntilla',
    address_hint: 'Calle Monseñor Enrique Julhes',
    lat: -2.13878,
    lng: -79.86567,
    popularity: 0.6,
  },
  {
    id: 'plc-plaza-navona',
    name: 'Plaza Navona',
    short_name: 'Plaza Navona',
    category: 'mall',
    zone: 'samborondon',
    sector: 'Samborondón',
    address_hint: 'Av. Samborondón',
    lat: -2.11187,
    lng: -79.87233,
    popularity: 0.55,
  },
  {
    id: 'plc-uees',
    name: 'Universidad Espíritu Santo (UEES)',
    short_name: 'UEES',
    category: 'university',
    zone: 'samborondon',
    sector: 'La Puntilla',
    address_hint: 'Km 2,5 Av. Samborondón',
    lat: -2.13232,
    lng: -79.86592,
    popularity: 0.5,
  },
  {
    id: 'plc-parque-historico',
    name: 'Parque Histórico Guayaquil',
    short_name: 'Parque Histórico',
    category: 'landmark',
    zone: 'samborondon',
    sector: 'Entre Ríos',
    address_hint: 'Av. Río Guayas',
    lat: -2.14447,
    lng: -79.86798,
    popularity: 0.45,
  },
  // Guayaquil
  {
    id: 'plc-malecon',
    name: 'Malecón 2000',
    short_name: 'Malecón 2000',
    category: 'landmark',
    zone: 'guayaquil',
    sector: 'Centro',
    address_hint: 'Malecón Simón Bolívar, junto a La Rotonda',
    lat: -2.1939,
    lng: -79.8798,
    popularity: 0.75,
  },
  {
    id: 'plc-parque-seminario',
    name: 'Parque Seminario (de las Iguanas)',
    short_name: 'Parque Seminario',
    category: 'landmark',
    zone: 'guayaquil',
    sector: 'Centro',
    address_hint: 'Chile y Clemente Ballén',
    lat: -2.19467,
    lng: -79.88318,
    popularity: 0.4,
  },
  {
    id: 'plc-puerto-santa-ana',
    name: 'Puerto Santa Ana',
    short_name: 'Puerto Santa Ana',
    category: 'landmark',
    zone: 'guayaquil',
    sector: 'Las Peñas',
    address_hint: 'Junto al cerro Santa Ana',
    lat: -2.17771,
    lng: -79.87717,
    popularity: 0.45,
  },
  {
    id: 'plc-mall-del-sol',
    name: 'Mall del Sol',
    short_name: 'Mall del Sol',
    category: 'mall',
    zone: 'guayaquil',
    sector: 'Kennedy Norte',
    address_hint: 'Av. Juan Tanca Marengo',
    lat: -2.15504,
    lng: -79.89269,
    popularity: 0.7,
  },
  {
    id: 'plc-san-marino',
    name: 'San Marino Shopping',
    short_name: 'San Marino',
    category: 'mall',
    zone: 'guayaquil',
    sector: 'Kennedy',
    address_hint: 'Av. Francisco de Orellana',
    lat: -2.16914,
    lng: -79.89827,
    popularity: 0.6,
  },
  {
    id: 'plc-policentro',
    name: 'Policentro',
    short_name: 'Policentro',
    category: 'mall',
    zone: 'guayaquil',
    sector: 'Kennedy',
    address_hint: 'Av. San Jorge',
    lat: -2.17088,
    lng: -79.90021,
    popularity: 0.5,
  },
  {
    id: 'plc-urdesa',
    name: 'Urdesa · Av. Víctor Emilio Estrada',
    short_name: 'Urdesa',
    category: 'business',
    zone: 'guayaquil',
    sector: 'Urdesa',
    address_hint: 'Zona de restaurantes',
    lat: -2.1685,
    lng: -79.9104,
    popularity: 0.55,
  },
  {
    id: 'plc-city-mall',
    name: 'City Mall',
    short_name: 'City Mall',
    category: 'mall',
    zone: 'guayaquil',
    sector: 'Alborada',
    address_hint: 'Av. Benjamín Carrión',
    lat: -2.14091,
    lng: -79.90944,
    popularity: 0.45,
  },
  {
    id: 'plc-riocentro-ceibos',
    name: 'Riocentro Los Ceibos',
    short_name: 'Riocentro Ceibos',
    category: 'mall',
    zone: 'guayaquil',
    sector: 'Los Ceibos',
    address_hint: 'Av. del Bombero',
    lat: -2.17581,
    lng: -79.94377,
    popularity: 0.55,
  },
  // Vía a la Costa
  {
    id: 'plc-puerto-azul',
    name: 'Puerto Azul',
    short_name: 'Puerto Azul',
    category: 'residential',
    zone: 'via_costa',
    sector: 'Vía a la Costa',
    address_hint: 'Km 10,5 Vía a la Costa',
    lat: -2.19063,
    lng: -79.96757,
    popularity: 0.5,
  },
  {
    id: 'plc-cerro-blanco',
    name: 'Bosque Protector Cerro Blanco',
    short_name: 'Cerro Blanco',
    category: 'nature',
    zone: 'via_costa',
    sector: 'Vía a la Costa',
    address_hint: 'Km 16 Vía a la Costa',
    lat: -2.18542,
    lng: -80.01776,
    popularity: 0.4,
  },
];

export const placesById: Record<string, Place> = Object.fromEntries(places.map((p) => [p.id, p]));

/**
 * Lugares guardados de ejemplo del pasajero demo. Ficticios: no corresponden a nadie.
 */
export const savedPlaces: SavedPlace[] = [
  {
    id: 'sav-casa',
    user_id: 'usr-demo',
    kind: 'home',
    label: 'Casa',
    address_hint: 'Cdla. Entre Ríos',
    sector: 'Entre Ríos',
    lat: -2.1478,
    lng: -79.8702,
    created_at: '2026-09-02T14:10:00-05:00',
  },
  {
    id: 'sav-oficina',
    user_id: 'usr-demo',
    kind: 'work',
    label: 'Oficina',
    address_hint: 'Kennedy Norte',
    sector: 'Kennedy Norte',
    lat: -2.1605,
    lng: -79.8995,
    created_at: '2026-09-02T14:12:00-05:00',
  },
];

/**
 * Sectores con centro aproximado (OSM) para la etiqueta local del pin.
 * El radio es orientativo: el sector más cercano dentro de su radio gana.
 */
export const sectors: Sector[] = [
  { id: 'sec-puntilla', name: 'La Puntilla', city: 'Samborondón', zone: 'samborondon', lat: -2.1440, lng: -79.8650, radius_m: 1500 },
  { id: 'sec-entre-rios', name: 'Entre Ríos', city: 'Samborondón', zone: 'samborondon', lat: -2.1489, lng: -79.8694, radius_m: 700 },
  { id: 'sec-samborondon', name: 'Samborondón', city: 'Samborondón', zone: 'samborondon', lat: -2.1050, lng: -79.8720, radius_m: 3500 },
  { id: 'sec-celeste', name: 'Ciudad Celeste', city: 'Samborondón', zone: 'samborondon', lat: -2.0563, lng: -79.8509, radius_m: 2000 },
  { id: 'sec-mocoli', name: 'Isla Mocolí', city: 'Samborondón', zone: 'samborondon', lat: -2.1044, lng: -79.8617, radius_m: 900 },
  { id: 'sec-centro', name: 'Centro', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1931, lng: -79.8827, radius_m: 1400 },
  { id: 'sec-penas', name: 'Las Peñas', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1817, lng: -79.8754, radius_m: 700 },
  { id: 'sec-kennedy', name: 'Kennedy', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1668, lng: -79.8966, radius_m: 1000 },
  { id: 'sec-kennedy-norte', name: 'Kennedy Norte', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1580, lng: -79.8960, radius_m: 1100 },
  { id: 'sec-urdesa', name: 'Urdesa', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1660, lng: -79.9090, radius_m: 1100 },
  { id: 'sec-garzota', name: 'Garzota', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1450, lng: -79.8860, radius_m: 1200 },
  { id: 'sec-alborada', name: 'Alborada', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1364, lng: -79.8974, radius_m: 1300 },
  { id: 'sec-sauces', name: 'Sauces', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1260, lng: -79.8950, radius_m: 1200 },
  { id: 'sec-samanes', name: 'Samanes', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1115, lng: -79.9009, radius_m: 1500 },
  { id: 'sec-bellavista', name: 'Bellavista', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1787, lng: -79.9134, radius_m: 900 },
  { id: 'sec-ceibos', name: 'Los Ceibos', city: 'Guayaquil', zone: 'guayaquil', lat: -2.1700, lng: -79.9420, radius_m: 1600 },
  { id: 'sec-puerto-azul', name: 'Puerto Azul', city: 'Vía a la Costa', zone: 'via_costa', lat: -2.1880, lng: -79.9650, radius_m: 1600 },
  { id: 'sec-duran', name: 'Durán', city: 'Durán', zone: 'guayaquil', lat: -2.1720, lng: -79.8330, radius_m: 2500 },
  { id: 'sec-via-costa', name: 'Vía a la Costa', city: 'Guayaquil', zone: 'via_costa', lat: -2.1850, lng: -80.0000, radius_m: 6000 },
];

/* ------------------------------------------------------------- Sugerencias */

const MALLS_SAMBO = new Set(['plc-plaza-lagos', 'plc-las-terrazas', 'plc-xima', 'plc-plaza-navona']);

/**
 * Ordena lugares frecuentes según la hora y el día (PLAN_IVANCAR.md §7.5):
 * - Madrugada (0–5 h): aeropuerto y terminal primero.
 * - Mañana laborable (6–10 h): universidad, zonas de oficinas, aeropuerto.
 * - Tarde (15–21 h): centros comerciales de Samborondón.
 * - Fin de semana de día (sáb–dom, 7–17 h): Vía a la Costa y paseos.
 * Devuelve una copia ordenada; empates por popularidad.
 */
export function suggestPlaces(date: Date = new Date(), limit = 6): Place[] {
  const h = date.getHours();
  const day = date.getDay(); // 0 = domingo
  const weekend = day === 0 || day === 6;

  const boost = (p: Place): number => {
    let s = p.popularity;
    const cat: PlaceCategory = p.category;
    if (h < 5 || h >= 23) {
      if (cat === 'airport') s += 2;
      if (cat === 'bus_terminal') s += 1.4;
    } else if (h < 6) {
      if (cat === 'airport') s += 2;
      if (cat === 'bus_terminal') s += 1.2;
    }
    if (!weekend && h >= 6 && h < 11) {
      if (cat === 'university' || cat === 'business') s += 1;
      if (cat === 'airport') s += 0.6;
    }
    if (h >= 15 && h < 22) {
      if (MALLS_SAMBO.has(p.id)) s += 1.3;
      else if (cat === 'mall') s += 0.5;
    }
    if (weekend && h >= 7 && h < 18) {
      if (p.zone === 'via_costa') s += 1.5;
      if (cat === 'landmark' || cat === 'nature') s += 0.5;
    }
    return s;
  };

  return places
    .map((p) => ({ p, s: boost(p) }))
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}
