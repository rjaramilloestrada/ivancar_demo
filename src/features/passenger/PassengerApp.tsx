import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrivalBanner } from '@/components/fx/ArrivalBanner';
import { Confetti, type ConfettiHandle } from '@/components/fx/Confetti';
import { InstallPrompt } from '@/components/fx/InstallPrompt';
import { Splash, useSplashOnce } from '@/components/fx/Splash';
import type L from 'leaflet';
import type { MapViewHandle } from '@/components/map/MapView';
import { MapSkeleton } from '@/components/map/MapSkeleton';
import { BottomSheet, type SheetSnap } from '@/components/sheet/BottomSheet';
import { IconLocate, useToast } from '@/components/ui';
import { initAnalytics, track } from '@/lib/analytics';
import { usePeerOnline } from '@/lib/channel';
import { useAddress } from '@/lib/geocode';
import { getRoute } from '@/lib/routing';
import { hasSimParam } from '@/lib/simConfig';
import { map as mapTokens } from '@/theme/tokens';
import { rideEvents, routeKey, useRide, type Step } from '@/store/rideStore';
import type { LatLng } from '@/types';
import { ChatPanel } from './ChatPanel';
import { markAppReady } from './hooks';
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
import { useMapCamera } from './useMapCamera';
import { useRideSimulation } from './useRideSimulation';

/** Altura inicial del sheet por paso. */
const SNAP: Record<Step, SheetSnap> = {
  home: 'half',
  destination: 'full',
  service: 'half',
  payment: 'full',
  searching: 'half',
  // Con el auto en camino el mapa es protagonista: el sheet abre en su altura corta (ETA,
  // placa y Llamar / Chat / Cancelar siguen a la vista) y se puede subir para ver más.
  assigned: 'peek',
  inTrip: 'peek',
  rating: 'full',
  history: 'full',
};
// 'assigned': a media altura deben verse completos Llamar / Chat / Cancelar desde 360×740.
const HALF: Partial<Record<Step, number>> = { home: 0.55, service: 0.56, assigned: 0.6, inTrip: 0.5, searching: 0.5 };

// Leaflet y las capas del mapa llegan en un chunk aparte, después del primer pintado.
const loadMap = () => import('./PassengerMap');
const PassengerMap = lazy(loadMap);

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

  const centralOnline = usePeerOnline({ intervalMs: 2000, timeoutMs: 5000 });
  useRideSimulation({ centralOnline });

  /* ------------------------------------------------- Capa de animación (fx) */
  // Splash una vez por sesión, encima de la app (no la retrasa). No en pruebas (?sim=)
  // ni dentro del teléfono de #/demo, donde estorbaría la presentación.
  const splash = useSplashOnce();
  const [splashAllowed] = useState(() => !hasSimParam() && window.self === window.top);
  const confetti = useRef<ConfettiHandle>(null);
  const [installOpen, setInstallOpen] = useState(false);
  useEffect(
    () =>
      rideEvents.on((e) => {
        // Confetti amarillo al enviar una calificación de 4 o 5 estrellas.
        if (e.type === 'rated' && e.rating != null && e.rating >= 4) confetti.current?.fire({ origin: { x: 0.5, y: 0.9 }, count: 80 });
        // Prompt de instalación: solo tras completar un viaje, ya de vuelta en inicio.
        if (e.type === 'rated') setTimeout(() => useRide.getState().step === 'home' && setInstallOpen(true), 2600);
        // Nunca durante un pedido.
        if (e.type === 'requested') setInstallOpen(false);
      }),
    [],
  );
  useEffect(() => {
    if (step !== 'home' && step !== 'history') setInstallOpen(false);
  }, [step]);

  // Aviso "Tu IVANCAR llegó" (con vibración en Android), una vez por viaje.
  const ride = useRide((s) => s.ride);
  const unit = useRide((s) => s.unit);
  const arrivedNow = step === 'assigned' && ride?.status === 'arrived';
  const [arrivalSeen, setArrivalSeen] = useState<string | null>(null);
  const arrivalOpen = arrivedNow && !!ride && arrivalSeen !== ride.id;

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
  // Vista con la que nace el mapa. Si la geolocalización llega antes de que el mapa
  // (chunk diferido) exista, se usa como vista inicial.
  const [startView, setStartView] = useState<{ center: LatLng; zoom: number }>(() => ({
    center: pickup ? [pickup.lat, pickup.lng] : mapTokens.defaultCenter,
    zoom: mapTokens.defaultZoom + (pickup ? 1 : 0),
  }));
  // Zoom de entrada desde Guayaquil completo: solo al abrir sin pedido en curso (y no en pruebas).
  const [intro] = useState(() => !pickup && useRide.getState().step === 'home' && !hasSimParam());
  // El chunk del mapa se pide ya (en paralelo); se monta cuando el sheet midió su alto,
  // para que el mapa nazca con los insets correctos y sin saltos.
  useEffect(() => {
    void loadMap();
  }, []);
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
        if (userMoved.current || useRide.getState().step !== 'home') return;
        if (mapRef.current) mapRef.current.flyTo(ll, 16);
        else setStartView({ center: ll, zoom: 16 });
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

  const [leaflet, setLeaflet] = useState<L.Map | null>(null);
  const camera = useMapCamera(mapRef, step, leaflet, sheetH, TOP_CHROME);

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
      <MapSkeleton />
      {sheetH > 0 && (
        <Suspense fallback={null}>
          <PassengerMap
            ref={mapRef}
            onReady={setLeaflet}
            center={startView.center}
            zoom={startView.zoom}
            intro={intro}
            aria-label={step === 'home' ? 'Mapa: mueve el mapa para elegir el punto de recogida' : 'Mapa del viaje'}
            insets={{ top: TOP_CHROME, bottom: sheetH }}
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
        </Suspense>
      )}

      <TopBar />

      {camera.paused && (
        <button
          type="button"
          onClick={camera.recenter}
          aria-label="Recentrar el mapa en tu viaje"
          title="Recentrar"
          data-testid="recenter"
          className="absolute right-4 bottom-0 z-[25] grid size-12 place-items-center rounded-full border border-line-strong bg-surface/95 text-fg shadow-sheet backdrop-blur-md transition-colors hover:border-ivancar-yellow hover:text-ivancar-yellow"
          style={{ transform: `translateY(${-(sheetH + 40)}px)` }}
        >
          <IconLocate size={22} />
        </button>
      )}

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

      {unit && (
        <ArrivalBanner
          open={arrivalOpen}
          plate={unit.vehicle.plate}
          vehicle={`${unit.vehicle.make} ${unit.vehicle.model} ${unit.vehicle.color.toLowerCase()}`}
          driver={unit.display_name}
          autoHideMs={4500}
          onClose={() => setArrivalSeen(ride?.id ?? null)}
        />
      )}
      <InstallPrompt open={installOpen && step === 'home'} onClose={() => setInstallOpen(false)} />
      <Confetti ref={confetti} />
      {splash.show && splashAllowed && <Splash onDone={splash.done} />}
    </main>
  );
}
