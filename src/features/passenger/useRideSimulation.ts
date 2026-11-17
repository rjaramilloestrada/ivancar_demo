import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui';
import { track } from '@/lib/analytics';
import { postMessage, useChannel } from '@/lib/channel';
import { approachAt, pickUnit, planApproach, unitNow, type PlannedApproach } from '@/lib/dispatch';
import { poseOnPath } from '@/lib/geo';
import { SIM_TIMINGS, simTimings } from '@/lib/simConfig';
import { vibrate } from '@/lib/haptics';
import { rideEvents, thin, useRide, type AssignedBy } from '@/store/rideStore';
import type { Route } from '@/lib/routing';
import type { FleetUnit, LatLng } from '@/types';

/** Pedidos ya anunciados a la central en esta carga de página (evita duplicados). */
const announced = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
/** Tope de la ruta de llegada por OSRM (sin acelerar con `?sim`: es red, no simulación). */
const ROUTE_TIMEOUT_MS = SIM_TIMINGS.approachRouteTimeoutMs;
/** Rumbo de salida del viaje (la unidad llega a la recogida mirando hacia allá). */
function tripStartBearing(): number | undefined {
  const r = useRide.getState().route;
  return r && r.source === 'osrm' && r.path.length >= 2 ? poseOnPath(r.path, 0).bearing : undefined;
}

/** Rutas de llegada preparadas durante la búsqueda (por pedido y unidad). */
const planned = new Map<string, Promise<PlannedApproach>>();

/**
 * Ruta de llegada para asignar `unit` ya: la preparada en la búsqueda si sirve; si no, una
 * nueva desde donde estará la unidad cuando llegue la respuesta.
 */
async function approachFor(rideId: string, unit: FleetUnit, pickup: LatLng) {
  const pre = planned.get(`${rideId}:${unit.id}`);
  if (pre) {
    const r = approachAt(await pre, Date.now());
    if (r) return r;
  }
  const fresh = await planApproach(unit, pickup, { at: Date.now() + 900, timeoutMs: ROUTE_TIMEOUT_MS, endBearing: tripStartBearing() });
  return approachAt(fresh, Date.now()) ?? fresh.route;
}
const nowIso = () => new Date().toISOString();

/** Reloj y ruta de la fase actual, para que la central mueva la unidad igual que el pasajero. */
function phaseInfo(route: Route | null | undefined) {
  const s = useRide.getState();
  return {
    driver_id: s.unit?.id,
    phase_started_at: s.phaseStartedAt ?? undefined,
    phase_ms: s.phaseDurationMs ?? undefined,
    path: route ? thin(route.path, 160) : undefined,
    path_source: route?.source,
  };
}

/**
 * Efectos del pedido: canal con la central, búsqueda con autoasignación, llegada de la
 * unidad, viaje y analítica. El store solo guarda estado; aquí viven timers y red.
 *
 * Búsqueda (P5): publica `ride:created`. Si hay central (`centralOnline`), espera su
 * `ride:assigned` hasta `searchCentralTimeoutMs`; si no la hay, a los `searchAutoMs` se
 * autoasigna la unidad disponible más cercana del tipo correcto. Nunca se queda colgado.
 * Los timers se calculan desde el reloj de la fase: tras recargar, la simulación sigue.
 */
