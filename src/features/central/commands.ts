import { postMessage } from '@/lib/channel';
import { useDispatch, type AssignmentOut, type DispatchMode } from '@/store/dispatchStore';

/**
 * Acciones de la central que, además de cambiar su store, avisan al pasajero por el canal.
 * Los pedidos sembrados (`source: 'seed'`) no publican nada: no hay pasajero detrás.
 */

const nowIso = () => new Date().toISOString();

export function publishAssigned(a: AssignmentOut) {
  if (a.order.source !== 'app') return;
  postMessage('central', {
    type: 'ride:assigned',
    ride_id: a.order.id,
    unit: a.unit,
    eta_s: a.order.approach?.duration_s ?? 300,
    by: 'central',
    at: nowIso(),
  });
}

export function publishAck(rideId: string, mode: DispatchMode) {
  postMessage('central', { type: 'ride:ack', ride_id: rideId, mode, at: nowIso() });
}

export const central = {
  /** El operador asigna una unidad a un pedido sin asignar. */
  assign(orderId: string, unitId: string) {
    const a = useDispatch.getState().assign(orderId, unitId, 'manual');
    if (a) publishAssigned(a);
    return a;
  },

  /** El operador cambia la unidad de un pedido asignado o en camino. */
  reassign(orderId: string, unitId: string, reason = 'La central reasignó tu pedido') {
    const previous = useDispatch.getState().orders.find((o) => o.id === orderId)?.unit_id ?? null;
    const a = useDispatch.getState().reassign(orderId, unitId);
    if (a && a.order.source === 'app') {
      postMessage('central', {
        type: 'ride:reassigned',
        ride_id: orderId,
        unit: a.unit,
        previous_driver_id: previous ?? '',
        eta_s: a.order.approach?.duration_s ?? 300,
        reason,
        at: nowIso(),
      });
    }
    return a;
  },

  /** Acción directa de una alerta: asignar o reasignar ya a la mejor unidad libre. */
  resolve(orderId: string) {
    const before = useDispatch.getState().orders.find((o) => o.id === orderId);
    if (!before) return null;
    if (before.status === 'requested') {
      const a = useDispatch.getState().resolveAlert(orderId);
      if (a) publishAssigned(a);
      return a;
    }
    const a = useDispatch.getState().resolveAlert(orderId);
    if (a && a.order.source === 'app') {
      postMessage('central', {
        type: 'ride:reassigned',
        ride_id: orderId,
        unit: a.unit,
        previous_driver_id: before.unit_id ?? '',
        eta_s: a.order.approach?.duration_s ?? 300,
        reason: 'La unidad anterior no avanzaba',
        at: nowIso(),
      });
    }
    return a;
  },

  setMode(mode: DispatchMode) {
    const s = useDispatch.getState();
    if (s.mode === mode) return;
    s.setMode(mode);
    // El pasajero que espera ajusta su tiempo de espera al modo de la central.
    for (const o of useDispatch.getState().orders) if (o.source === 'app' && o.status === 'requested') publishAck(o.id, mode);
  },
};
