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
import { basemap, map as mapTokens } from '@/theme/tokens';
import type { LatLng } from '@/types';
import { addBasemap, type BasemapErrorKind, type BasemapHandle } from './basemap';
import { MapSkeleton } from './MapSkeleton';

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
  /** Margen superior propio (px), p. ej. para la etiqueta que va encima de un marcador. */
  paddingTop?: number;
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
  /**
   * Cámara que sigue (p. ej. al auto): encuadra los puntos con un movimiento suave y corto.
   * Si el zoom casi no cambia solo desplaza; si cambia, acerca o aleja sin el "salto" de flyTo.
   */
  follow(points: LatLng[], opts?: FitOptions): void;
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
   * Entrada animada: el mapa abre en esta vista (por defecto, el mismo centro un poco más
   * lejos) y, cuando el mapa base ya se dibujó, se acerca hasta `center`/`zoom` en un vuelo
   * corto. Sin efecto con prefers-reduced-motion. Mientras dura, el pin no se levanta y emite
   * su posición inicial al terminar (evento `iv:introend`).
   */
  intro?: { zoom: number; center?: LatLng };
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
 * Mapa Leaflet con mapa base vectorial oscuro (OpenFreeMap + MapLibre GL, ver `basemap.ts`),
 * tema IVANCAR y API pensada para dos usos: pantalla completa del pasajero (con bottom sheet
 * encima) y mapa de flota de la central.
 *
 * - Ocupa su contenedor (`absolute inset-0`): el padre debe ser `relative` con alto.
 * - Sin controles de zoom; atribución OpenFreeMap / OpenMapTiles / OSM discreta, siempre por
 *   encima del sheet.
 * - Zoom fraccionario: los vectores se redibujan nítidos a cualquier zoom y en retina.
 * - Estados: carga (fondo liso con skeleton) y error (sin red o sin WebGL: aviso + reintentar).
 * - Emite `iv:usergesture` en el mapa Leaflet cuando la persona arrastra, pellizca o usa la rueda.
 * - Crea su propia instancia (no MapContainer) para controlar el ciclo de vida en StrictMode.
 */
