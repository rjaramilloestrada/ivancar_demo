/**
 * Valores de marca que necesita JavaScript (mapa Leaflet, canvas, meta tags dinámicos).
 * La fuente de verdad para estilos es `src/index.css` (@theme); mantener sincronizados.
 */
export const colors = {
  yellow: '#F6C90E',
  yellowSoft: '#FFD84A',
  black: '#050505',
  surface: '#0C0C0C',
  surfaceRaised: '#151515',
  white: '#FFFFFF',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.15)',
  success: '#3DDC84',
  danger: '#FF5A4F',
} as const;

/** Resortes compartidos (Motion). */
export const springs = {
  /** Bottom sheet: firme, con un rebote corto. */
  sheet: { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 },
  /** Elementos pequeños (botones, chips). */
  snappy: { type: 'spring', stiffness: 520, damping: 34 },
  /** Entradas suaves (tarjetas, toasts). */
  gentle: { type: 'spring', stiffness: 260, damping: 30 },
} as const;

/** Mapa (bloque 2). Tiles CARTO Dark Matter, sin API key. */
export const map = {
  tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  /** Default si no hay geolocalización: Samborondón (aprox.). */
  defaultCenter: [-2.1449, -79.8676] as [number, number],
  defaultZoom: 15,
  /** Vista general de Guayaquil para la entrada animada. */
  cityCenter: [-2.1700, -79.9224] as [number, number],
  cityZoom: 11,
} as const;
