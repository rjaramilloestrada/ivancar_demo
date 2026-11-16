import L from 'leaflet';
import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { useMap } from 'react-leaflet';
import { cumulativeDistances, lerpAngle, pathLength, pointAlong } from '@/lib/geo';
import type { LatLng } from '@/types';
import { carSvg } from './carIcon';
import { useMapView } from './MapView';
import { onTick } from './ticker';

export interface AnimatedCarHandle {
  /** Progreso mostrado (0..1). */
  getProgress(): number;
  getLatLng(): LatLng | null;
  /** Rumbo mostrado en grados (0 = norte). */
  getBearing(): number;
  /** Salta a un progreso sin animar. */
  seek(progress: number): void;
}

export interface AnimatedCarProps {
  /** Polilínea a recorrer (≥ 2 puntos). Cambiarla reinicia el recorrido en `startAt`. */
  path: LatLng[];
  /**
   * Progreso controlado (0..1). El auto se desliza hacia este valor (sin re-render por
   * frame). Si se pasa, `durationMs`/`speedMps` se ignoran.
   */
  progress?: number;
  /** Recorre la ruta completa en este tiempo (modo automático). */
  durationMs?: number;
  /** Alternativa a durationMs: velocidad en m/s sobre el largo real de la ruta. */
  speedMps?: number;
  /** Al terminar vuelve a empezar (patrullas de flota). */
  loop?: boolean;
  /** Pausa/reanuda el modo automático. Default true. */
  playing?: boolean;
  /** Progreso inicial (0..1). Default 0. */
  startAt?: number;
  /** 'active' = el auto del pedido (más grande, con halo). 'fleet' = unidades de flota. */
  variant?: 'active' | 'fleet';
  /** Lado del ícono en px. Default 38 (active) / 28 (fleet). */
  size?: number;
  zIndexOffset?: number;
  /** Nombre accesible / tooltip nativo (p. ej. "GSB-4821"). */
  title?: string;
  /** Progreso mostrado, como máximo ~10 veces por segundo. */
  onProgress?: (progress: number) => void;
  /** Llegó al final (modo automático sin loop o progreso controlado = 1). */
  onArrive?: () => void;
  /** Pasos en vez de movimiento continuo (lo fuerza prefers-reduced-motion). */
  stepped?: boolean;
  ref?: Ref<AnimatedCarHandle>;
}

const PROGRESS_EVERY_MS = 100;
const STEP_EVERY_MS = 1000;
const FOLLOW_TAU_MS = 280; // suavizado del modo controlado
const TURN_TAU_MS = 140; // suavizado del giro

/**
 * Marcador de auto que recorre una polilínea girando según el rumbo.
 * Se mueve de forma imperativa (setLatLng + transform) desde un rAF compartido: ningún
 * re-render de React por frame, así pueden convivir 15 o más sin perder fluidez.
 * El rAF se pausa con la pestaña oculta. Con prefers-reduced-motion avanza por pasos (1 s).
 * Debe ir como hijo de <MapView>.
 */
