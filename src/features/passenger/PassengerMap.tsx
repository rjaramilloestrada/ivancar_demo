import { MapView, type MapViewHandle } from '@/components/map';
import { map as mapTokens } from '@/theme/tokens';
import type { LatLng } from '@/types';
import { MapLayers, type MapLayersProps } from './MapLayers';
import type { Ref } from 'react';

export interface PassengerMapProps extends MapLayersProps {
  center: LatLng;
  zoom: number;
  /** Entrada animada desde Guayaquil completo (solo al abrir la app sin pedido en curso). */
  intro: boolean;
  insets: { top: number; bottom: number };
  'aria-label': string;
  ref?: Ref<MapViewHandle>;
}

/**
 * Mapa del pasajero (Leaflet + capas). Va en un chunk aparte que se carga después del primer
 * pintado: la cabecera y el sheet aparecen sin esperar a Leaflet, sobre un fondo de mapa
 * ilustrado (MapBackdrop).
 */
export default function PassengerMap({ center, zoom, intro, insets, 'aria-label': ariaLabel, ref, ...layers }: PassengerMapProps) {
  return (
    <MapView
      ref={ref}
      center={center}
      zoom={zoom}
      intro={intro ? { center: mapTokens.cityCenter, zoom: mapTokens.cityZoom } : undefined}
      aria-label={ariaLabel}
      insets={insets}
    >
      <MapLayers {...layers} />
    </MapView>
  );
}
