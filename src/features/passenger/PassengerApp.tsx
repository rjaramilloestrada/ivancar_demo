import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MapView, type MapViewHandle } from '@/components/map';
import { BottomSheet, type SheetSnap } from '@/components/sheet/BottomSheet';
import { useToast } from '@/components/ui';
import { initAnalytics, track } from '@/lib/analytics';
import { usePeerOnline } from '@/lib/channel';
import { useAddress } from '@/lib/geocode';
import { getRoute } from '@/lib/routing';
import { map as mapTokens } from '@/theme/tokens';
import { routeKey, useRide, type Step } from '@/store/rideStore';
import type { LatLng } from '@/types';
import { ChatPanel } from './ChatPanel';
import { markAppReady } from './hooks';
import { MapLayers } from './MapLayers';
import { AssignedSheet } from './screens/AssignedSheet';
import { DestinationSheet } from './screens/DestinationSheet';
import { HistorySheet } from './screens/HistorySheet';
import { HomeSheet, type GeoStatus } from './screens/HomeSheet';
import { InTripSheet } from './screens/InTripSheet';
import { PaymentSheet } from './screens/PaymentSheet';
import { RatingSheet } from './screens/RatingSheet';
import { SearchingSheet } from './screens/SearchingSheet';
import { ServiceSheet } from './screens/ServiceSheet';
import { SheetSlotsContext, type SheetSlotElements } from './SheetSlots';
import { TOP_CHROME, TopBar } from './TopBar';
import { useRideSimulation } from './useRideSimulation';

/** Altura inicial del sheet por paso. */
const SNAP: Record<Step, SheetSnap> = {
  home: 'half',
  destination: 'full',
  service: 'half',
  payment: 'full',
  searching: 'half',
  assigned: 'half',
  inTrip: 'half',
  rating: 'full',
  history: 'full',
};
const HALF: Partial<Record<Step, number>> = { home: 0.55, service: 0.56, assigned: 0.52, inTrip: 0.5, searching: 0.5 };

/** Zona de cobertura del demo (Guayaquil, Samborondón, Vía a la Costa) con holgura. */
const inServiceArea = ([lat, lng]: LatLng) => lat > -2.4 && lat < -1.9 && lng > -80.2 && lng < -79.7;

/**
 * App del pasajero (P1–P8 y la entrada a Mis viajes): un mapa a pantalla completa que no
 * se desmonta y un único BottomSheet cuyo contenido cambia según el paso del store.
 */
