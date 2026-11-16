import { memo } from 'react';
import { seededRandom } from '@/lib/geo';
import { fleet as defaultFleet } from '@/mocks/drivers';
import { patrolRoutes } from '@/mocks/fleetRoutes';
import type { FleetUnit } from '@/types';
import { AnimatedCar } from './AnimatedCar';

export interface FleetLayerProps {
  /** Unidades a mostrar. Default: toda la flota mock menos las 'offline'. */
  units?: FleetUnit[];
  /** Ids a ocultar (p. ej. la unidad asignada, que se dibuja aparte). */
  hide?: string[];
  /** Velocidad de patrulla (m/s). Default 9 (≈ 32 km/h). */
  speedMps?: number;
}

/**
 * Flota simulada patrullando por calles reales (circuitos de `mocks/fleetRoutes.ts`).
 * Cada unidad arranca en un punto distinto de su circuito (determinista por id).
 * Debe ir como hijo de <MapView>. Pensado para el mapa del pasajero ("unidades vivas
 * cerca") y para el mapa de flota de la central.
 */
export const FleetLayer = memo(function FleetLayer({ units, hide, speedMps = 9 }: FleetLayerProps) {
  const list = (units ?? defaultFleet).filter((u) => u.status !== 'offline' && !hide?.includes(u.id));
  return (
    <>
      {list.map((u) => {
        const route = patrolRoutes[u.id];
        if (!route) return null;
        const start = seededRandom(parseInt(u.id.replace(/\D/g, ''), 10) || 1)();
        return (
          <AnimatedCar
            key={u.id}
            path={route.path}
            loop
            speedMps={speedMps}
            startAt={start}
            variant="fleet"
            title={`${u.vehicle.plate} · ${u.display_name}`}
          />
        );
      })}
    </>
  );
});