export function MapView({
  center = mapTokens.defaultCenter,
  zoom = mapTokens.defaultZoom,
  insets: insetsProp,
  interactive = true,
  minZoom = 10,
  maxZoom = basemap.maxZoom,
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
  const [status, setStatus] = useState<TileStatus>('loading');
  const [errorKind, setErrorKind] = useState<BasemapErrorKind>('network');
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
    const introCenter = intro?.center ?? center;
    const map = L.map(el, {
      center: withIntro ? introCenter : center,
      zoom: withIntro ? intro.zoom : zoom,
      minZoom,
      maxZoom,
      zoomControl: false,
      attributionControl: false,
      fadeAnimation: false,
      // Zoom libre: el mapa base es vectorial, no hay teselas que "encajar".
      zoomSnap: 0,
      zoomDelta: 1,
      wheelPxPerZoomLevel: 90,
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
    if (o0.x || o0.y) {
      const c0 = withIntro ? introCenter : center;
      const z0 = withIntro ? intro.zoom : zoom;
      map.setView(map.unproject(map.project(c0, z0).subtract([o0.x, o0.y]), z0), z0, { animate: false });
    }

    // Gestos de la persona (no los movimientos programados): arrastre, pellizco, rueda, doble toque.
    const container = map.getContainer();
    const gesture = () => map.fire('iv:usergesture');
    const onTouch = (e: TouchEvent) => e.touches.length > 1 && gesture();
    map.on('dragstart', gesture);
    container.addEventListener('wheel', gesture, { passive: true });
    container.addEventListener('touchstart', onTouch, { passive: true });
    container.addEventListener('dblclick', gesture);

    // Entrada: vuelo corto hacia la ubicación cuando el mapa base ya se dibujó (nunca se ve
    // una imagen estirada: los vectores se redibujan en cada cuadro del vuelo).
    let introTimer = 0;
    let introFallback = 0;
    const endIntro = () => {
      if (!introActive.current) return;
      introActive.current = false;
      internalMove.current = false;
      introTarget.current = null;
      clearTimeout(introTimer);
      clearTimeout(introFallback);
      map.fire('iv:introend');
    };
    const startIntroFlight = () => {
      const t = introTarget.current;
      if (!t || t.flying) return;
      t.flying = true;
      clearTimeout(introFallback);
      const o = visibleOffset(insetsRef.current);
      const c = map.unproject(map.project(t.center, t.zoom).subtract([o.x, o.y]), t.zoom);
      map.once('moveend', endIntro);
      map.flyTo(c, t.zoom, { duration: 1.5, easeLinearity: 0.25 });
    };
    if (withIntro) {
      introActive.current = true;
      internalMove.current = true;
      introTarget.current = { center, zoom, flying: false };
      // Si el mapa base tarda (red lenta), se vuela igual tras 2,5 s.
      introFallback = window.setTimeout(startIntroFlight, 2500);
      // Si la persona toma el mapa, la entrada termina ahí.
      map.once('iv:usergesture', endIntro);
    }

    // Mapa base vectorial.
    let current: TileStatus = 'loading';
    let base: BasemapHandle | null = null;
    const onBaseStatus = (s: TileStatus, kind?: BasemapErrorKind) => {
      if (s === 'ready') {
        setEverLoaded(true);
        untabAttribution();
        // Pequeña pausa para que el primer cuadro se vea quieto antes de volar.
        if (introTarget.current && !introTarget.current.flying) introTimer = window.setTimeout(startIntroFlight, 180);
      }
      if (s === 'error' && kind) setErrorKind(kind);
      if (s === current) return;
      current = s;
      setStatus(s);
      onStatusRef.current?.(s);
    };
    base = addBasemap(map, { onStatus: onBaseStatus });

    // Reintentar = quitar el mapa base y crearlo de nuevo. Se espera un momento entre ambos:
    // MapLibre libera su pool de workers de forma asíncrona y, si el worker no había llegado a
    // cargar (sin red), el mapa nuevo debe arrancar con workers nuevos y no con los rotos.
    let retryTimer = 0;
    let disposed = false;
    const retry = () => {
      if (current !== 'error' || retryTimer) return;
      base?.remove();
      base = null;
      onBaseStatus('loading');
      retryTimer = window.setTimeout(() => {
        retryTimer = 0;
        if (!disposed) base = addBasemap(map, { onStatus: onBaseStatus });
      }, 250);
    };
    window.addEventListener('online', retry);
    (map as L.Map & { _ivRetry?: () => void })._ivRetry = retry;

    // El contenedor puede cambiar de tamaño sin que cambie la ventana (marco de /demo).
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(el);

    setCtx(createLeafletContext(map));
    onReadyRef.current?.(map);

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearTimeout(introTimer);
      clearTimeout(introFallback);
      introActive.current = false;
      internalMove.current = false;
      window.removeEventListener('online', retry);
      container.removeEventListener('wheel', gesture);
      container.removeEventListener('touchstart', onTouch);
      container.removeEventListener('dblclick', gesture);
      ro.disconnect();
      base?.remove();
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
    const fitOptions = (opts: FitOptions): L.FitBoundsOptions => {
      const i = insetsRef.current;
      const pad = opts.padding ?? 48;
      return {
        paddingTopLeft: [i.left + pad, i.top + (opts.paddingTop ?? pad)],
        paddingBottomRight: [i.right + pad, i.bottom + pad],
        maxZoom: opts.maxZoom ?? 16,
      };
    };
    return {
      get map() {
        return map;
      },
      flyTo,
      fitBounds(points, opts = {}) {
        if (!map || points.length === 0) return;
        if (points.length === 1) return flyTo(points[0], opts.maxZoom ?? 16, opts);
        const o = fitOptions(opts);
        const animate = (opts.animate ?? true) && !reduceRef.current;
        if (animate) map.flyToBounds(points, { ...o, duration: opts.duration ?? 0.9, easeLinearity: 0.3 });
        else map.fitBounds(points, { ...o, animate: false });
      },
      follow(points, opts = {}) {
        if (!map || points.length === 0 || introActive.current) return;
        const o = fitOptions(opts);
        const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
        const tl = L.point(o.paddingTopLeft as L.PointTuple);
        const br = L.point(o.paddingBottomRight as L.PointTuple);
        let z = map.getBoundsZoom(bounds, false, tl.add(br));
        z = Math.min(o.maxZoom ?? 16, z);
        // Centro del rectángulo útil (descontando insets y margen asimétricos).
        const sw = map.project(bounds.getSouthWest(), z);
        const ne = map.project(bounds.getNorthEast(), z);
        const center = map.unproject(sw.add(ne).divideBy(2).add(br.subtract(tl).divideBy(2)), z);
        const animate = (opts.animate ?? true) && !reduceRef.current;
        if (!animate) return void map.setView(center, z, { animate: false });
        const dz = Math.abs(z - map.getZoom());
        if (dz < 0.2) map.panTo(center, { animate: true, duration: opts.duration ?? 0.9, easeLinearity: 0.9 });
        else map.flyTo(center, z, { duration: opts.duration ?? 0.9, easeLinearity: 0.9 });
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
    <div ref={wrapRef} style={style} data-tile-status={status} className={cn('absolute inset-0 isolate overflow-hidden bg-map', className)}>
      <div ref={elRef} role="region" aria-label={ariaLabel} tabIndex={-1} className="iv-map absolute inset-0 z-0" />

      {showStatus && (
        <MapSkeleton
          className={cn(
            'z-[1] transition-opacity duration-500 ease-out',
            status === 'ready' || everLoaded ? 'pointer-events-none opacity-0' : 'opacity-100',
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
            <span className="block text-sm font-semibold text-fg">{errorKind === 'webgl' ? 'No pudimos dibujar el mapa' : 'El mapa no cargó'}</span>
            <span className="block text-xs text-fg-65">
              {errorKind === 'webgl' ? 'Tu navegador no permitió el mapa. ' : 'Revisa tu conexión. '}Puedes seguir pidiendo tu taxi.
            </span>
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