export function useRideSimulation({ centralOnline }: { centralOnline: boolean }) {
  const toast = useToast();
  const step = useRide((s) => s.step);
  const rideId = useRide((s) => s.ride?.id ?? null);
  const phaseStartedAt = useRide((s) => s.phaseStartedAt);
  const phaseDurationMs = useRide((s) => s.phaseDurationMs);
  const centralMode = useRide((s) => s.centralMode);
  const assigning = useRef<string | null>(null);

  /* -------------------------------------------------- Canal y analítica */
  useEffect(
    () =>
      rideEvents.on((e) => {
        switch (e.type) {
          case 'destination_selected':
            track('destination_selected', { place: e.spot.place_id ?? 'map' });
            break;
          case 'requested':
            track('ride_requested', {
              service: e.ride.service_id,
              payment: e.ride.payment_method,
              value: e.ride.fare_estimate_usd,
              scheduled: !!e.ride.scheduled_for,
            });
            break;
          case 'assigned':
            // Confirmación háptica corta (Android): ya hay unidad.
            vibrate('confirm');
            if (e.by === 'auto') {
              postMessage('passenger', {
                type: 'ride:assigned',
                ride_id: e.ride.id,
                unit: e.unit,
                eta_s: e.approach.duration_s,
                by: 'auto',
                at: nowIso(),
              });
            }
            postMessage('passenger', {
              type: 'ride:status',
              ride_id: e.ride.id,
              status: 'en_route',
              eta_s: e.approach.duration_s,
              at: nowIso(),
              ...phaseInfo(e.approach),
            });
            track('ride_assigned', { by: e.by, service: e.ride.service_id });
            break;
          case 'reassigned': {
            // La central cambió la unidad: le confirmamos el nuevo reloj y la nueva ruta de llegada.
            const approach = useRide.getState().approach;
            postMessage('passenger', {
              type: 'ride:status',
              ride_id: e.ride.id,
              status: 'en_route',
              eta_s: approach?.duration_s,
              at: nowIso(),
              ...phaseInfo(approach),
            });
            track('ride_reassigned', { service: e.ride.service_id });
            break;
          }
          case 'arrived':
            postMessage('passenger', { type: 'ride:status', ride_id: e.ride.id, status: 'arrived', at: nowIso() });
            track('driver_arrived');
            break;
          case 'trip_started':
            postMessage('passenger', {
              type: 'ride:status',
              ride_id: e.ride.id,
              status: 'in_trip',
              at: nowIso(),
              ...phaseInfo(useRide.getState().route),
            });
            track('trip_started');
            break;
          case 'completed':
            postMessage('passenger', { type: 'ride:status', ride_id: e.ride.id, status: 'completed', at: nowIso() });
            track('trip_completed', { value: e.ride.fare_estimate_usd, service: e.ride.service_id });
            break;
          case 'cancelled':
            if (e.by === 'passenger') {
              postMessage('passenger', { type: 'ride:cancelled', ride_id: e.ride.id, by: 'passenger', reason: e.reason, at: nowIso() });
            }
            track('ride_cancelled', { by: e.by, at_status: e.ride.status });
            break;
          case 'rated':
            track('rating_submitted', { rating: e.rating, tip: e.tip });
            break;
        }
      }),
    [],
  );

  /* ---------------------------------------------------------- Asignación */
  const assign = useCallback(async (unit: FleetUnit, by: AssignedBy) => {
    const s = useRide.getState();
    if (s.step !== 'searching' || !s.ride || !s.pickup) return;
    if (assigning.current === s.ride.id) return; // ya hay una asignación en curso
    const id = s.ride.id;
    assigning.current = id;
    const T = simTimings();
    const pickup: LatLng = [s.pickup.lat, s.pickup.lng];
    // La búsqueda se ve al menos `searchMinMs`; la ruta se empalma al momento de asignar.
    await sleep((s.phaseStartedAt ?? Date.now()) + T.searchMinMs - Date.now());
    const approach = await approachFor(id, unit, pickup);
    const cur = useRide.getState();
    // La unidad, con su posición real al asignar (la misma que dibujan pasajero y central).
    if (cur.step === 'searching' && cur.ride?.id === id) cur.assignUnit(unitNow(unit), approach, by);
    assigning.current = null;
  }, []);

  // Búsqueda: anunciar el pedido, precalcular la ruta del candidato y autoasignar a tiempo.
  useEffect(() => {
    if (step !== 'searching' || !rideId) return;
    const s = useRide.getState();
    if (!s.ride || !s.pickup) return;
    if (!announced.has(rideId)) {
      announced.add(rideId);
      postMessage('passenger', { type: 'ride:created', ride: s.ride });
    }
    const pickup: LatLng = [s.pickup.lat, s.pickup.lng];
    const T = simTimings();
    // Central en modo manual: el operador tiene más tiempo antes de la autoasignación.
    const wait = centralMode === 'manual' ? T.searchManualTimeoutMs : centralOnline || centralMode ? T.searchCentralTimeoutMs : T.searchAutoMs;
    const deadline = (s.phaseStartedAt ?? Date.now()) + wait;
    // Candidato: la unidad visible más cercana del tipo correcto, con su posición de ahora.
    // Su ruta se prepara ya, desde donde estará al vencer la espera (una sola petición).
    const candidate = pickUnit(s.serviceId, pickup);
    const k = candidate ? `${rideId}:${candidate.id}` : '';
    if (candidate && !planned.has(k) && centralMode !== 'manual') {
      planned.set(k, planApproach(candidate, pickup, { at: Math.max(Date.now() + 1_000, deadline + 400), timeoutMs: ROUTE_TIMEOUT_MS, endBearing: tripStartBearing() }));
    }
    const t = setTimeout(() => {
      const unit = candidate ?? pickUnit(s.serviceId, pickup);
      if (unit) void assign(unit, 'auto');
    }, Math.max(0, deadline - Date.now()));
    return () => clearTimeout(t);
  }, [step, rideId, centralOnline, centralMode, assign]);

  // Respuestas de la central.
  useChannel(
    (env) => {
      const m = env.msg;
      const s = useRide.getState();
      if (!s.ride || !('ride_id' in m) || m.ride_id !== s.ride.id) return;
      if (m.type === 'ride:ack' && s.step === 'searching') {
        s.setCentralAck(m.ride_id, m.mode);
      } else if (m.type === 'ride:assigned' && m.by === 'central' && s.step === 'searching') {
        void assign(m.unit, 'central');
      } else if (m.type === 'ride:reassigned' && s.step === 'assigned' && s.pickup) {
        const unit = m.unit;
        void approachFor(s.ride.id, unit, [s.pickup.lat, s.pickup.lng]).then((approach) => {
          if (useRide.getState().reassignUnit(unitNow(unit), approach)) {
            toast.show({
              id: 'reassigned',
              tone: 'warning',
              title: 'Cambiamos tu unidad',
              description: `${unit.display_name} va en camino · ${unit.vehicle.plate.replace('-', '\u2011')}`,
              duration: 5000,
            });
          }
        });
      } else if (m.type === 'ride:cancelled' && m.by === 'central') {
        if (s.cancel('central', m.reason)) {
          toast.show({
            id: 'cancelled',
            tone: 'warning',
            title: 'La central canceló tu pedido',
            description: m.reason ?? 'Puedes pedir de nuevo o escribirnos por WhatsApp.',
          });
        }
      }
    },
    { from: 'central' },
  );

  /* ------------------------------------------------- Llegada y viaje */
  useEffect(() => {
    if (step !== 'assigned' || !phaseStartedAt || !phaseDurationMs) return;
    const T = simTimings();
    const end = phaseStartedAt + phaseDurationMs;
    const t1 = setTimeout(
      () => {
        const s = useRide.getState();
        // El aviso "Tu IVANCAR llegó" (con vibración) lo muestra PassengerApp (ArrivalBanner).
        s.markArrived();
      },
      Math.max(0, end - Date.now()),
    );
    const t2 = setTimeout(() => useRide.getState().startTrip(), Math.max(0, end + T.arrivedPauseMs - Date.now()));
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [step, phaseStartedAt, phaseDurationMs, toast]);

  useEffect(() => {
    if (step !== 'inTrip' || !phaseStartedAt || !phaseDurationMs) return;
    const t = setTimeout(() => useRide.getState().completeTrip(), Math.max(0, phaseStartedAt + phaseDurationMs - Date.now()));
    return () => clearTimeout(t);
  }, [step, phaseStartedAt, phaseDurationMs]);
}
