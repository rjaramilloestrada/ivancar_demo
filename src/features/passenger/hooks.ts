import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

/** Hora actual que se refresca cada `intervalMs` (null = no refrescar). */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs == null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** true si el navegador cree que hay red. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

/**
 * Al montar una pantalla, mueve el foco a su título (o al elemento dado) para que
 * lectores de pantalla y teclado sigan el cambio de paso. No roba el foco en la
 * primera carga de la app.
 */
let appReady = false;
export function markAppReady() {
  appReady = true;
}
export function useStepFocus<T extends HTMLElement>(ref: RefObject<T | null>, enabled = true) {
  const done = useRef(false);
  useEffect(() => {
    if (!enabled || done.current || !appReady) return;
    done.current = true;
    // Tras el fundido de entrada, para no pelear con la animación del sheet.
    const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [enabled, ref]);
}

/** Normaliza texto para buscar sin importar tildes ni mayúsculas. */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