export default function PassengerApp() {
  const toast = useToast();
  const mapRef = useRef<MapViewHandle>(null);
  const step = useRide((s) => s.step);
  const mapPick = useRide((s) => s.mapPick);
  const pickup = useRide((s) => s.pickup);
  const destination = useRide((s) => s.destination);
  const route = useRide((s) => s.route);
  const approach = useRide((s) => s.approach);

  const centralOnline = usePeerOnline({ intervalMs: 2000, timeoutMs: 5000 });
  useRideSimulation({ centralOnline });

  useEffect(() => {
    initAnalytics();
    track('app_open', { step: useRide.getState().step });
    // Desde aquí, los cambios de paso mueven el foco al título de cada pantalla.
    const t = setTimeout(markAppReady, 300);
    return () => clearTimeout(t);
  }, []);

  /* ------------------------------------------------- Sheet y huecos */
  const [slots, setSlots] = useState<SheetSlotElements>({ header: null, body: null, footer: null });
  const headerRef = useCallback((el: HTMLDivElement | null) => setSlots((s) => (s.header === el ? s : { ...s, header: el })), []);
  const bodyRef = useCallback((el: HTMLDivElement | null) => setSlots((s) => (s.body === el ? s : { ...s, body: el })), []);
  const footerRef = useCallback((el: HTMLDivElement | null) => setSlots((s) => (s.footer === el ? s : { ...s, footer: el })), []);

  const [snap, setSnap] = useState<SheetSnap>(SNAP[step]);
  const [sheetH, setSheetH] = useState(0);
  const mainRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    setSnap(mapPick ? 'full' : SNAP[step]);
  }, [step, mapPick]);

  /* ------------------------------------------------- Recogida (P1) */
  const [pinLL, setPinLL] = useState<LatLng | null>(pickup ? [pickup.lat, pickup.lng] : null);
  const [pinMoving, setPinMoving] = useState(false);
  const pickupAddress = useAddress(pinMoving ? null : pinLL);
  const userMoved = useRef(false);
  const [geo, setGeo] = useState<GeoStatus>('pending');
  const initialCenter = useMemo<LatLng>(() => (pickup ? [pickup.lat, pickup.lng] : mapTokens.defaultCenter), []);
  // El pin solo emite su posición inicial la primera vez (sin recogida guardada).
  const firstPin = useRef(!pickup);

  // Etiqueta de la recogida al store (solo en inicio; luego queda fija en el pedido).
  useEffect(() => {
    if (step !== 'home' || !pinLL || !pickupAddress || pinMoving) return;
    useRide.getState().setPickup({ lat: pinLL[0], lng: pinLL[1], label: pickupAddress.title, sublabel: pickupAddress.subtitle });
  }, [step, pinLL, pickupAddress?.title, pickupAddress?.subtitle, pinMoving]);

  // Geolocalización real si hay permiso; si no, Samborondón. Nunca bloquea ni muestra errores.
  useEffect(() => {
    if (useRide.getState().pickup && useRide.getState().step !== 'home') return;
    if (!('geolocation' in navigator)) {
      setGeo('unavailable');
      return;
    }
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!alive) return;
        const ll: LatLng = [pos.coords.latitude, pos.coords.longitude];
        if (!inServiceArea(ll)) {
          setGeo('outside');
          toast.show({
            id: 'geo-outside',
            title: 'Estás fuera de la zona del demo',
            description: 'Te mostramos Samborondón. Mueve el mapa para elegir tu punto.',
          });
          return;
        }
        setGeo('granted');
        if (!userMoved.current && useRide.getState().step === 'home') mapRef.current?.flyTo(ll, 16);
      },
      () => alive && setGeo('denied'),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
    return () => {
      alive = false;
    };
  }, []);

  /* ------------------------------------------------- Destino en el mapa (P2) */
  const [destLL, setDestLL] = useState<LatLng | null>(null);
  const [destMoving, setDestMoving] = useState(false);
  const destAddress = useAddress(step === 'destination' && mapPick && !destMoving ? destLL : null);

  /* ------------------------------------------------- Ruta del viaje (P3) */
  const key = routeKey(pickup, destination);
  useEffect(() => {
    if (!key || route || !pickup || !destination) return;
    if (step !== 'service' && step !== 'payment') return;
    const ctrl = new AbortController();
    getRoute([pickup.lat, pickup.lng], [destination.lat, destination.lng], { signal: ctrl.signal })
      .then((r) => useRide.getState().setRoute(r, key))
      .catch(() => {
        /* abortada: cambió el destino */
      });
    return () => ctrl.abort();
  }, [key, !!route, step]);

  /* ------------------------------------------------- Encuadre del mapa */
  const prevStep = useRef<Step | null>(null);
  useEffect(() => {
    const from = prevStep.current;
    prevStep.current = step;
    if (step === 'home' && from && from !== 'home' && from !== 'history') {
      const p = useRide.getState().pickup;
      if (p) mapRef.current?.flyTo([p.lat, p.lng], 16);
    }
  }, [step]);

  const sheetBucket = Math.round(sheetH / 24);
  useEffect(() => {
    if (step === 'home' || step === 'destination' || step === 'history') return;
    const t = setTimeout(() => {
      const s = useRide.getState();
      const m = mapRef.current;
      if (!m || !s.pickup) return;
      const pts: LatLng[] = [];
      if (step === 'assigned' && s.approach) pts.push(...s.approach.path);
      else if (s.route) pts.push(...s.route.path);
      else if (s.destination) pts.push([s.pickup.lat, s.pickup.lng], [s.destination.lat, s.destination.lng]);
      if (pts.length) m.fitBounds(pts, { padding: 44, maxZoom: 16 });
    }, 90);
    return () => clearTimeout(t);
  }, [step, !!route, approach, sheetBucket]);

  /* ------------------------------------------------- Render */
  const containerH = mainRef.current?.clientHeight ?? 800;
  return (
    <main
      ref={mainRef}
      className="relative h-dvh w-full overflow-hidden bg-ivancar-black"
      data-step={step}
      data-central={centralOnline ? 'online' : 'offline'}
      data-testid="passenger-app"
    >
      <MapView
        ref={mapRef}
        center={initialCenter}
        zoom={mapTokens.defaultZoom + (pickup ? 1 : 0)}
        aria-label={step === 'home' ? 'Mapa: mueve el mapa para elegir el punto de recogida' : 'Mapa del viaje'}
        insets={{ top: TOP_CHROME, bottom: sheetH }}
      >
        <MapLayers
          pickupEmitInitial={firstPin.current}
          onPickupMoveStart={() => setPinMoving(true)}
          onPickupMoveEnd={(ll, user) => {
            firstPin.current = false;
            if (user) userMoved.current = true;
            setPinLL(ll);
            setPinMoving(false);
          }}
          pickupAddress={pinMoving ? null : pickupAddress}
          onDestMoveStart={() => setDestMoving(true)}
          onDestMoveEnd={(ll) => {
            setDestLL(ll);
            setDestMoving(false);
          }}
          destAddress={destAddress}
        />
      </MapView>

      <TopBar />

      <SheetSlotsContext value={slots}>
        <BottomSheet
          aria-label="Pedido de taxi"
          snap={snap}
          onSnapChange={setSnap}
          halfRatio={HALF[step] ?? 0.5}
          // Con el pedido en curso el mapa es protagonista: sin velo aunque el sheet sea corto.
          backdrop={!mapPick && step !== 'searching' && step !== 'assigned' && step !== 'inTrip'}
          // En 'full' el mapa queda detrás del velo: se conserva el último alto útil,
          // salvo que el sheet sea bajo (contenido corto) y el mapa siga a la vista.
          onHeightChange={(h, s) => (s !== 'full' || h < containerH * 0.7) && setSheetH(h)}
          header={<div ref={headerRef} />}
          footer={<div ref={footerRef} />}
        >
          <div ref={bodyRef} />
        </BottomSheet>

        {step === 'home' && <HomeSheet address={pinMoving ? null : pickupAddress} moving={pinMoving} geo={geo} />}
        {step === 'destination' && <DestinationSheet destAddress={destAddress} destMoving={destMoving} destPoint={destLL} />}
        {step === 'service' && <ServiceSheet />}
        {step === 'payment' && <PaymentSheet />}
        {step === 'searching' && <SearchingSheet centralOnline={centralOnline} />}
        {step === 'assigned' && <AssignedSheet />}
        {step === 'inTrip' && <InTripSheet />}
        {step === 'rating' && <RatingSheet />}
        {step === 'history' && <HistorySheet />}
      </SheetSlotsContext>

      <ChatPanel />
    </main>
  );
}
