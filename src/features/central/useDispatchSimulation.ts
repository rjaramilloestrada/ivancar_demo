import { useEffect } from 'react';
import { useChannel, usePresenceResponder } from '@/lib/channel';
import { patrolPosition, setFleetPlan } from '@/lib/fleetSim';
import { getRoute } from '@/lib/routing';
import { simTimings } from '@/lib/simConfig';
import { computeAlerts, dispatchEvents, dropoffOf, isActive, pickupOf, useDispatch, type LegKind } from '@/store/dispatchStore';
import { publishAck, publishAssigned } from './commands';

/** Cada cuánto avanza la simulación de la central (ms). No provoca renders si nada cambia. */
const TICK_MS = 250;

/**
 * Efectos de la central: presencia, canal con el pasajero, reloj de la simulación y
 * detección de alertas (emite `alert_raised` / `alert_resolved` en `dispatchEvents`).
 *
 * Coordinación con el pasajero:
 * - `ride:created` → entra a la cola (deduplicado) y se responde `ride:ack` con el modo.
 * - Modo auto: tras `centralAutoAssignMs` la central asigna y publica `ride:assigned`
 *   (`by: 'central'`). El pasajero espera esa asignación hasta `searchCentralTimeoutMs`
 *   (o `searchManualTimeoutMs` en manual) y, si no llega, se autoasigna (`by: 'auto'`):
 *   la central adopta esa unidad.
 * - `ride:status` del pasajero trae su reloj y su ruta: la central mueve la unidad igual.
 */
export function useDispatchSimulation() {
  usePresenceResponder('central');

  // Siembra (una vez por sesión) y reloj.
  useEffect(() => {
    useDispatch.getState().seed();
    const t = setInterval(() => {
      const { assigned } = useDispatch.getState().tick();
      for (const a of assigned) publishAssigned(a);
    }, TICK_MS);
    return () => clearInterval(t);
  }, []);

  // Alertas: se calculan con el reloj; se anuncian al aparecer y al resolverse.
  useEffect(() => {
    let open = new Set<string>();
    const check = () => {
      const alerts = computeAlerts(useDispatch.getState().orders, Date.now(), simTimings());
      const next = new Set(alerts.map((a) => a.order_id));
      for (const a of alerts) if (!open.has(a.order_id)) dispatchEvents.emit({ type: 'alert_raised', alert: a });
      for (const id of open) if (!next.has(id)) dispatchEvents.emit({ type: 'alert_resolved', order_id: id });
      open = next;
    };
    check();
    const t = setInterval(check, 500);
    return () => clearInterval(t);
  }, []);

  // Tramos provisionales de los pedidos simulados: se pide la ruta por calles (OSRM, con
  // caché y control de ritmo en lib/routing). Los de la app los manda el pasajero.
  useEffect(() => {
    const asked = new Set<string>();
    const resolve = () => {
      for (const o of useDispatch.getState().orders) {
        if (o.source !== 'seed' || !isActive(o)) continue;
        for (const kind of ['approach', 'trip'] as LegKind[]) {
          const leg = o[kind];
          if (!leg || leg.src !== 'pending') continue;
          const k = `${o.id}:${kind}:${leg.started_at}`;
          if (asked.has(k)) continue;
          asked.add(k);
          // Llegada: desde donde está ahora la unidad (sigue patrullando mientras tanto).
          // (Si quedó "atascada" antes de tener ruta, desde donde se detuvo.)
          const at = o.stalled_at != null ? Math.min(Date.now(), o.stalled_at) : Date.now();
          const pose = kind === 'approach' && o.unit_id ? patrolPosition(o.unit_id, at, leg.path[0]) : null;
          const from = pose ? pose.point : pickupOf(o);
          const to = kind === 'approach' ? pickupOf(o) : dropoffOf(o);
          void getRoute(from, to, { timeoutMs: 2500, startBearing: pose?.bearing }).then((route) => {
            useDispatch.getState().setLegRoute(o.id, kind, leg.started_at, route);
          });
        }
      }
    };
    resolve();
    return useDispatch.subscribe(resolve);
  }, []);

  // Pedido real nuevo: se selecciona para que el mapa lo encuadre (momento clave de la demo).
  useEffect(
    () =>
      dispatchEvents.on((e) => {
        if (e.type === 'order_received' && e.order.source === 'app') useDispatch.getState().selectOrder(e.order.id);
      }),
    [],
  );

  useChannel(
    (env) => {
      const m = env.msg;
      const s = useDispatch.getState();
      switch (m.type) {
        case 'ride:created': {
          s.receiveRide(m.ride);
          // También al repetido (recarga del pasajero): así recupera el modo de espera.
          const st = useDispatch.getState();
          if (st.orders.find((o) => o.id === m.ride.id)?.status === 'requested') publishAck(m.ride.id, st.mode);
          break;
        }
        case 'ride:assigned':
          if (m.by === 'auto') s.applyAppAssigned(m.ride_id, m.unit);
          break;
        case 'ride:status':
          s.applyStatus(m);
          break;
        case 'ride:cancelled':
          s.cancel(m.ride_id, 'passenger');
          break;
        case 'fleet:plan':
          setFleetPlan(m.plan);
          break;
      }
    },
    { from: 'passenger' },
  );
}
