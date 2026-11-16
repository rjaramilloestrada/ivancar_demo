import './fx.css';

import L from 'leaflet';
import { useMemo, type CSSProperties } from 'react';
import { Marker } from 'react-leaflet';
import { cn } from '@/lib/cn';
import type { LatLng } from '@/types';

export interface RadarPulseOptions {
  /** Diámetro máximo de las ondas en px. Default 220. */
  size?: number;
  /** Ondas simultáneas. Default 3. */
  rings?: number;
  /** Segundos que tarda una onda en expandirse. Default 2.4. */
  period?: number;
  /** Haz giratorio tipo radar. Default true. */
  sweep?: boolean;
  /** Punto amarillo central. Default false (sobre el mapa ya está el pin de recogida). */
  core?: boolean;
}

function ringsHtml({ rings = 3, period = 2.4, sweep = true, core = false }: RadarPulseOptions) {
  let html = '';
  for (let i = 0; i < rings; i++) {
    html += `<span class="iv-radar__ring" style="animation-delay:${(-(period / rings) * (rings - i)).toFixed(2)}s"></span>`;
  }
  if (sweep) html += '<span class="iv-radar__sweep"></span>';
  if (core) html += '<span class="iv-radar__core"></span>';
  return html;
}

export interface RadarPulseProps extends RadarPulseOptions {
  /** Pausa las ondas (p. ej. al encontrar unidad). */
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Ondas de radar amarillas concéntricas (overlay DOM). Animación CSS de transform/opacity:
 * cero JS por frame. Decorativo (aria-hidden); el estado se anuncia con texto aparte.
 * Con reduced motion: anillos estáticos tenues.
 *
 * @example
 * <div className="relative grid place-items-center"><RadarPulse size={240} core /></div>
 */
export function RadarPulse({ size = 220, period = 2.4, active = true, className, style, ...opts }: RadarPulseProps) {
  if (!active) return null;
  const html = ringsHtml({ period, ...opts });
  return (
    <div
      aria-hidden
      className={cn('iv-radar', className)}
      style={{ '--radar-size': `${size}px`, '--radar-period': `${period}s`, ...style } as CSSProperties}
      dangerouslySetInnerHTML={{ __html: html }}
      data-fx="radar"
    />
  );
}

export interface RadarPulseMarkerProps extends RadarPulseOptions {
  /** Coordenada del centro (normalmente la recogida). */
  position: LatLng;
  /** Por debajo del pin de recogida (que usa 500). Default 100. */
  zIndexOffset?: number;
}

/**
 * Las mismas ondas como capa Leaflet en un punto del mapa (divIcon, no interactivo).
 * Debe ir como hijo de `<MapView>`. El tamaño es en px de pantalla (no escala con el zoom).
 *
 * @example
 * {step === 'searching' && pickupLL && <RadarPulseMarker position={pickupLL} size={260} />}
 */
export function RadarPulseMarker({ position, size = 220, period = 2.4, zIndexOffset = 100, rings, sweep, core }: RadarPulseMarkerProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'iv-radar-marker',
        html: `<div class="iv-radar" data-fx="radar-marker" style="--radar-size:${size}px;--radar-period:${period}s">${ringsHtml({ rings, period, sweep, core })}</div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      }),
    [size, period, rings, sweep, core],
  );
  return <Marker position={position} icon={icon} interactive={false} keyboard={false} zIndexOffset={zIndexOffset} />;
}