export function AnimatedCar({
  path,
  progress,
  durationMs,
  speedMps,
  loop = false,
  playing = true,
  startAt = 0,
  variant = 'active',
  size,
  zIndexOffset,
  title,
  onProgress,
  onArrive,
  stepped,
  ref,
}: AnimatedCarProps) {
  const map = useMap();
  const { reduceMotion } = useMapView();
  const px = size ?? (variant === 'active' ? 38 : 28);

  const markerRef = useRef<L.Marker | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);

  // Estado mutable de la animación (no es estado de React).
  const s = useRef({
    path: path,
    cum: cumulativeDistances(path),
    length: pathLength(path),
    p: startAt,
    target: progress ?? startAt,
    heading: 0,
    shownP: -1,
    shownHeading: -1,
    sinceStep: 0,
    sinceReport: 0,
    arrived: false,
  });

  const props = useRef({ progress, durationMs, speedMps, loop, playing, onProgress, onArrive, stepped: !!stepped || reduceMotion });
  props.current = { progress, durationMs, speedMps, loop, playing, onProgress, onArrive, stepped: !!stepped || reduceMotion };

  // Crear el marcador una vez.
  useEffect(() => {
    const st = s.current;
    const start = pointAlong(st.path, st.p, st.cum);
    st.heading = start.bearing;
    const icon = L.divIcon({
      className: `iv-car iv-car--${variant}`,
      html: `<div class="iv-car__body" style="transform:rotate(${start.bearing}deg)">${carSvg({ glow: variant === 'active' })}</div>`,
      iconSize: [px, px],
      iconAnchor: [px / 2, px / 2],
    });
    const marker = L.marker(start.point, {
      icon,
      interactive: false,
      keyboard: false,
      zIndexOffset: zIndexOffset ?? (variant === 'active' ? 1000 : 0),
      title,
      alt: title,
    }).addTo(map);
    markerRef.current = marker;
    bodyRef.current = (marker.getElement()?.firstElementChild as HTMLElement | null) ?? null;
    st.shownP = st.p;
    st.shownHeading = st.heading;
    return () => {
      marker.remove();
      markerRef.current = null;
      bodyRef.current = null;
    };
  }, [map, variant, px, zIndexOffset, title]);

  // Ruta nueva → recalcular y volver a startAt.
  useEffect(() => {
    const st = s.current;
    if (st.path === path) return;
    st.path = path;
    st.cum = cumulativeDistances(path);
    st.length = pathLength(path);
    st.p = progress ?? startAt;
    st.target = st.p;
    st.arrived = false;
    st.shownP = -1; // forzar dibujo
    const pt = pointAlong(path, st.p, st.cum);
    st.heading = pt.bearing;
  }, [path]);

  // Progreso controlado.
  useEffect(() => {
    if (progress == null) return;
    const st = s.current;
    st.target = Math.min(1, Math.max(0, progress));
    if (st.target < st.p - 0.25) st.p = st.target; // retroceso grande: saltar
    if (st.target < 1) st.arrived = false;
  }, [progress]);

  // Bucle de animación.
  useEffect(() => {
    const draw = (force = false) => {
      const st = s.current;
      const marker = markerRef.current;
      if (!marker || st.path.length < 2) return;
      const pt = pointAlong(st.path, st.p, st.cum);
      if (force || Math.abs(st.p - st.shownP) > 1e-7) {
        marker.setLatLng(pt.point);
        st.shownP = st.p;
      }
      if (force || Math.abs(st.heading - st.shownHeading) > 0.05) {
        if (bodyRef.current) bodyRef.current.style.transform = `rotate(${st.heading.toFixed(1)}deg)`;
        st.shownHeading = st.heading;
      }
    };

    return onTick((dt) => {
      const st = s.current;
      const pr = props.current;
      if (st.path.length < 2) return;

      // 1) Avanzar el progreso lógico.
      if (pr.progress != null) {
        const diff = st.target - st.p;
        st.p = Math.abs(diff) < 1e-5 ? st.target : st.p + diff * (1 - Math.exp(-dt / FOLLOW_TAU_MS));
      } else if (pr.playing && !st.arrived) {
        const duration =
          pr.durationMs ?? (pr.speedMps ? (st.length / pr.speedMps) * 1000 : Math.max(4000, st.length * 120));
        st.p += dt / Math.max(1, duration);
        if (st.p >= 1) {
          if (pr.loop) st.p -= Math.floor(st.p);
          else st.p = 1;
        }
      }

      // 2) Rumbo objetivo y giro suave.
      const pt = pointAlong(st.path, st.p, st.cum);
      const stepMode = pr.stepped;
      st.heading = stepMode ? pt.bearing : lerpAngle(st.heading, pt.bearing, 1 - Math.exp(-dt / TURN_TAU_MS));

      // 3) Dibujar (por pasos con reduced motion).
      const atEnd = st.p >= 1 && !pr.loop;
      if (stepMode) {
        st.sinceStep += dt;
        if (st.sinceStep >= STEP_EVERY_MS || (atEnd && st.shownP < 1)) {
          st.sinceStep = 0;
          draw();
        }
      } else {
        draw();
      }

      // 4) Avisos.
      st.sinceReport += dt;
      if (pr.onProgress && (st.sinceReport >= PROGRESS_EVERY_MS || atEnd) && st.shownP >= 0) {
        st.sinceReport = 0;
        pr.onProgress(st.shownP);
      }
      if (atEnd && !st.arrived && st.shownP >= 1) {
        st.arrived = true;
        pr.onArrive?.();
      }
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getProgress: () => s.current.shownP,
      getLatLng: () => {
        const ll = markerRef.current?.getLatLng();
        return ll ? [ll.lat, ll.lng] : null;
      },
      getBearing: () => s.current.shownHeading,
      seek: (p: number) => {
        const st = s.current;
        st.p = Math.min(1, Math.max(0, p));
        st.target = st.p;
        st.arrived = false;
        st.heading = pointAlong(st.path, st.p, st.cum).bearing;
        const marker = markerRef.current;
        if (marker) {
          marker.setLatLng(pointAlong(st.path, st.p, st.cum).point);
          if (bodyRef.current) bodyRef.current.style.transform = `rotate(${st.heading}deg)`;
          st.shownP = st.p;
          st.shownHeading = st.heading;
        }
      },
    }),
    [],
  );

  return null;
}
