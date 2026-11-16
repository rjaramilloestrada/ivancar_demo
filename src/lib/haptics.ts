/**
 * Háptica (Vibration API). Solo Android/Chrome la implementa; en iOS Safari y escritorio
 * `vibrate()` no hace nada y devuelve false. Nunca lanza.
 *
 * No vibra con `prefers-reduced-motion: reduce` (quien pide menos movimiento suele pedir
 * también menos estímulos) ni con la pestaña oculta.
 */

/** Patrones nombrados (ms: vibra, pausa, vibra…). Cortos: confirman, no molestan. */
export const hapticPatterns = {
  /** Toque ligero: selección de chip, estrella, tarjeta. */
  tap: [12],
  /** Confirmación: pedido enviado, conductor asignado. */
  confirm: [18, 60, 28],
  /** Llegada: "Tu IVANCAR llegó" (tres pulsos, el último más largo). */
  arrival: [90, 70, 90, 70, 200],
  /** Alerta suave (central: pedido sin asignar). */
  alert: [40, 50, 40],
} as const satisfies Record<string, readonly number[]>;

export type HapticName = keyof typeof hapticPatterns;

function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** true si el navegador expone la Vibration API (no garantiza que el equipo vibre). */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/**
 * Vibra con un patrón nombrado o explícito. Devuelve true si el navegador aceptó la orden.
 * @example vibrate('arrival')
 */
export function vibrate(pattern: HapticName | number | readonly number[]): boolean {
  if (!canVibrate() || reducedMotion()) return false;
  if (typeof document !== 'undefined' && document.hidden) return false;
  const p = typeof pattern === 'string' ? hapticPatterns[pattern] : pattern;
  try {
    return navigator.vibrate(typeof p === 'number' ? p : [...p]);
  } catch {
    return false;
  }
}

/** Detiene una vibración en curso. */
export function stopVibration(): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(0);
  } catch {
    /* sin soporte */
  }
}
