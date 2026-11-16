/**
 * Un solo requestAnimationFrame compartido por todas las animaciones del mapa
 * (autos, rutas). Con 15 autos se hace un rAF, no 15.
 *
 * - Se detiene cuando no hay suscriptores.
 * - Se pausa con la pestaña oculta (visibilitychange) y al volver no "salta": el dt del
 *   primer frame se recorta a `MAX_DT`.
 */
type Tick = (dt: number, now: number) => void;

const subs = new Set<Tick>();
const MAX_DT = 64; // ms (≈ 4 frames): evita saltos tras pausas o tirones
let raf = 0;
let last = 0;

function frame(now: number) {
  raf = 0;
  const dt = last ? Math.min(MAX_DT, now - last) : 16;
  last = now;
  for (const fn of [...subs]) fn(dt, now);
  if (subs.size && !document.hidden) raf = requestAnimationFrame(frame);
}

function start() {
  if (raf || !subs.size || document.hidden) return;
  last = 0;
  raf = requestAnimationFrame(frame);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
}

/** Llama `fn(dt, now)` en cada frame visible. Devuelve la función para cancelar. */
export function onTick(fn: Tick): () => void {
  subs.add(fn);
  start();
  return () => {
    subs.delete(fn);
    if (!subs.size) stop();
  };
}
