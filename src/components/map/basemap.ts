import 'maplibre-gl/dist/maplibre-gl.css';

import { MaplibreGL } from '@maplibre/maplibre-gl-leaflet';
import type L from 'leaflet';
import { setWorkerUrl, type Map as GLMap } from 'maplibre-gl';
// El worker de MapLibre se publica como archivo propio (no se empaqueta con el chunk).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { basemap } from '@/theme/tokens';
import { ivancarStyle } from './basemapStyle';

setWorkerUrl(workerUrl);

export type BasemapStatus = 'loading' | 'ready' | 'error';
export type BasemapErrorKind = 'network' | 'webgl';

export interface BasemapHandle {
  /** Quita la capa y libera el contexto WebGL. */
  remove(): void;
}

/** Capa Leaflet con MapLibre GL debajo de marcadores y rutas (pane de tiles). */
export interface BasemapOptions {
  onStatus: (status: BasemapStatus, kind?: BasemapErrorKind) => void;
}

/** ¿Hay WebGL? (sin él MapLibre no puede dibujar). */
function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Agrega el mapa base vectorial a `map` y reporta su estado:
 * - 'ready' cuando el estilo y las teselas visibles terminaron de dibujarse por primera vez;
 * - 'error' si falla el estilo/TileJSON, si fallan varias teselas seguidas, si en 12 s no
 *   llegó nada o si el dispositivo no tiene WebGL.
 * Reintentar = quitar la capa y volver a crearla.
 */
export function addBasemap(map: L.Map, { onStatus }: BasemapOptions): BasemapHandle {
  let current: BasemapStatus = 'loading';
  const set = (s: BasemapStatus, kind?: BasemapErrorKind) => {
    if (s === current && s !== 'error') return;
    current = s;
    onStatus(s, kind);
  };
  onStatus('loading');

  if (!hasWebGL()) {
    current = 'error';
    onStatus('error', 'webgl');
    return { remove() {} };
  }

  const layer = new MaplibreGL({
    style: ivancarStyle(),
    // Sin interacción propia: Leaflet maneja gestos y MapLibre solo dibuja.
    interactive: false,
    // Sincroniza el lienzo con Leaflet en cada cuadro del arrastre (el default, 32 ms, se
    // nota como un leve desfase entre calles y marcadores).
    updateInterval: 16,
    // Atribución propia (OpenFreeMap + OpenMapTiles + OSM) en el control de Leaflet.
    attributionControl: { customAttribution: basemap.attribution },
    fadeDuration: 150,
    // Se mantiene la nitidez retina (devicePixelRatio) y caché moderada para móvil.
    maxTileCacheSize: 160,
    // Al volar, MapLibre descarta lo que ya no se ve en lugar de esperarlo.
    cancelPendingTileRequestsWhileZooming: true,
  } as ConstructorParameters<typeof MaplibreGL>[0]);

  let consecutiveErrors = 0;
  let slow = 0;
  try {
    layer.addTo(map);
  } catch {
    current = 'error';
    onStatus('error', 'webgl');
    return { remove() {} };
  }
  const gl = layer.getMaplibreMap() as GLMap | null;
  if (!gl) {
    set('error', 'webgl');
    return { remove: () => layer.remove() };
  }

  // El plugin marca "zoom en curso" en zoomstart y lo limpia en zoomend. Un flyTo de Leaflet
  // cortado por un arrastre nunca emite zoomend: el lienzo quedaría congelado (franjas vacías
  // al mover). Al empezar un arrastre o al terminar cualquier movimiento, se resincroniza.
  const internals = layer as unknown as { _zooming?: boolean; _update?: () => void };
  const resync = () => {
    if (!internals._zooming) return;
    internals._zooming = false;
    internals._update?.();
  };
  map.on('dragstart moveend', resync);

  gl.on('error', (e: { error?: { status?: number; message?: string }; sourceId?: string; tile?: unknown }) => {
    // Un tile puntual que falla no tumba el mapa; el estilo o el TileJSON sí.
    if (e.tile) {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) set('error', 'network');
    } else {
      set('error', 'network');
    }
  });
  gl.on('data', (e: { dataType?: string; tile?: unknown }) => {
    if (e.dataType === 'source' && e.tile) {
      consecutiveErrors = 0;
      if (current === 'error') set('ready');
    }
  });
  gl.on('idle', () => {
    if (consecutiveErrors === 0 && gl.isStyleLoaded()) set('ready');
  });
  gl.on('webglcontextlost', () => set('error', 'webgl'));
  gl.on('webglcontextrestored', () => set('ready'));

  // Red colgada: si en 12 s no se dibujó nada, se avisa.
  slow = window.setTimeout(() => {
    if (current === 'loading') set('error', 'network');
  }, 12_000);

  return {
    remove() {
      clearTimeout(slow);
      map.off('dragstart moveend', resync);
      try {
        layer.remove();
      } catch {
        /* ya quitada */
      }
    },
  };
}
