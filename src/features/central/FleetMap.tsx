import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Polyline } from 'react-leaflet';
import { DestinationMarker, MapView, PickupMarker, RouteLine, type MapViewHandle, type RouteLineHandle } from '@/components/map';
import { onTick } from '@/components/map/ticker';
import { getRoute, type Route } from '@/lib/routing';
import { simTimings } from '@/lib/simConfig';
import {
  approachProgress,
  computeAlerts,
  dropoffOf,
  isActive,
  legProgress,
  orderCode,
  pickupOf,
  unitPose,
  useDispatch,
  type DispatchOrder,
} from '@/store/dispatchStore';
import { fleet } from '@/mocks/drivers';
import type { LatLng } from '@/types';
import { useNow } from '../passenger/hooks';
import { FleetUnitsLayer } from './FleetUnitsLayer';

/** Encuadre inicial: dónde están ahora las unidades libres y las de los pedidos activos. */
function fleetExtent(now: number): LatLng[] {
  const s = useDispatch.getState();
  const pts: LatLng[] = [];
  for (const u of fleet) {
    if (u.status !== 'available') continue;
    const order = s.orders.find((o) => o.unit_id === u.id && isActive(o) && o.status !== 'requested') ?? null;
    pts.push(unitPose(u.id, order, now).point);
  }
  for (const o of s.orders) if (o.status === 'requested') pts.push(pickupOf(o));
  return pts;
}

export interface FleetMapProps {
  /** Píxeles tapados por el panel de detalle (derecha en escritorio, abajo en móvil). */
  insetRight?: number;
  insetBottom?: number;
}

/**
 * Mapa de flota de la central: unidades en vivo (capa imperativa), rutas de los pedidos
 * activos (tenues), recogidas sin asignar y, para el pedido elegido, recogida, destino y la
 * ruta de su unidad con el tramo recorrido atenuado. Elegir un pedido o una unidad encuadra.
 */
export function FleetMap({ insetRight = 0, insetBottom = 0 }: FleetMapProps) {
  const ref = useRef<MapViewHandle>(null);
  const selectedOrderId = useDispatch((s) => s.selectedOrderId);
  const selectedUnitId = useDispatch((s) => s.selectedUnitId);

  // Encuadre al elegir un pedido: recogida, destino, unidad y su ruta de llegada.
  useEffect(() => {
    if (!selectedOrderId) return;
    const t = setTimeout(() => {
      const s = useDispatch.getState();
      const o = s.orders.find((x) => x.id === selectedOrderId);
      if (!o) return;
      const pts: LatLng[] = [pickupOf(o), dropoffOf(o)];
      if (o.unit_id && isActive(o)) {
        pts.push(unitPose(o.unit_id, o, Date.now()).point);
        if (o.status !== 'in_trip' && o.approach) pts.push(...o.approach.path.filter((_, i) => i % 6 === 0));
      }
      ref.current?.fitBounds(pts, { padding: 64, maxZoom: 15 });
    }, 60);
    return () => clearTimeout(t);
  }, [selectedOrderId, insetRight, insetBottom]);

  useEffect(() => {
    if (!selectedUnitId) return;
    const s = useDispatch.getState();
    const order = s.orders.find((o) => o.unit_id === selectedUnitId && isActive(o) && o.status !== 'requested') ?? null;
    ref.current?.flyTo(unitPose(selectedUnitId, order, Date.now()).point, 15);
  }, [selectedUnitId]);

  return (
    <MapView
      ref={ref}
      center={[-2.15, -79.9]}
      zoom={13}
      minZoom={11}
      vignette={false}
      insets={{ right: insetRight, bottom: insetBottom }}
      aria-label="Mapa de flota: unidades en vivo y pedidos"
      onReady={(m) => {
        // Tras el primer layout (el contenedor ya tiene tamaño).
        requestAnimationFrame(() => {
          if (!useDispatch.getState().selectedOrderId) m.fitBounds(fleetExtent(Date.now()), { padding: [40, 40], maxZoom: 14, animate: false });
        });
      }}
    >
      <OrderRoutesLayer />
      <FleetUnitsLayer />
    </MapView>
  );
}

/* ------------------------------------------------------------------ Rutas */

