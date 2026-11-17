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

/**
 * Mapa base: tiles vectoriales de OpenFreeMap (esquema OpenMapTiles, datos de OpenStreetMap),
 * sin API key, dibujados con MapLibre GL dentro de Leaflet y con estilo propio
 * (`components/map/basemapStyle.ts`). Nítido en retina a cualquier zoom y con nombres de
 * calles y barrios en español.
 *
 * Historial: CARTO Dark Matter pide clave desde 2026 y la capa de etiquetas de Esri llega
 * vacía en Guayaquil; ambos se retiraron.
 */
export const basemap = {
  /** TileJSON: apunta a la versión vigente del planeta (las URLs de tiles cambian por versión). */
  tileJson: 'https://tiles.openfreemap.org/planet',
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  origin: 'https://tiles.openfreemap.org',
  attribution:
    '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  /** Zoom máximo de Leaflet: los vectores se redibujan nítidos, no se estiran. */
  maxZoom: 18,
} as const;

/** Mapa (bloque 2). */
export const map = {
  /** Default si no hay geolocalización: Samborondón, La Puntilla (Parque Histórico). */
  defaultCenter: [-2.1449, -79.8676] as [number, number],
  defaultZoom: 15,
  /** Entrada: se abre un poco más lejos que la ubicación y se acerca (vuelo corto). */
  introZoom: 13.4,
} as const;
