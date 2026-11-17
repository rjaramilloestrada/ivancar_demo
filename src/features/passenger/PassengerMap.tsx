import { MapView, type MapViewHandle } from '@/components/map';
import { map as mapTokens } from '@/theme/tokens';
import type { LatLng } from '@/types';
import { MapLayers, type MapLayersProps } from './MapLayers';
import type L from 'leaflet';
import type { Ref } from 'react';

export interface PassengerMapProps extends MapLayersProps {
  center: LatLng;
  zoom: number;
  /** Entrada animada: vuelo corto hacia la ubicación (solo al abrir la app sin pedido en curso). */
  intro: boolean;
  insets: { top: number; bottom: number };
  'aria-label': string;
  onReady?: (map: L.Map) => void;
  ref?: Ref<MapViewHandle>;
}

/**
 * Mapa del pasajero (Leaflet + capas). Va en un chunk aparte que se carga después del primer
 * pintado: la cabecera y el sheet aparecen sin esperar a Leaflet ni a MapLibre, sobre un
 * fondo liso del color del mapa (MapSkeleton).
 */
export default function PassengerMap({ center, zoom, intro, insets, 'aria-label': ariaLabel, onReady, ref, ...layers }: PassengerMapProps) {
  return (
    <MapView
      ref={ref}
      center={center}
      zoom={zoom}
      intro={intro ? { zoom: mapTokens.introZoom } : undefined}
      aria-label={ariaLabel}
      insets={insets}
      onReady={onReady}
    >
      <MapLayers {...layers} />
    </MapView>
  );
}
