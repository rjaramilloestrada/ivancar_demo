import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui';
import { track } from '@/lib/analytics';
import { postMessage, useChannel } from '@/lib/channel';
import { buildApproach, pickUnit } from '@/lib/dispatch';
import { simTimings } from '@/lib/simConfig';
import { fleet } from '@/mocks/drivers';
import { rideEvents, thin, useRide, type AssignedBy } from '@/store/rideStore';
import type { FleetUnit, LatLng } from '@/types';

/** Pedidos ya anunciados a la central en esta carga de página (evita duplicados). */
const announced = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const nowIso = () => new Date().toISOString();

/** Reloj y ruta de la fase actual, para que la central mueva la unidad igual que el pasajero. */
function phaseInfo(path: LatLng[] | undefined) {
  const s = useRide.getState();
  return {
    driver_id: s.unit?.id,
    phase_started_at: s.phaseStartedAt ?? undefined,
    phase_ms: s.phaseDurationMs ?? undefined,
    path: path ? thin(path, 120) : undefined,
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
              ...phaseInfo(e.approach.path),
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
              ...phaseInfo(approach?.path),
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
              ...phaseInfo(useRide.getState().route?.path),
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
    const approach = await buildApproach(unit, [s.pickup.lat, s.pickup.lng], T.approachRouteTimeoutMs);
    await sleep((s.phaseStartedAt ?? Date.now()) + T.searchMinMs - Date.now());
    const cur = useRide.getState();
    if (cur.step === 'searching' && cur.ride?.id === id) cur.assignUnit(unit, approach, by);
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
    const candidate = pickUnit(s.serviceId, pickup) ?? fleet[0];
    void buildApproach(candidate, pickup, T.approachRouteTimeoutMs); // queda en caché de rutas
    // Central en modo manual: el operador tiene más tiempo antes de la autoasignación.
    const wait = centralMode === 'manual' ? T.searchManualTimeoutMs : centralOnline || centralMode ? T.searchCentralTimeoutMs : T.searchAutoMs;
    const deadline = (s.phaseStartedAt ?? Date.now()) + wait;
    const t = setTimeout(() => void assign(candidate, 'auto'), Math.max(0, deadline - Date.now()));
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
        void buildApproach(unit, [s.pickup.lat, s.pickup.lng], simTimings().approachRouteTimeoutMs).then((approach) => {
          if (useRide.getState().reassignUnit(unit, approach)) {
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
    const t1 = setTimeout(() => {
      const s = useRide.getState();
      if (s.markArrived() && s.unit) {
        // Bloque 5: vibración (Vibration API) vía rideEvents 'arrived'.
        toast.show({
          id: 'arrived',
          tone: 'success',
          title: 'Tu IVANCAR llegó',
          description: `${s.unit.display_name} te espera · ${s.unit.vehicle.plate.replace('-', '\u2011')}`,
          duration: 5000,
        });
      }
    }, Math.max(0, end - Date.now()));
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
