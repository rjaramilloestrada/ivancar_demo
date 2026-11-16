import L from 'leaflet';
import { useMemo } from 'react';
import { Marker } from 'react-leaflet';
import type { LatLng } from '@/types';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export interface PointMarkerProps {
  position: LatLng;
  /** Texto corto en una píldora sobre el marcador (p. ej. "Recogida", "Plaza Lagos"). */
  label?: string;
  /** Nombre accesible del marcador. */
  title?: string;
  zIndexOffset?: number;
}

/** Punto de recogida: punto amarillo con anillo pulsante (sin pulso con reduced motion). */
export function PickupMarker({ position, label, title = 'Punto de recogida', zIndexOffset = 500 }: PointMarkerProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'iv-marker',
        html: `<div class="iv-pickup"><span class="iv-pickup__ring"></span><span class="iv-pickup__dot"></span>${
          label ? `<span class="iv-marker-label">${escape(label)}</span>` : ''
        }</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      }),
    [label],
  );
  return <Marker position={position} icon={icon} title={title} alt={title} keyboard={false} interactive={false} zIndexOffset={zIndexOffset} />;
}

/** Destino: banderín blanco con base negra, punta en la coordenada. */
export function DestinationMarker({ position, label, title = 'Destino', zIndexOffset = 600 }: PointMarkerProps) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'iv-marker',
        html: `<div class="iv-dest">${label ? `<span class="iv-marker-label">${escape(label)}</span>` : ''}<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true">
<path d="M15 39c0 0-12-14.2-12-23.5C3 8.6 8.4 3 15 3s12 5.6 12 12.5C27 24.8 15 39 15 39z" fill="#FFFFFF" stroke="#050505" stroke-width="2"/>
<rect x="10" y="10" width="10" height="10" rx="2" fill="#050505"/>
<rect x="13" y="13" width="4" height="4" rx="0.8" fill="#F6C90E"/>
</svg></div>`,
        iconSize: [30, 40],
        iconAnchor: [15, 39],
      }),
    [label],
  );
  return <Marker position={position} icon={icon} title={title} alt={title} keyboard={false} interactive={false} zIndexOffset={zIndexOffset} />;
}
