import { memo, useId, useMemo } from 'react';
import { cn } from '@/lib/cn';
import type { LatLng } from '@/types';

export interface MiniRouteMapProps {
  /** Polilínea del viaje (simplificada). */
  route: LatLng[];
  width?: number;
  height?: number;
  className?: string;
}

/**
 * Mini mapa estático del recorrido en SVG (Mis viajes): la polilínea proyectada a un
 * rectángulo, sin Leaflet ni tiles. Recogida (punto amarillo) y destino (cuadro blanco).
 * Proyección equirectangular con corrección por latitud: suficiente a escala de ciudad.
 * Decorativo: el texto de la tarjeta ya dice origen y destino.
 */
export const MiniRouteMap = memo(function MiniRouteMap({ route, width = 96, height = 96, className }: MiniRouteMapProps) {
  const uid = useId().replace(/:/g, '');
  const geo = useMemo(() => project(route, width, height, 14), [route, width, height]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      className={cn('block shrink-0 overflow-hidden rounded-2xl', className)}
      data-testid="mini-map"
    >
      <defs>
        <pattern id={`g${uid}`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        </pattern>
        <radialGradient id={`v${uid}`} cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#1d1d1f" />
          <stop offset="100%" stopColor="#0f0f10" />
        </radialGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#v${uid})`} />
      <rect width={width} height={height} fill={`url(#g${uid})`} />
      {geo && (
        <>
          <path d={geo.d} fill="none" stroke="rgba(246,201,14,0.22)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
          <path d={geo.d} fill="none" stroke="#F6C90E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={geo.start[0]} cy={geo.start[1]} r="4.2" fill="#050505" stroke="#F6C90E" strokeWidth="2.2" />
          <rect x={geo.end[0] - 4} y={geo.end[1] - 4} width="8" height="8" rx="1.6" fill="#FFFFFF" stroke="#050505" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
});

/** Proyecta la ruta al rectángulo (con margen), conservando la proporción. */
export function project(route: LatLng[], w: number, h: number, pad: number) {
  if (route.length < 2) return null;
  const lat0 = (route.reduce((a, p) => a + p[0], 0) / route.length) * (Math.PI / 180);
  const k = Math.cos(lat0);
  const xs = route.map((p) => p[1] * k);
  const ys = route.map((p) => -p[0]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY);
  const ox = (w - spanX * scale) / 2;
  const oy = (h - spanY * scale) / 2;
  const pts = xs.map((x, i) => [ox + (x - minX) * scale, oy + (ys[i] - minY) * scale] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  return { d, start: pts[0], end: pts[pts.length - 1] };
}
