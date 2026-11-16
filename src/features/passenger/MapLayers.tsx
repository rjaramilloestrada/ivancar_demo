import { useRef } from 'react';
import { AnimatedCar, DestinationMarker, DraggablePin, PickupMarker, RouteLine, type RouteLineHandle } from '@/components/map';
import { RadarPulseMarker } from '@/components/fx/RadarPulse';
import { FleetLayer } from '@/components/map/FleetLayer';
import type { AddressState } from '@/lib/geocode';
import { phaseProgress, useRide } from '@/store/rideStore';
import type { LatLng } from '@/types';
import { useNow } from './hooks';

export interface MapLayersProps {
  /** Recogida: el mapa se movió (el pin se levanta). */
  onPickupMoveStart: () => void;
  onPickupMoveEnd: (ll: LatLng, user: boolean) => void;
  pickupAddress: AddressState | null;
  /** true si el pin de recogida debe emitir su posición al montarse. */
  pickupEmitInitial: boolean;
  onDestMoveStart: () => void;
  onDestMoveEnd: (ll: LatLng) => void;
  destAddress: AddressState | null;
}

/**
 * Capas del mapa según el paso. El mapa (MapView) vive en PassengerApp y no se desmonta:
 * aquí solo cambian marcadores, rutas y autos.
 */
export function MapLayers(p: MapLayersProps) {
  const step = useRide((s) => s.step);
  const mapPick = useRide((s) => s.mapPick);
  const pickup = useRide((s) => s.pickup);
  const destination = useRide((s) => s.destination);
  const route = useRide((s) => s.route);
  const approach = useRide((s) => s.approach);
  const unit = useRide((s) => s.unit);
  const phaseStartedAt = useRide((s) => s.phaseStartedAt);
  const phaseDurationMs = useRide((s) => s.phaseDurationMs);

  const moving = step === 'assigned' || step === 'inTrip';
  const now = useNow(moving ? 200 : null);
  const progress = moving ? phaseProgress({ phaseStartedAt, phaseDurationMs }, now) : 0;
  const lineRef = useRef<RouteLineHandle>(null);

  const pickupLL: LatLng | null = pickup ? [pickup.lat, pickup.lng] : null;
  const destLL: LatLng | null = destination ? [destination.lat, destination.lng] : null;

  // Inicio: pin de recogida arrastrable y flota viva alrededor.
  if (step === 'home' || step === 'history') {
    return (
      <>
        <FleetLayer />
        {step === 'home' && (
          <DraggablePin
            emitInitial={p.pickupEmitInitial}
            onMoveStart={p.onPickupMoveStart}
            onMoveEnd={(ll, info) => p.onPickupMoveEnd(ll, info.user)}
            label={p.pickupAddress?.title}
            sublabel={p.pickupAddress?.subtitle}
            labelLoading={!p.pickupAddress}
          />
        )}
      </>
    );
  }

  if (step === 'destination') {
    return (
      <>
        <FleetLayer />
        {pickupLL && <PickupMarker position={pickupLL} />}
        {mapPick && (
          <DraggablePin
            tone="destination"
            onMoveStart={p.onDestMoveStart}
            onMoveEnd={(ll) => p.onDestMoveEnd(ll)}
            label={p.destAddress?.title}
            sublabel={p.destAddress?.subtitle}
            labelLoading={!p.destAddress}
          />
        )}
      </>
    );
  }

  if (step === 'service' || step === 'payment' || step === 'searching') {
    return (
      <>
        {step === 'searching' && <FleetLayer />}
        {route && <RouteLine key="route-trip" path={route.path} />}
        {pickupLL && <PickupMarker position={pickupLL} label={step === 'searching' ? undefined : 'Recogida'} />}
        {destLL && <DestinationMarker position={destLL} label={destination?.label} />}
        {/* Radar de búsqueda: ondas amarillas desde la recogida mientras se evalúan unidades. */}
        {step === 'searching' && pickupLL && <RadarPulseMarker position={pickupLL} size={240} />}
      </>
    );
  }

  if (step === 'assigned' && approach && unit) {
    return (
      <>
        <RouteLine key={`route-approach-${unit.id}`} ref={lineRef} path={approach.path} />
        {pickupLL && <PickupMarker position={pickupLL} label="Recogida" />}
        <AnimatedCar
          key={`car-approach-${unit.id}`}
          path={approach.path}
          progress={progress}
          startAt={progress}
          title={`${unit.vehicle.plate} · ${unit.display_name}`}
          onProgress={(v) => lineRef.current?.setTraveled(v)}
        />
      </>
    );
  }

  if ((step === 'inTrip' || step === 'rating') && route) {
    const done = step === 'rating';
    return (
      <>
        <RouteLine key="route-trip-live" ref={lineRef} path={route.path} progressive={false} traveled={done ? 1 : 0} />
        {destLL && <DestinationMarker position={destLL} label={destination?.label} />}
        {unit && (
          <AnimatedCar
            key="car-trip"
            path={route.path}
            progress={done ? 1 : progress}
            startAt={done ? 1 : progress}
            title={`${unit.vehicle.plate} · ${unit.display_name}`}
            onProgress={(v) => lineRef.current?.setTraveled(v)}
          />
        )}
      </>
    );
  }

  return null;
}
