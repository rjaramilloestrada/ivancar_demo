import type { Service, ServiceId } from '@/types';

/**
 * Tarifa REFERENCIAL DE DEMO.
 *
 * Todos los valores de este archivo son de ejemplo para la demostración. No son tarifas
 * reales de IVANCAR ni deben presentarse como tales: cualquier precio en pantalla va
 * acompañado de `DEMO_FARE_NOTICE`. En la Fase 1 estos valores vienen de la base de datos.
 */
export const DEMO_FARE_NOTICE = 'Tarifa referencial de demo';

export const DEMO_FARE_CONFIG = {
  /** Arranque (USD). Ejemplo. */
  base: 1.5,
  /** USD por km recorrido. Ejemplo. */
  perKm: 0.45,
  /** Cobro mínimo por carrera (USD). Ejemplo. */
  minimum: 2.5,
  /** Redondeo hacia arriba al múltiplo de (USD). */
  roundTo: 0.25,
} as const;

export type FareService = Pick<Service, 'id' | 'price_factor' | 'pricing_mode' | 'hourly_rate' | 'min_hours'>;

export interface FareEstimate {
  service_id: ServiceId;
  /** Monto final redondeado (USD). */
  amount: number;
  currency: 'USD';
  /** true si se aplicó el cobro mínimo. */
  minimum_applied: boolean;
  /** Modo de cálculo: por distancia o por horas. */
  mode: 'distance' | 'hourly';
  /** Horas cotizadas (solo modo por horas). */
  hours: number | null;
  /** Siempre `DEMO_FARE_NOTICE`. */
  notice: typeof DEMO_FARE_NOTICE;
}

/** Redondea hacia arriba a múltiplos de `step`, tolerando errores de coma flotante. */
export function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

/**
 * Estima la tarifa de demo.
 * - Distancia: (base + km × perKm) × factor del servicio, con mínimo × factor, redondeado.
 * - Por horas: tarifa por hora × max(horas, mínimo de horas). `distanceMeters` se ignora.
 */
export function estimateFare(
  service: FareService,
  distanceMeters: number,
  opts: { hours?: number } = {},
): FareEstimate {
  const cfg = DEMO_FARE_CONFIG;
  if (service.pricing_mode === 'hourly') {
    const rate = service.hourly_rate ?? 0;
    const minH = service.min_hours ?? 1;
    const hours = Math.max(minH, Math.ceil(opts.hours ?? minH));
    return {
      service_id: service.id,
      amount: roundUpTo(rate * hours, cfg.roundTo),
      currency: 'USD',
      minimum_applied: (opts.hours ?? minH) < minH,
      mode: 'hourly',
      hours,
      notice: DEMO_FARE_NOTICE,
    };
  }
  const km = Math.max(0, Number.isFinite(distanceMeters) ? distanceMeters : 0) / 1000;
  const raw = (cfg.base + km * cfg.perKm) * service.price_factor;
  const min = cfg.minimum * service.price_factor;
  const minimumApplied = raw < min;
  return {
    service_id: service.id,
    amount: roundUpTo(Math.max(raw, min), cfg.roundTo),
    currency: 'USD',
    minimum_applied: minimumApplied,
    mode: 'distance',
    hours: null,
    notice: DEMO_FARE_NOTICE,
  };
}

const usd = new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 4.75 → "$4,75" (Ecuador usa dólares; coma decimal). */
export function formatUSD(amount: number): string {
  // Intl con es-EC puede poner espacio duro entre símbolo y número; se normaliza a "$4,75".
  return usd.format(amount).replace(/\s/g, '');
}

/** Texto listo para la tarjeta: "$4,75" o "$24,00 · 2 h". */
export function formatFare(f: FareEstimate): string {
  return f.mode === 'hourly' ? `${formatUSD(f.amount)} · ${f.hours} h` : formatUSD(f.amount);
}
