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
 * Proveedores de tiles raster sin API key.
 *
 * CARTO Dark Matter era la opción del plan, pero en nov-2026 sus tiles devuelven una
 * marca de agua "API KEY REQUIRED" (comprobado: misma respuesta con o sin Referer).
 * Se usa Esri World Dark Gray Canvas (base + etiquetas), sin clave para visualización
 * con atribución. Si se consigue una clave de CARTO, basta con cambiar `map.tiles`.
 */
export interface TileProvider {
  /** Capa base. */
  url: string;
  /** Capa opcional de etiquetas encima de la base (PNG transparente). */
  labelsUrl?: string;
  attribution: string;
  subdomains?: string;
  /** Zoom máximo con tiles reales (más allá se escala). */
  maxNativeZoom: number;
  /** true si la URL ya pide @2x en retina (placeholder {r}). */
  retinaPlaceholder: boolean;
}

export const tileProviders = {
  esriDarkGray: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labelsUrl:
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Powered by <a href="https://www.esri.com">Esri</a> &middot; Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxNativeZoom: 16,
    retinaPlaceholder: false,
  },
  /** Requiere clave desde 2026: añadir `?api_key=...` según carto.com/basemaps/apikey. */
  cartoDarkMatter: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxNativeZoom: 20,
    retinaPlaceholder: true,
  },
} satisfies Record<string, TileProvider>;

/** Mapa (bloque 2). */
export const map = {
  tiles: tileProviders.esriDarkGray as TileProvider,
  /** Default si no hay geolocalización: Samborondón, La Puntilla (Parque Histórico). */
  defaultCenter: [-2.1449, -79.8676] as [number, number],
  defaultZoom: 15,
  /** Vista general de Guayaquil para la entrada animada. */
  cityCenter: [-2.17, -79.9224] as [number, number],
  cityZoom: 11,
} as const;
