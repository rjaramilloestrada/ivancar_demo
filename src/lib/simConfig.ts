/**
 * Tiempos de la simulación del pedido (un solo lugar para ajustarlos).
 *
 * El demo comprime el tiempo: el auto tarda ~13 s en llegar y ~16 s en hacer el viaje,
 * mientras la pantalla muestra minutos creíbles calculados con la ruta real (OSRM o
 * estimada). Así el recorrido P1 → P8 completo cabe en menos de 60 s.
 *
 * Para pruebas: `?sim=4` en la URL (antes o después del `#`) divide todos los tiempos
 * entre 4 (rango 1–20). Ej.: `/ivancar_demo/#/?sim=6`.
 */
export const SIM_TIMINGS = {
  /** Sin central conectada: la app se autoasigna la unidad más cercana a los X ms. */
  searchAutoMs: 4_000,
  /** Con central conectada: espera su asignación hasta X ms y luego se autoasigna. */
  searchCentralTimeoutMs: 6_000,
  /** La búsqueda se muestra al menos X ms aunque la central responda al instante. */
  searchMinMs: 1_600,
  /** Tope para conseguir la ruta de la unidad a la recogida (OSRM) antes de usar la estimada. */
  approachRouteTimeoutMs: 1_600,
  /** Recorrido de la unidad hasta la recogida. */
  approachMs: 13_000,
  /** Pausa con "Tu IVANCAR llegó" antes de empezar el viaje. */
  arrivedPauseMs: 2_600,
  /** Recorrido de la recogida al destino. */
  tripMs: 16_000,
} as const;

export type SimTimings = { -readonly [K in keyof typeof SIM_TIMINGS]: number };

/** Factor de aceleración leído de la URL (`sim`), 1 si no hay o no es válido. */
export function simSpeed(loc: Pick<Location, 'search' | 'hash'> | undefined = globalThis.location): number {
  if (!loc) return 1;
  const fromSearch = new URLSearchParams(loc.search).get('sim');
  const q = loc.hash.indexOf('?');
  const fromHash = q >= 0 ? new URLSearchParams(loc.hash.slice(q + 1)).get('sim') : null;
  const n = Number(fromHash ?? fromSearch);
  return Number.isFinite(n) && n >= 1 ? Math.min(20, n) : 1;
}

/** Tiempos efectivos (divididos por el factor de aceleración). */
export function simTimings(speed = simSpeed()): SimTimings {
  const out = {} as SimTimings;
  for (const k of Object.keys(SIM_TIMINGS) as Array<keyof typeof SIM_TIMINGS>) {
    out[k] = Math.round(SIM_TIMINGS[k] / speed);
  }
  return out;
}
