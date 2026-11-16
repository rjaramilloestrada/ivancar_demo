import { vehicleLabel } from '@/mocks/drivers';
import type { FleetUnit, LatLng } from '@/types';

/**
 * Textos para WhatsApp (se ven bien al pegarlos: negritas con *…*, una idea por línea).
 * Todo es del demo: conductor, placa y vehículo son ficticios.
 */

const color = (u: FleetUnit) => `${u.vehicle.make} ${u.vehicle.model} ${u.vehicle.color.toLowerCase()}`;
const stars = (r: number) => r.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function tripShareText(o: { unit: FleetUnit; from: string; to: string; eta: string; code: string }): string {
  return [
    '*Mi viaje IVANCAR*',
    `Conductor: ${o.unit.display_name} (${stars(o.unit.rating)} ★)`,
    `Placa: ${o.unit.vehicle.plate}`,
    `Vehículo: ${color(o.unit)}`,
    `Desde: ${o.from}`,
    `Hasta: ${o.to}`,
    `Llega en: ${o.eta}`,
    `Pedido #${o.code} · Demo conceptual IVANCAR`,
  ].join('\n');
}

export function locationShareText(o: { unit: FleetUnit; at: LatLng; to: string; eta: string }): string {
  const q = `${o.at[0].toFixed(5)},${o.at[1].toFixed(5)}`;
  return [
    '*Voy en un IVANCAR*',
    `Hacia: ${o.to}`,
    `Llego en: ${o.eta} aprox.`,
    `Mi ubicación ahora: https://maps.google.com/?q=${q}`,
    `${o.unit.display_name} · Placa ${o.unit.vehicle.plate} · ${vehicleLabel(o.unit.vehicle)}`,
    'Demo conceptual IVANCAR',
  ].join('\n');
}

export function fallbackRequestText(pickup?: string | null): string {
  return pickup ? `Hola IVANCAR, quiero solicitar un taxi. Estoy en: ${pickup}.` : 'Hola IVANCAR, quiero solicitar un taxi.';
}
