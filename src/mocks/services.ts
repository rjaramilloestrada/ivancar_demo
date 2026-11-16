import type { Service, ServiceId } from '@/types';

/**
 * Tipos de servicio con los nombres de ivancar-ec.com.
 * Factores, tarifas por hora y tiempos de llegada son VALORES DE EJEMPLO para el demo,
 * no tarifas ni tiempos reales de IVANCAR. Se muestran siempre como "Tarifa referencial de demo".
 * Ilustración de cada tipo: `components/services/ServiceIcon.tsx`.
 */
export const services: Service[] = [
  {
    id: 'taxi',
    name: 'Taxi normal',
    description: 'Tu taxi de siempre, puerta a puerta.',
    capacity: 4,
    capacity_label: '4 pasajeros',
    pricing_mode: 'distance',
    price_factor: 1,
    hourly_rate: null,
    min_hours: null,
    pickup_eta_min: 4,
    sort_order: 1,
    active: true,
  },
  {
    id: 'ejecutivo',
    name: 'Taxi ejecutivo',
    description: 'Sedán de gama alta para reuniones y aeropuerto.',
    capacity: 4,
    capacity_label: '4 pasajeros',
    pricing_mode: 'distance',
    price_factor: 1.45,
    hourly_rate: null,
    min_hours: null,
    pickup_eta_min: 6,
    sort_order: 2,
    active: true,
  },
  {
    id: 'suv',
    name: 'SUV',
    description: 'Más espacio para familia y maletas.',
    capacity: 6,
    capacity_label: '6 pasajeros',
    pricing_mode: 'distance',
    price_factor: 1.7,
    hourly_rate: null,
    min_hours: null,
    pickup_eta_min: 7,
    sort_order: 3,
    active: true,
  },
  {
    id: 'camioneta',
    name: 'Camioneta',
    description: 'Doble cabina con balde para carga liviana.',
    capacity: 4,
    capacity_label: '4 pasajeros + carga',
    pricing_mode: 'distance',
    price_factor: 1.6,
    hourly_rate: null,
    min_hours: null,
    pickup_eta_min: 8,
    sort_order: 4,
    active: true,
  },
  {
    id: 'encomiendas',
    name: 'Encomiendas',
    description: 'Enviamos tus paquetes y documentos en el día.',
    capacity: 0,
    capacity_label: 'Paquetes hasta 20 kg',
    pricing_mode: 'distance',
    price_factor: 1.1,
    hourly_rate: null,
    min_hours: null,
    pickup_eta_min: 5,
    sort_order: 5,
    active: true,
  },
  {
    id: 'por_horas',
    name: 'Servicio por horas',
    description: 'Unidad y conductor a tu disposición.',
    capacity: 4,
    capacity_label: '4 pasajeros · mínimo 2 h',
    pricing_mode: 'hourly',
    price_factor: 1,
    hourly_rate: 12,
    min_hours: 2,
    pickup_eta_min: 10,
    sort_order: 6,
    active: true,
  },
];

export const servicesById = Object.fromEntries(services.map((s) => [s.id, s])) as Record<ServiceId, Service>;

export const DEFAULT_SERVICE_ID: ServiceId = 'taxi';

export function getService(id: ServiceId): Service {
  return servicesById[id];
}
