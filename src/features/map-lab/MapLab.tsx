import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useHashParams } from '@/lib/hashRouter';
import {
  AnimatedCar,
  DestinationMarker,
  DraggablePin,
  MapView,
  PickupMarker,
  RouteLine,
  type AnimatedCarHandle,
  type MapViewHandle,
  type RouteLineHandle,
  type TileStatus,
} from '@/components/map';
import { FleetLayer } from '@/components/map/FleetLayer';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { Button, Eyebrow } from '@/components/ui';
import { postMessage, usePeerOnline, usePresenceResponder, useChannel, type ChannelRole } from '@/lib/channel';
import { cn } from '@/lib/cn';
import { formatDistance, formatDuration } from '@/lib/geo';
import { useAddress } from '@/lib/geocode';
import { DEMO_FARE_NOTICE, estimateFare, formatFare } from '@/lib/pricing';
import { getRoute, type Route } from '@/lib/routing';
import { fleet } from '@/mocks/drivers';
import { places, suggestPlaces } from '@/mocks/places';
import { services } from '@/mocks/services';
import { toLatLng, type LatLng } from '@/types';

/**
 * #/map-lab — banco de pruebas interno del mapa (no es parte del flujo del pasajero).
 * Pin arrastrable con etiqueta en vivo, ruta a un destino de los mocks con RouteLine
 * dibujándose y un AnimatedCar recorriéndola, y la flota simulada en movimiento.
 * Expone data-* para las pruebas automáticas.
 */
export default function MapLab() {
  const params = useHashParams();
  const role: ChannelRole = params.get('role') === 'central' ? 'central' : 'passenger';
  const mapRef = useRef<MapViewHandle>(null);
  const carRef = useRef<AnimatedCarHandle>(null);
  const lineRef = useRef<RouteLineHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [panelH, setPanelH] = useState(0);
  const [pin, setPin] = useState<LatLng | null>(null);
  const [moving, setMoving] = useState(false);
  const [destId, setDestId] = useState(() => suggestPlaces()[0].id);
  const [route, setRoute] = useState<(Route & { from: LatLng; to: LatLng }) | null>(null);
  const [routing, setRouting] = useState(false);
  const [fleetOn, setFleetOn] = useState(true);
  const [tiles, setTiles] = useState<TileStatus>('loading');
  const [arrived, setArrived] = useState(false);

  // Con ruta, el pin se desmonta: la recogida es el origen de la ruta.
  const address = useAddress(route ? route.from : moving ? null : pin);
  const [lastMsg, setLastMsg] = useState('—');
  useChannel((env) => {
    if (env.role !== role && !env.msg.type.startsWith('presence:')) setLastMsg(`${env.msg.type} ← ${env.role}`);
  });

  const dest = places.find((p) => p.id === destId)!;

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPanelH(el.offsetHeight + 16));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const trace = async () => {
    const from = mapRef.current?.getVisibleCenter() ?? pin;
    if (!from) return;
    const to = toLatLng(dest);
    setRouting(true);
    setArrived(false);
    const r = await getRoute(from, to);
    setRouting(false);
    setRoute({ ...r, from, to });
    mapRef.current?.fitBounds(r.path, { padding: 40 });
  };

  const fare = useMemo(() => (route ? estimateFare(services[0], route.distance_m) : null), [route]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ivancar-black" data-testid="map-lab">
      <MapView
        ref={mapRef}
        insets={{ top: 64, bottom: panelH }}
        onTileStatusChange={setTiles}
        aria-label="Mapa de pruebas"
      >
        {fleetOn && <FleetLayer />}
        {route && (
          <>
            <RouteLine ref={lineRef} path={route.path} />
            <PickupMarker position={route.from} />
            <DestinationMarker position={route.to} label={dest.short_name} />
            <AnimatedCar
              ref={carRef}
              path={route.path}
              durationMs={14_000}
              title="Unidad de prueba"
              onProgress={(p) => {
                lineRef.current?.setTraveled(p);
                const el = document.querySelector<HTMLElement>('[data-testid="car-progress"]');
                if (el) el.textContent = String(Math.round(p * 100));
              }}
              onArrive={() => setArrived(true)}
            />
          </>
        )}
        {!route && (
          <DraggablePin
            onMoveStart={() => setMoving(true)}
            onMoveEnd={(ll) => {
              setPin(ll);
              setMoving(false);
            }}
            label={address?.title}
            sublabel={address?.subtitle}
          />
        )}
      </MapView>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <Eyebrow className="bg-header backdrop-blur-xl">Map lab</Eyebrow>
        <span className="rounded-full border border-line bg-header px-3 py-1.5 text-xs text-fg-65 backdrop-blur-xl" data-testid="tile-status">
          tiles: {tiles}
        </span>
        <Link to="/" className="rounded-full border border-line bg-header px-3 py-1.5 text-xs font-semibold text-fg-75 backdrop-blur-xl">
          Inicio
        </Link>
      </header>

      <div ref={panelRef} className="absolute inset-x-0 bottom-0 z-20 px-3 pb-safe md:left-4 md:right-auto md:bottom-4 md:w-[380px] md:px-0">
        <div className="rounded-card border border-line bg-surface/95 p-4 shadow-sheet backdrop-blur-xl">
          <p className="label-caps text-fg-55">Recogida</p>
          <p className="mt-1 truncate text-[15px] font-bold" data-testid="lab-address">
            {address?.title ?? '—'}
          </p>
          <p className="truncate text-xs text-fg-65" data-testid="lab-address-local">
            {address?.local.text ?? '\u00a0'}
            {address?.resolving ? ' · buscando calle…' : address?.remote ? ' · OSM' : ''}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <label className="sr-only" htmlFor="lab-dest">
              Destino
            </label>
            <select
              id="lab-dest"
              value={destId}
              onChange={(e) => {
                setDestId(e.target.value);
                setRoute(null);
              }}
              className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface-raised px-4 text-sm text-fg"
            >
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.short_name}
                </option>
              ))}
            </select>
            {route ? (
              <Button size="md" variant="secondary" onClick={() => setRoute(null)}>
                Limpiar
              </Button>
            ) : (
              <Button size="md" state={routing ? 'loading' : 'idle'} onClick={trace}>
                Trazar ruta
              </Button>
            )}
          </div>

          {route && fare && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line p-3" data-testid="route-info" data-route-source={route.source}>
              <ServiceIcon service="taxi" size={52} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold">
                  {formatDistance(route.distance_m)} · {formatDuration(route.duration_s)}
                </p>
                <p className="text-xs text-fg-65">
                  Ruta {route.source === 'osrm' ? 'OSRM' : 'estimada (sin enrutador)'} · avance{' '}
                  <span data-testid="car-progress">0</span>%{arrived ? ' · llegó' : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-black text-ivancar-yellow">{formatFare(fare)}</p>
                <p className="text-[10px] leading-tight text-fg-55">{DEMO_FARE_NOTICE}</p>
              </div>
            </div>
          )}

          <ChannelDebug role={role} lastMsg={lastMsg} pickup={pin} />

          <div className="mt-2 flex items-center justify-between text-xs text-fg-65">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={fleetOn} onChange={(e) => setFleetOn(e.target.checked)} className="accent-[#F6C90E]" />
              Flota en movimiento
            </label>
            <button
              type="button"
              className={cn('rounded-full px-2 py-1 font-semibold text-fg-75 hover:text-ivancar-yellow')}
              onClick={() => mapRef.current?.flyTo(toLatLng(dest), 15)}
            >
              Volar al destino
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

