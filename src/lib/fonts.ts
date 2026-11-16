/**
 * Tipografía: Inter variable autoalojada (preload en index.html). Se pide de forma explícita
 * al arrancar para que el navegador no espere al primer layout, y la UI que mide texto
 * (BottomSheet) espera a que esté lista, con un tope corto, para no saltar al cambiar de fuente.
 */
const FACE = '16px "Inter Variable"';

/** true si Inter ya está disponible (o si el navegador no expone la API de fuentes). */
export function interLoaded(): boolean {
  try {
    return typeof document === 'undefined' || !document.fonts || document.fonts.check(FACE);
  } catch {
    return true;
  }
}

let pending: Promise<void> | null = null;

/** Promesa que se resuelve al cargar Inter (o al fallar). Nunca se rechaza. */
export function whenInterReady(): Promise<void> {
  if (!pending) {
    pending =
      typeof document === 'undefined' || !document.fonts
        ? Promise.resolve()
        : document.fonts.load(FACE).then(
            () => undefined,
            () => undefined,
          );
  }
  return pending;
}