function OrderRoutesLayer() {
  const orders = useDispatch((s) => s.orders);
  const selectedOrderId = useDispatch((s) => s.selectedOrderId);
  const selectOrder = useDispatch((s) => s.selectOrder);
  const now = useNow(1000);
  const alertIds = useMemo(() => new Set(computeAlerts(orders, now, simTimings()).map((a) => a.order_id)), [orders, now]);
  const active = orders.filter(isActive);
  const selected = orders.find((o) => o.id === selectedOrderId) ?? null;

  return (
    <>
      {active.map((o) => {
        if (o.id === selectedOrderId) return null;
        const leg = o.status === 'in_trip' ? o.trip : o.status === 'assigned' || o.status === 'en_route' ? o.approach : null;
        // Un tramo provisional (ruta pedida, aún sin respuesta) no se dibuja.
        return leg && leg.src !== 'pending' ? (
          <Polyline
            key={`faint-${o.id}-${leg.started_at}-${leg.path.length}`}
            positions={leg.path}
            pathOptions={{
              color: o.status === 'in_trip' ? '#3DDC84' : '#F6C90E',
              weight: 3,
              opacity: 0.32,
              interactive: false,
              lineCap: 'round',
              lineJoin: 'round',
              className: `iv-leg iv-leg--${leg.src ?? 'osrm'}`,
            }}
          />
        ) : null;
      })}
      {active
        .filter((o) => o.status === 'requested' && o.id !== selectedOrderId)
        .map((o) => (
          <RequestMarker key={`req-${o.id}`} order={o} alert={alertIds.has(o.id)} onSelect={() => selectOrder(o.id)} />
        ))}
      {selected && <SelectedOrderLayer key={selected.id} order={selected} />}
    </>
  );
}

function RequestMarker({ order, alert, onSelect }: { order: DispatchOrder; alert: boolean; onSelect: () => void }) {
  const icon = useMemo(
    () =>
      L.divIcon({
        className: 'iv-marker',
        html: `<div class="iv-req${alert ? ' iv-req--alert' : ''}"><span class="iv-req__ring"></span><span class="iv-req__dot"></span></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    [alert],
  );
  const title = `Pedido #${orderCode(order.id)} sin asignar · ${order.ride.pickup_label}`;
  return <Marker position={pickupOf(order)} icon={icon} title={title} alt={title} eventHandlers={{ click: onSelect }} zIndexOffset={800} />;
}

/** Pedido elegido: su ruta (con el tramo recorrido atenuado), recogida y destino. */
function SelectedOrderLayer({ order }: { order: DispatchOrder }) {
  const lineRef = useRef<RouteLineHandle>(null);
  const rawLeg = order.status === 'in_trip' ? order.trip : order.status === 'assigned' || order.status === 'en_route' ? order.approach : null;
  const leg = rawLeg && rawLeg.src !== 'pending' ? rawLeg : null;
  // Vista previa del viaje (recogida → destino) por calles: OSRM con caché; la curva
  // estimada solo si OSRM no responde. Mientras llega, no se dibuja nada.
  const wantsPreview = order.status === 'requested' || order.status === 'assigned' || order.status === 'en_route' || order.status === 'arrived';
  const [preview, setPreview] = useState<Route | null>(null);
  useEffect(() => {
    if (!wantsPreview) return;
    const ctrl = new AbortController();
    getRoute(pickupOf(order), dropoffOf(order), { signal: ctrl.signal, timeoutMs: 2500 })
      .then(setPreview)
      .catch(() => {
        /* abortada: cambió el pedido */
      });
    return () => ctrl.abort();
  }, [order.id, wantsPreview]);
  const orderRef = useRef(order);
  orderRef.current = order;

  // Tramo recorrido, ~6 veces por segundo, sin renders.
  useEffect(() => {
    if (!leg) return;
    let acc = 1000;
    return onTick((dt) => {
      acc += dt;
      if (acc < 160) return;
      acc = 0;
      const o = orderRef.current;
      const now = Date.now();
      lineRef.current?.setTraveled(o.status === 'in_trip' ? legProgress(o.trip, now) : approachProgress(o, now));
    });
  }, [leg]);

  return (
    <>
      {wantsPreview && preview && (
        <Polyline
          key={`preview-${preview.source}`}
          positions={preview.path}
          pathOptions={{
            color: '#FFFFFF',
            weight: 2.5,
            opacity: 0.45,
            dashArray: '2 8',
            interactive: false,
            lineCap: 'round',
            className: `iv-preview iv-preview--${preview.source}`,
          }}
        />
      )}
      {leg && isActive(order) && (
        <RouteLine key={`sel-${leg.started_at}-${leg.path.length}`} ref={lineRef} path={leg.path} className={`iv-leg iv-leg--${leg.src ?? 'osrm'}`} />
      )}
      <PickupMarker position={pickupOf(order)} label={order.ride.pickup_label} />
      <DestinationMarker position={dropoffOf(order)} label={order.ride.dropoff_label} />
    </>
  );
}