/** Diagnóstico del canal: presencia y envío de un pedido de prueba (para tests de dos pestañas). */
function ChannelDebug({ role, lastMsg, pickup }: { role: ChannelRole; lastMsg: string; pickup: LatLng | null }) {
  const peer: ChannelRole = role === 'central' ? 'passenger' : 'central';
  if (role === 'central') return <CentralResponder lastMsg={lastMsg} />;
  return <PassengerProbe peer={peer} lastMsg={lastMsg} pickup={pickup} />;
}

function CentralResponder({ lastMsg }: { lastMsg: string }) {
  usePresenceResponder('central');
  // Responde a un pedido de prueba con una asignación (ida y vuelta del canal).
  useChannel(
    (env) => {
      if (env.msg.type !== 'ride:created') return;
      postMessage('central', {
        type: 'ride:assigned',
        ride_id: env.msg.ride.id,
        unit: fleet[0],
        eta_s: 240,
        by: 'central',
        at: new Date().toISOString(),
      });
    },
    { from: 'passenger' },
  );
  return (
    <p className="mt-3 text-xs text-fg-65" data-testid="channel">
      Rol: central · último mensaje: <span data-testid="channel-last">{lastMsg}</span>
    </p>
  );
}

function PassengerProbe({ peer, lastMsg, pickup }: { peer: ChannelRole; lastMsg: string; pickup: LatLng | null }) {
  const online = usePeerOnline({ peer, intervalMs: 1500, timeoutMs: 4000 });
  const send = () => {
    const now = new Date().toISOString();
    const [lat, lng] = pickup ?? [0, 0];
    postMessage('passenger', {
      type: 'ride:created',
      ride: {
        id: `ride-lab-${Date.now().toString(36)}`,
        created_at: now,
        updated_at: now,
        status: 'requested',
        service_id: 'taxi',
        payment_method: 'cash',
        pickup_lat: lat,
        pickup_lng: lng,
        pickup_label: 'Map lab',
        dropoff_lat: lat,
        dropoff_lng: lng,
        dropoff_label: 'Map lab',
        distance_m: 0,
        duration_s: 0,
        fare_estimate_usd: 0,
        fare_final_usd: null,
        driver_id: null,
        vehicle_id: null,
        assigned_at: null,
        completed_at: null,
        cancelled_at: null,
        scheduled_for: null,
        note: 'Mensaje de prueba',
        passenger_name: null,
        rating: null,
        tip_usd: null,
      },
    });
  };
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-xs text-fg-65" data-testid="channel">
      <span>
        Central:{' '}
        <span data-testid="channel-peer" className={online ? 'text-success' : 'text-fg-55'}>
          {online ? 'conectada' : 'sin central'}
        </span>{' '}
        · <span data-testid="channel-last">{lastMsg}</span>
      </span>
      <button type="button" onClick={send} className="rounded-full border border-line px-2.5 py-1 font-semibold text-fg-75 hover:border-ivancar-yellow">
        Enviar pedido de prueba
      </button>
    </div>
  );
}
