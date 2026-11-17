import type L from 'leaflet';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { MapViewHandle } from '@/components/map/MapView';
import { pointAlong } from '@/lib/geo';
import { phaseProgress, useRide, type Step } from '@/store/rideStore';
import type { LatLng } from '@/types';

/** Pasos en los que el mapa encuadra el viaje (ruta, auto, recogida o destino). */
const FRAMED: ReadonlySet<Step> = new Set<Step>(['service', 'payment', 'searching', 'assigned', 'inTrip']);
/** Pasos en los que la cámara sigue al auto. */
const FOLLOW: ReadonlySet<Step> = new Set<Step>(['assigned', 'inTrip']);

/**
 * Márgenes (px) alrededor de la ruta dentro del área útil (descontados barra y sheet).
 * Arriba se deja más lugar para el pin de destino y su etiqueta, que se dibujan sobre el
 * punto. En teléfonos bajos el área útil es chica y los márgenes se reducen en proporción,
 * para que la ruta siga ocupando al menos la mitad.
 */
function paddings(usefulH: number) {
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
  return { side: clamp(usefulH * 0.12, 20, 40), top: clamp(usefulH * 0.24, 44, 78) };
}
/** Zoom máximo al encuadrar (Leaflet): calle a calle, sin acercarse de más en tramos cortos. */
const MAX_ZOOM = 17.2;
/** Cada cuánto se reencuadra mientras se sigue al auto (ms). */
const FOLLOW_MS = 1600;

/** Puntos a encuadrar en el paso actual (lo que queda por recorrer, si hay auto en camino). */
function framePoints(step: Step): LatLng[] {
  const s = useRide.getState();
  if (!s.pickup) return [];
  const pickup: LatLng = [s.pickup.lat, s.pickup.lng];
  const dest: LatLng | null = s.destination ? [s.destination.lat, s.destination.lng] : null;
  const remaining = (path: readonly LatLng[]) => {
    if (path.length < 2) return [...path];
    const p = phaseProgress(s);
    const at = pointAlong(path, p);
    // El auto, el resto del trayecto (muestreado) y el punto final siempre a la vista.
    const rest = path.slice(at.index + 1);
    const step = Math.max(1, Math.floor(rest.length / 40));
    return [at.point, ...rest.filter((_, i) => i % step === 0), path[path.length - 1]];
  };
  if (step === 'assigned' && s.approach) return [...remaining(s.approach.path), pickup];
  if (step === 'inTrip' && s.route) return dest ? [...remaining(s.route.path), dest] : remaining(s.route.path);
  if (s.route) return [...s.route.path];
  return dest ? [pickup, dest] : [pickup];
}

/**
 * Cámara del pasajero durante el pedido:
 * - En servicio / pago / búsqueda encuadra la ruta completa en el área útil (entre la barra
 *   superior y el sheet), con zoom fraccionario para que llene el espacio.
 * - Con unidad asignada y en viaje sigue al auto con lo que le queda de trayecto (hasta la
 *   recogida o el destino), reencuadrando con movimientos cortos y suaves.
 * - Si la persona mueve el mapa, la cámara se pausa y `paused` pasa a true (botón Recentrar);
 *   `recenter()` la reanuda. Al cambiar de paso se reanuda sola.
 */
export function useMapCamera(mapRef: RefObject<MapViewHandle | null>, step: Step, map: L.Map | null, sheetH: number, topH: number) {
  const sheetBucket = Math.round(sheetH / 24);
  const usefulRef = useRef(0);
  usefulRef.current = (map?.getSize().y ?? 0) - sheetH - topH;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const route = useRide((s) => s.route);
  const approach = useRide((s) => s.approach);

  const frame = useCallback(
    (mode: 'fit' | 'follow') => {
      const m = mapRef.current;
      if (!m || !FRAMED.has(step)) return;
      const pts = framePoints(step);
      if (!pts.length) return;
      const pad = paddings(usefulRef.current);
      if (mode === 'fit') m.fitBounds(pts, { padding: pad.side, paddingTop: pad.top, maxZoom: MAX_ZOOM, duration: 0.9 });
      else m.follow(pts, { padding: pad.side + 6, paddingTop: pad.top, maxZoom: MAX_ZOOM, duration: 1.2 });
    },
    [mapRef, step],
  );

  // Cambio de paso: se reanuda la cámara.
  useEffect(() => setPaused(false), [step]);

  // Gestos de la persona pausan la cámara (solo mientras hay algo que encuadrar).
  useEffect(() => {
    if (!map || !FRAMED.has(step)) return;
    const onGesture = () => setPaused(true);
    map.on('iv:usergesture', onGesture);
    return () => {
      map.off('iv:usergesture', onGesture);
    };
  }, [map, step]);

  // Encuadre al entrar al paso, al llegar la ruta y cuando cambia el alto del sheet.
  useEffect(() => {
    if (!map || paused || !FRAMED.has(step)) return;
    const t = setTimeout(() => frame('fit'), 90);
    return () => clearTimeout(t);
  }, [map, step, !!route, approach, sheetBucket, paused, frame]);

  // Seguimiento del auto.
  useEffect(() => {
    if (!map || paused || !FOLLOW.has(step)) return;
    const id = setInterval(() => !pausedRef.current && frame('follow'), FOLLOW_MS);
    return () => clearInterval(id);
  }, [map, step, paused, frame]);

  // Al reanudar, el efecto de encuadre vuelve a correr (depende de `paused`).
  const recenter = useCallback(() => setPaused(false), []);

  return { paused: paused && FRAMED.has(step), recenter };
}
