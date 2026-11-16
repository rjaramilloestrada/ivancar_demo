import './map.css';

import { createLeafletContext, LeafletContext, type LeafletContextInterface } from '@react-leaflet/core';
import L from 'leaflet';
import { useReducedMotion } from 'motion/react';
import {
  createContext,
  useCallback,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from 'react';
import { IconAlert } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { map as mapTokens } from '@/theme/tokens';
import type { LatLng } from '@/types';
import { MapBackdrop } from './MapBackdrop';

/** Píxeles del mapa tapados por la UI (barra superior, bottom sheet, panel lateral). */
export interface MapInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FlyOptions {
  /** Default: true (false si prefers-reduced-motion). */
  animate?: boolean;
  /** Segundos. Default 0.9. */
  duration?: number;
}

export interface FitOptions extends FlyOptions {
  /** Margen extra alrededor de los puntos, además de los insets (px). Default 48. */
  padding?: number;
  /** Zoom máximo al encuadrar. Default 16. */
  maxZoom?: number;
}

/** API imperativa de MapView (vía `ref`). Siempre respeta los insets. */
export interface MapViewHandle {
  /** Instancia Leaflet (null antes de montar). */
  readonly map: L.Map | null;
  /** Lleva `latlng` al centro del área visible (no al centro del contenedor). */
  flyTo(latlng: LatLng, zoom?: number, opts?: FlyOptions): void;
  /** Encuadra los puntos dentro del área visible. */
  fitBounds(points: LatLng[], opts?: FitOptions): void;
  /** Coordenada bajo el centro del área visible (donde está el pin). */
  getVisibleCenter(): LatLng | null;
}

export type TileStatus = 'loading' | 'ready' | 'error';

export interface MapViewProps {
  /** Centro inicial (se aplica al montar). Default: Samborondón (tokens). */
  center?: LatLng;
  /** Zoom inicial. Default 15. */
  zoom?: number;
  /** Zona tapada por la UI. Cambiarla desplaza el mapa para que el punto bajo el pin se mantenga. */
  insets?: Partial<MapInsets>;
  /** false = mapa de solo lectura (sin arrastre ni zoom). Default true. */
  interactive?: boolean;
  minZoom?: number;
  maxZoom?: number;
  /** Degradado superior para legibilidad de la barra flotante. Default true. */
  vignette?: boolean;
  /** Muestra estados de carga y de error de tiles. Default true. */
  showStatus?: boolean;
  /**
   * Entrada animada: el mapa abre en esta vista (p. ej. Guayaquil completo) y vuela suave
   * hasta `center`/`zoom`. Sin efecto con prefers-reduced-motion. Mientras dura, el pin no
   * se levanta y emite su posición inicial al terminar.
   */
  intro?: { center: LatLng; zoom: number };
  /** Se llama una vez con la instancia Leaflet lista. */
  onReady?: (map: L.Map) => void;
  /** Cambios de estado de los tiles (carga / listo / sin conexión). */
  onTileStatusChange?: (status: TileStatus) => void;
  'aria-label'?: string;
  className?: string;
  /** Capas (RouteLine, AnimatedCar, marcadores) y overlays (DraggablePin). */
  children?: ReactNode;
  ref?: Ref<MapViewHandle>;
}

interface MapViewContextValue {
  handle: MapViewHandle;
  insets: React.RefObject<MapInsets>;
  /** true mientras MapView mueve el mapa por su cuenta (compensar insets): el pin no se levanta. */
  internalMove: React.RefObject<boolean>;
  /** true mientras dura la entrada animada; al terminar el mapa emite `iv:introend`. */
  introActive: React.RefObject<boolean>;
  reduceMotion: boolean;
}

const MapViewContext = createContext<MapViewContextValue | null>(null);

/** Acceso a la API de MapView desde sus hijos. */
export function useMapView(): MapViewContextValue {
  const ctx = useContext(MapViewContext);
  if (!ctx) throw new Error('useMapView debe usarse dentro de <MapView>');
  return ctx;
}

/** Tile transparente para errores: nunca se ve un ícono de imagen rota. */
const EMPTY_TILE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/** Área de servicio aproximada (Guayaquil, Samborondón, Vía a la Costa) con holgura. */
const MAX_BOUNDS: L.LatLngBoundsExpression = [
  [-2.75, -80.45],
  [-1.6, -79.45],
];

/** Desplazamiento (px) del centro visible respecto del centro del contenedor. */
function visibleOffset(i: MapInsets) {
  return { x: (i.left - i.right) / 2, y: (i.top - i.bottom) / 2 };
}

/**
 * Mapa Leaflet con tiles oscuros (ver `tokens.map.tiles`), tema IVANCAR y API pensada para dos usos:
 * pantalla completa del pasajero (con bottom sheet encima) y mapa de flota de la central.
 *
 * - Ocupa su contenedor (`absolute inset-0`): el padre debe ser `relative` con alto.
 * - Sin controles de zoom; atribución del proveedor + OSM discreta, siempre por encima del sheet.
 * - Tiles @2x en retina cuando el proveedor lo ofrece (placeholder `{r}`).
 * - Estados: carga (fondo de mapa ilustrado) y error de tiles / sin red (aviso + reintentar).
 * - Crea su propia instancia (no MapContainer) para controlar el ciclo de vida en StrictMode.
 */
export function MapView({
  center = mapTokens.defaultCenter,
  zoom = mapTokens.defaultZoom,
  insets: insetsProp,
  interactive = true,
  minZoom = 10,
  maxZoom = 18,
  vignette = true,
  showStatus = true,
  intro,
  onReady,
  onTileStatusChange,
  'aria-label': ariaLabel = 'Mapa',
  className,
  children,
  ref,
}: MapViewProps) {
  const reduce = !!useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const [ctx, setCtx] = useState<LeafletContextInterface | null>(null);
  const tilesRef = useRef<L.TileLayer | null>(null);
  const labelsRef = useRef<L.TileLayer | null>(null);
  const [status, setStatus] = useState<TileStatus>('loading');
  const [everLoaded, setEverLoaded] = useState(false);

  const insets: MapInsets = {
    top: insetsProp?.top ?? 0,
    bottom: insetsProp?.bottom ?? 0,
    left: insetsProp?.left ?? 0,
    right: insetsProp?.right ?? 0,
  };
  const insetsRef = useRef<MapInsets>(insets);
  const internalMove = useRef(false);
  const introActive = useRef(false);
  /** Destino de la entrada (puede cambiar si llega la geolocalización antes de volar). */
  const introTarget = useRef<{ center: LatLng; zoom: number; flying: boolean } | null>(null);
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;

  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onStatusRef = useRef(onTileStatusChange);
  onStatusRef.current = onTileStatusChange;

  // Crear / destruir la instancia (StrictMode-safe).
  useLayoutEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const withIntro = !!intro && !reduceRef.current;
    const map = L.map(el, {
      center: withIntro ? intro.center : center,
      zoom: withIntro ? intro.zoom : zoom,
      minZoom,
      maxZoom,
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: !reduceRef.current,
      zoomSnap: 1, // zoom entero: sin costuras entre tiles ni tiles borrosos
      bounceAtZoomLimits: false,
      maxBounds: MAX_BOUNDS,
      maxBoundsViscosity: 0.8,
      worldCopyJump: false,
      keyboard: false, // el mapa no entra al orden de Tab (se opera con puntero)
      dragging: interactive,
      touchZoom: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: false,
    });
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);
    // Los enlaces de atribución siguen siendo clicables, pero no entran al orden de Tab.
    const untabAttribution = () =>
      map
        .getContainer()
        .querySelectorAll('.leaflet-control-attribution a')
        .forEach((a) => a.setAttribute('tabindex', '-1'));
    map.on('layeradd layerremove', untabAttribution);
    // El centro inicial va al centro del área visible, no al del contenedor.
    const o0 = visibleOffset(insetsRef.current);
    if (!withIntro && (o0.x || o0.y)) map.setView(map.unproject(map.project(center, zoom).subtract([o0.x, o0.y]), zoom), zoom, { animate: false });

    // Entrada: de la ciudad completa a la ubicación, tras pintar los primeros tiles.
    let introTimer = 0;
    const endIntro = () => {
      if (!introActive.current) return;
      introActive.current = false;
      internalMove.current = false;
      introTarget.current = null;
      clearTimeout(introTimer);
      for (const l of [tilesRef.current, labelsRef.current]) if (l) l.options.updateWhenZooming = true;
      map.fire('iv:introend');
    };
    if (withIntro) {
      introActive.current = true;
      internalMove.current = true;
      introTarget.current = { center, zoom, flying: false };
      introTimer = window.setTimeout(() => {
        const t = introTarget.current;
        if (!t) return;
        t.flying = true;
        const o = visibleOffset(insetsRef.current);
        const c = map.unproject(map.project(t.center, t.zoom).subtract([o.x, o.y]), t.zoom);
        map.once('moveend', endIntro);
        map.flyTo(c, t.zoom, { duration: 1.9, easeLinearity: 0.2 });
      }, 420);
      // Si el usuario toma el mapa, la entrada termina ahí.
      map.once('dragstart zoomstart', (e: L.LeafletEvent) => {
        if (e.type === 'dragstart' || !introTarget.current?.flying) endIntro();
      });
    }

    const provider = mapTokens.tiles;
    const tileOpts: L.TileLayerOptions = {
      subdomains: provider.subdomains ?? 'abc',
      maxZoom: 20,
      maxNativeZoom: provider.maxNativeZoom,
      detectRetina: false, // con {r} ya se piden tiles @2x; sin {r}, mejor nítido a escala 1
      errorTileUrl: EMPTY_TILE,
      keepBuffer: 3,
      // Durante la entrada no se piden tiles de cada nivel intermedio: la ciudad se amplía
      // y al aterrizar entran los tiles nítidos del destino (menos red en el arranque).
      updateWhenZooming: !withIntro,
    };
    const tiles = L.tileLayer(provider.url, { ...tileOpts, attribution: provider.attribution, className: 'iv-tiles' });
    const labels = provider.labelsUrl ? L.tileLayer(provider.labelsUrl, { ...tileOpts, className: 'iv-tiles-labels' }) : null;

    let consecutiveErrors = 0;
    let current: TileStatus = 'loading';
    const set = (s: TileStatus) => {
      if (s === current) return;
      current = s;
      setStatus(s);
      onStatusRef.current?.(s);
    };
    tiles.on('tileload', (e: L.TileEvent) => {
      // Tras un error, Leaflet carga el tile vacío (data:) y emite tileload: no cuenta.
      if ((e.tile as HTMLImageElement).src.startsWith('data:')) return;
      consecutiveErrors = 0;
      setEverLoaded(true);
      if (current === 'error') set('ready');
    });
    tiles.on('load', () => {
      if (consecutiveErrors === 0) set('ready');
    });
    tiles.on('tileerror', () => {
      consecutiveErrors++;
      if (consecutiveErrors >= 3) set('error');
    });
    tiles.addTo(map);
    labels?.addTo(map);
    tilesRef.current = tiles;
    labelsRef.current = labels;

    // Si en 12 s no cargó nada, se considera error (red colgada).
    const slow = setTimeout(() => {
      if (current === 'loading') set('error');
    }, 12_000);

    const retry = () => {
      consecutiveErrors = 0;
      if (current === 'error') set('loading');
      tiles.redraw();
      labels?.redraw();
    };
    window.addEventListener('online', retry);
    (map as L.Map & { _ivRetry?: () => void })._ivRetry = retry;

    // El contenedor puede cambiar de tamaño sin que cambie la ventana (marco de /demo).
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);

    setCtx(createLeafletContext(map));
    onReadyRef.current?.(map);

    return () => {
      clearTimeout(slow);
      clearTimeout(introTimer);
      introActive.current = false;
      internalMove.current = false;
      window.removeEventListener('online', retry);
      ro.disconnect();
      tilesRef.current = null;
      map.remove();
      setCtx(null);
    };
    // Centro, zoom e interactividad son iniciales: cambiarlos no recrea el mapa.
  }, []);

  const map = ctx?.map ?? null;

  // Mantener el punto bajo el pin al cambiar los insets (p. ej. el sheet sube o baja).
  // Si el usuario está arrastrando, se compensa al terminar el movimiento.
  const pendingOffset = useRef<{ dx: number; dy: number } | null>(null);
  useLayoutEffect(() => {
    const prev = insetsRef.current;
    const next = insets;
    insetsRef.current = next;
    // Durante la entrada el vuelo ya apunta al área visible: no se interrumpe.
    if (!map || introActive.current) return;
    const a = visibleOffset(prev);
    const b = visibleOffset(next);
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    const apply = (ddx: number, ddy: number) => {
      internalMove.current = true;
      map.panBy([ddx, ddy], { animate: !reduce, duration: 0.35, easeLinearity: 0.5 });
      if (reduce) internalMove.current = false;
      else map.once('moveend', () => (internalMove.current = false));
    };

    const dragging = (map.dragging as L.Handler & { _draggable?: { _moving?: boolean } })._draggable?._moving;
    if (dragging) {
      const had = pendingOffset.current;
      pendingOffset.current = { dx: (had?.dx ?? 0) + dx, dy: (had?.dy ?? 0) + dy };
      if (!had) {
        map.once('moveend', () => {
          const p = pendingOffset.current;
          pendingOffset.current = null;
          if (p && (Math.abs(p.dx) >= 1 || Math.abs(p.dy) >= 1)) apply(p.dx, p.dy);
        });
      }
      return;
    }
    apply(dx, dy);
  }, [map, insets.top, insets.bottom, insets.left, insets.right, reduce]);

  const toContainerCenter = useCallback((m: L.Map, latlng: LatLng, z: number): L.LatLng => {
    const o = visibleOffset(insetsRef.current);
    return m.unproject(m.project(latlng, z).subtract([o.x, o.y]), z);
  }, []);

  const handle = useMemo<MapViewHandle>(() => {
    const flyTo: MapViewHandle['flyTo'] = (latlng, z, opts = {}) => {
      if (!map) return;
      const targetZoom = z ?? map.getZoom();
      // Durante la entrada animada: se cambia el destino del vuelo en lugar de cortarlo.
      const t = introTarget.current;
      if (introActive.current && t && !t.flying) {
        t.center = latlng;
        t.zoom = targetZoom;
        return;
      }
      const c = toContainerCenter(map, latlng, targetZoom);
      const animate = (opts.animate ?? true) && !reduceRef.current;
      if (animate) map.flyTo(c, targetZoom, { duration: opts.duration ?? 0.9, easeLinearity: 0.3 });
      else map.setView(c, targetZoom, { animate: false });
    };
    return {
      get map() {
        return map;
      },
      flyTo,
      fitBounds(points, opts = {}) {
        if (!map || points.length === 0) return;
        if (points.length === 1) return flyTo(points[0], opts.maxZoom ?? 16, opts);
        const i = insetsRef.current;
        const pad = opts.padding ?? 48;
        const o: L.FitBoundsOptions = {
          paddingTopLeft: [i.left + pad, i.top + pad],
          paddingBottomRight: [i.right + pad, i.bottom + pad],
          maxZoom: opts.maxZoom ?? 16,
        };
        const animate = (opts.animate ?? true) && !reduceRef.current;
        if (animate) map.flyToBounds(points, { ...o, duration: opts.duration ?? 0.9, easeLinearity: 0.3 });
        else map.fitBounds(points, { ...o, animate: false });
      },
      getVisibleCenter() {
        if (!map) return null;
        const size = map.getSize();
        const o = visibleOffset(insetsRef.current);
        const ll = map.containerPointToLatLng([size.x / 2 + o.x, size.y / 2 + o.y]);
        return [ll.lat, ll.lng];
      },
    };
  }, [map, toContainerCenter]);

  useImperativeHandle(ref, () => handle, [handle]);

  const ctxValue = useMemo<MapViewContextValue>(() => ({ handle, insets: insetsRef, internalMove, introActive, reduceMotion: reduce }), [handle, reduce]);

  const style = {
    '--map-inset-top': `${insets.top}px`,
    '--map-inset-bottom': `${insets.bottom}px`,
    '--map-inset-left': `${insets.left}px`,
    '--map-inset-right': `${insets.right}px`,
  } as CSSProperties;

  const retry = () => (map as (L.Map & { _ivRetry?: () => void }) | null)?._ivRetry?.();

  return (
    <div ref={wrapRef} style={style} data-tile-status={status} className={cn('absolute inset-0 isolate overflow-hidden bg-[#0e0e0f]', className)}>
      <div ref={elRef} role="region" aria-label={ariaLabel} tabIndex={-1} className="iv-map absolute inset-0 z-0" />

      {showStatus && (
        <MapBackdrop
          className={cn(
            'z-[1] transition-opacity duration-500 ease-out',
            status === 'ready' || (status === 'error' && everLoaded) ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
        />
      )}

      {vignette && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-40 bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
      )}

      {showStatus && status === 'loading' && !everLoaded && (
        <div
          role="status"
          className="pointer-events-none absolute left-1/2 z-[3] -translate-x-1/2 rounded-full border border-line bg-header px-3.5 py-1.5 text-xs font-semibold text-fg-75 backdrop-blur-md"
          style={{ bottom: 36, transform: `translateY(${-insets.bottom}px)` }}
        >
          <span className="mr-2 inline-block size-1.5 animate-pulse-dot rounded-full bg-ivancar-yellow align-middle" />
          Cargando mapa
        </div>
      )}

      {showStatus && status === 'error' && (
        <div
          role="alert"
          className="absolute left-1/2 z-[3] flex w-[min(92%,360px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-line-strong bg-surface/95 p-3 pr-2 shadow-sheet backdrop-blur-md"
          style={{ bottom: 36, transform: `translateY(${-insets.bottom}px)` }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ivancar-yellow/15 text-ivancar-yellow">
            <IconAlert size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-fg">Mapa sin conexión</span>
            <span className="block text-xs text-fg-65">Puedes seguir pidiendo tu taxi.</span>
          </span>
          <button
            type="button"
            onClick={retry}
            className="h-9 shrink-0 rounded-full border border-line-strong px-3.5 text-xs font-bold text-fg transition-colors hover:border-ivancar-yellow hover:text-ivancar-yellow"
          >
            Reintentar
          </button>
        </div>
      )}

      {ctx && (
        <LeafletContext value={ctx}>
          <MapViewContext value={ctxValue}>{children}</MapViewContext>
        </LeafletContext>
      )}
    </div>
  );
}
