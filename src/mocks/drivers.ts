import type { Driver, FleetUnit, Vehicle } from '@/types';

/**
 * Conductores y unidades FICTICIOS para el demo. Nombres comunes en Ecuador, placas
 * inventadas con el formato del Guayas (GSx-xxxx), avatares generados (iniciales + tono),
 * sin fotos de personas reales. No representan a la flota de IVANCAR.
 *
 * Posición inicial = primer punto de su recorrido de patrulla (`fleetRoutes.ts`):
 * 5 unidades en Samborondón y La Puntilla, 6 en Guayaquil y 3 en Ceibos y Vía a la Costa.
 */
export const vehicles: Vehicle[] = [
  { id: 'veh-01', plate: 'GSB-4821', make: 'Hyundai', model: 'Accent', year: 2022, color: 'Amarillo', color_hex: '#F6C90E', service_id: 'taxi' },
  { id: 'veh-02', plate: 'GSD-1736', make: 'Kia', model: 'Rio', year: 2023, color: 'Amarillo', color_hex: '#F6C90E', service_id: 'taxi' },
  { id: 'veh-03', plate: 'GSA-9054', make: 'Toyota', model: 'Corolla', year: 2023, color: 'Negro', color_hex: '#1B1B1D', service_id: 'ejecutivo' },
  { id: 'veh-04', plate: 'GSC-3318', make: 'Kia', model: 'Sportage', year: 2022, color: 'Gris plata', color_hex: '#A7ABB2', service_id: 'suv' },
  { id: 'veh-05', plate: 'GSF-6402', make: 'Chevrolet', model: 'D-Max', year: 2021, color: 'Blanco', color_hex: '#EDEDED', service_id: 'camioneta' },
  { id: 'veh-06', plate: 'GSE-2287', make: 'Chevrolet', model: 'Aveo', year: 2021, color: 'Amarillo', color_hex: '#F6C90E', service_id: 'taxi' },
  { id: 'veh-07', plate: 'GSB-7715', make: 'Hyundai', model: 'Elantra', year: 2024, color: 'Gris oscuro', color_hex: '#4A4D52', service_id: 'ejecutivo' },
  { id: 'veh-08', plate: 'GSH-5093', make: 'Nissan', model: 'Sentra', year: 2022, color: 'Amarillo', color_hex: '#F6C90E', service_id: 'taxi' },
  { id: 'veh-09', plate: 'GSD-8160', make: 'Kia', model: 'Soluto', year: 2023, color: 'Amarillo', color_hex: '#F6C90E', service_id: 'encomiendas' },
  { id: 'veh-10', plate: 'GSC-0947', make: 'Hyundai', model: 'Tucson', year: 2023, color: 'Blanco', color_hex: '#EDEDED', service_id: 'suv' },
  { id: 'veh-11', plate: 'GSA-6629', make: 'Chevrolet', model: 'Sail', year: 2022, color: 'Amarillo', color_hex: '#F6C90E', service_id: 'taxi' },
  { id: 'veh-12', plate: 'GSG-3471', make: 'Toyota', model: 'Hilux', year: 2022, color: 'Gris plata', color_hex: '#A7ABB2', service_id: 'camioneta' },
  { id: 'veh-13', plate: 'GSE-5528', make: 'Kia', model: 'Cerato', year: 2024, color: 'Negro', color_hex: '#1B1B1D', service_id: 'ejecutivo' },
  { id: 'veh-14', plate: 'GSF-1093', make: 'Hyundai', model: 'Accent', year: 2023, color: 'Amarillo', color_hex: '#F6C90E', service_id: 'taxi' },
];

const NOW = '2026-11-16T08:00:00-05:00';

function driver(
  n: number,
  full_name: string,
  display_name: string,
  rating: number,
  trips_count: number,
  lat: number,
  lng: number,
  heading: number,
  status: Driver['status'] = 'available',
): Driver {
  const id = `drv-${String(n).padStart(2, '0')}`;
  const [first, last] = full_name.split(' ');
  return {
    id,
    full_name,
    display_name,
    initials: `${first[0]}${last[0]}`,
    avatar_hue: (n * 47) % 360,
    rating,
    trips_count,
    vehicle_id: `veh-${String(n).padStart(2, '0')}`,
    status,
    heading,
    lat,
    lng,
    joined_at: `20${21 + (n % 4)}-0${1 + (n % 9)}-15T09:00:00-05:00`,
    updated_at: NOW,
  };
}

export const drivers: Driver[] = [
  // Samborondón y La Puntilla
  driver(1, 'Carlos Mendoza', 'Carlos M.', 4.9, 3120, -2.14174, -79.86606, 23),
  driver(2, 'Luis Vera', 'Luis V.', 4.8, 2280, -2.14889, -79.86945, 356),
  driver(3, 'Jorge Cedeño', 'Jorge C.', 4.95, 4105, -2.09833, -79.87409, 178),
  driver(4, 'Miguel Zambrano', 'Miguel Z.', 4.85, 1874, -2.14025, -79.86394, 4),
  driver(5, 'Andrés Macías', 'Andrés M.', 4.7, 960, -2.05632, -79.85085, 196, 'busy'),
  // Guayaquil
  driver(6, 'Fernando Castro', 'Fernando C.', 4.8, 2650, -2.17066, -79.90067, 242),
  driver(7, 'Washington Morán', 'Washington M.', 4.9, 3890, -2.16696, -79.90578, 290),
  driver(8, 'Javier Alvarado', 'Javier A.', 4.75, 1420, -2.15464, -79.89255, 83),
  driver(9, 'Roberto Quiñónez', 'Roberto Q.', 4.85, 2015, -2.19432, -79.88311, 102, 'busy'),
  driver(10, 'Diego Villacís', 'Diego V.', 4.9, 2760, -2.13653, -79.8976, 324),
  driver(11, 'Patricio Bajaña', 'Patricio B.', 4.65, 780, -2.14086, -79.90987, 297),
  // Ceibos y Vía a la Costa
  driver(12, 'Marco Sánchez', 'Marco S.', 4.8, 1990, -2.1762, -79.94325, 215),
  driver(13, 'Ricardo Chávez', 'Ricardo C.', 4.95, 3370, -2.19066, -79.96774, 352),
  driver(14, 'José Torres', 'José T.', 4.7, 1150, -2.18707, -80.01741, 259, 'busy'),
];

export const vehiclesById: Record<string, Vehicle> = Object.fromEntries(vehicles.map((v) => [v.id, v]));

/** Vista `fleet_units` (chofer + vehículo). */
export const fleet: FleetUnit[] = drivers.map((d) => ({ ...d, vehicle: vehiclesById[d.vehicle_id] }));

export const fleetById: Record<string, FleetUnit> = Object.fromEntries(fleet.map((u) => [u.id, u]));

/** "Hyundai Accent · Amarillo". */
export function vehicleLabel(v: Vehicle): string {
  return `${v.make} ${v.model} · ${v.color}`;
}
