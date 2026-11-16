import L from 'leaflet';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { useMap } from 'react-leaflet';
import { cumulativeDistances, slicePath } from '@/lib/geo';
import { colors } from '@/theme/tokens';
import type { LatLng } from '@/types';
import { useMapView } from './MapView';
import { onTick } from './ticker';

export interface RouteLineHandle {
  /** Fracción ya recorrida (0..1), sin re-render (p. ej. desde AnimatedCar.onProgress). */
  setTraveled(fraction: number): void;
  /** Vuelve a dibujar la línea progresivamente desde 0. */
  replay(): void;
}

export interface RouteLineProps {
  path: LatLng[];
  /** Dibuja la línea de inicio a fin al montar o al cambiar `path`. Default true. */
  progressive?: boolean;
  /** Duración del dibujo (ms). Default 1100. */
  drawDurationMs?: number;
  /** Fracción ya recorrida (0..1): esa parte se muestra atenuada. Default 0. */
  traveled?: number;
  /** Color de la parte pendiente. Default amarillo IVANCAR. */
  color?: string;
  /** Grosor (px). Default 5. */
  weight?: number;
  /** Halo suave bajo la línea. Default true. */
  glow?: boolean;
  /** Se llama al terminar de dibujarse. */
  onDrawn?: () => void;
  ref?: Ref<RouteLineHandle>;
}

/**
 * Polilínea de ruta amarilla con dibujo progresivo y tramo recorrido atenuado.
 * El dibujo recorta la geometría por fracción de largo (no usa stroke-dasharray), así
 * sigue correcto si el usuario hace zoom a mitad de animación.
 * Con prefers-reduced-motion aparece completa, sin animar. Debe ir como hijo de <MapView>.
 */
export function RouteLine({
  path,
  progressive = true,
  drawDurationMs = 1100,
  traveled = 0,
  color = colors.yellow,
  weight = 5,
  glow = true,
  onDrawn,
  ref,
}: RouteLineProps) {
  const map = useMap();
  const { reduceMotion } = useMapView();
  const lines = useRef<{ glow: L.Polyline | null; done: L.Polyline; todo: L.Polyline } | null>(null);
  const st = useRef({ path, cum: cumulativeDistances(path), drawn: 1, traveled });
  const onDrawnRef = useRef(onDrawn);
  onDrawnRef.current = onDrawn;
  const stopDraw = useRef<(() => void) | null>(null);

  const render = () => {
    const l = lines.current;
    if (!l) return;
    const { path: p, cum, drawn, traveled: t0 } = st.current;
    const t = Math.min(1, Math.max(0, t0));
    const d = Math.min(1, Math.max(0, drawn));
    const todo = d > t ? slicePath(p, t, d, cum) : [];
    const done = t > 0 ? slicePath(p, 0, Math.min(t, d), cum) : [];
    l.todo.setLatLngs(todo);
    l.glow?.setLatLngs(todo);
    l.done.setLatLngs(done);
  };

  const startDraw = () => {
    stopDraw.current?.();
    const s = st.current;
    if (!progressive || reduceMotion || s.path.length < 2) {
      s.drawn = 1;
      render();
      onDrawnRef.current?.();
      return;
    }
    s.drawn = 0;
    render();
    let elapsed = 0;
    const off = onTick((dt) => {
      elapsed += dt;
      const x = Math.min(1, elapsed / drawDurationMs);
      s.drawn = 1 - Math.pow(1 - x, 3); // ease-out cúbico
      render();
      if (x >= 1) {
        off();
        stopDraw.current = null;
        onDrawnRef.current?.();
      }
    });
    stopDraw.current = off;
  };

  // Capas.
  useEffect(() => {
    const common: L.PolylineOptions = { interactive: false, lineCap: 'round', lineJoin: 'round', smoothFactor: 1 };
    const g = glow ? L.polyline([], { ...common, color, weight: weight + 9, opacity: 0.16, className: 'iv-route' }).addTo(map) : null;
    const done = L.polyline([], { ...common, color: '#FFFFFF', weight: Math.max(3, weight - 1), opacity: 0.22, className: 'iv-route' }).addTo(map);
    const todo = L.polyline([], { ...common, color, weight, opacity: 1, className: 'iv-route' }).addTo(map);
    lines.current = { glow: g, done, todo };
    render();
    return () => {
      stopDraw.current?.();
      g?.remove();
      done.remove();
      todo.remove();
      lines.current = null;
    };
  }, [map, glow, color, weight]);

  // Ruta nueva → dibujar.
  useEffect(() => {
    st.current.path = path;
    st.current.cum = cumulativeDistances(path);
    startDraw();
    return () => stopDraw.current?.();
  }, [path]);

  useEffect(() => {
    st.current.traveled = traveled;
    render();
  }, [traveled]);

  useImperativeHandle(
    ref,
    () => ({
      setTraveled(f: number) {
        st.current.traveled = f;
        render();
      },
      replay: startDraw,
    }),
    [reduceMotion, progressive, drawDurationMs],
  );

  return null;
}
