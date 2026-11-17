import { beforeEach, describe, expect, it } from 'vitest';
import { estimateRoute } from '@/lib/routing';
import { simTimings } from '@/lib/simConfig';
import { fleetById, LOCAL_UNIT_IDS } from '@/mocks/drivers';
import type { Ride } from '@/types';
import {
  computeAlerts,
  computeKpis,
  dispatchEvents,
  pickupOf,
  rankUnits,
  unitPose,
  unitViews,
  useDispatch,
  type DispatchEvent,
} from '../dispatchStore';

const T = simTimings(1);
const S = () => useDispatch.getState();
const T0 = 1_800_000_000_000;

function ride(id = 'ride-test01', over: Partial<Ride> = {}): Ride {
  const iso = new Date(T0).toISOString();
  return {
    id,
    created_at: iso,
    updated_at: iso,
    status: 'requested',
    service_id: 'taxi',
    payment_method: 'cash',
    pickup_lat: -2.1449,
    pickup_lng: -79.8676,
    pickup_label: 'Parque Histórico',
    dropoff_lat: -2.1574,
    dropoff_lng: -79.8836,
    dropoff_label: 'Aeropuerto',
    distance_m: 4200,
    duration_s: 600,
    fare_estimate_usd: 4.25,
    fare_final_usd: null,
    driver_id: null,
    vehicle_id: null,
    assigned_at: null,
    completed_at: null,
    cancelled_at: null,
    scheduled_for: null,
    note: null,
    passenger_name: null,
    rating: null,
    tip_usd: null,
    ...over,
  };
}

let events: DispatchEvent[] = [];
let off: (() => void) | undefined;
beforeEach(() => {
  off?.();
  S().reset(T0);
  events = [];
  off = dispatchEvents.on((e) => events.push(e));
});

const order = (id = 'ride-test01') => S().orders.find((o) => o.id === id)!;

describe('entrada y deduplicación', () => {
  it('un ride:created entra arriba como "sin asignar" con hora de recepción', () => {
    expect(S().receiveRide(ride(), T0)).toBe(true);
    expect(S().orders).toHaveLength(1);
    expect(order().status).toBe('requested');
    expect(order().source).toBe('app');
    expect(order().received_at).toBe(T0);
    expect(events.map((e) => e.type)).toEqual(['order_received']);
  });

  it('el mismo id dos veces (recarga del pasajero) no duplica', () => {
    S().receiveRide(ride(), T0);
    expect(S().receiveRide(ride(), T0 + 2_000)).toBe(false);
    expect(S().orders).toHaveLength(1);
    expect(order().received_at).toBe(T0);
  });

  it('los nuevos entran primero', () => {
    S().receiveRide(ride('ride-a'), T0);
    S().receiveRide(ride('ride-b'), T0 + 1);
    expect(S().orders.map((o) => o.id)).toEqual(['ride-b', 'ride-a']);
  });
});

describe('asignación automática', () => {
  it('espera la pausa visible y asigna la unidad libre más cercana del tipo correcto', () => {
    S().receiveRide(ride(), T0);
    expect(S().tick(T0 + T.centralAutoAssignMs - 10).assigned).toHaveLength(0);
    const { assigned } = S().tick(T0 + T.centralAutoAssignMs);
    expect(assigned).toHaveLength(1);
    const o = order();
    expect(o.status).toBe('assigned'); // pedido real: "asignado" hasta que el pasajero confirme
    expect(o.assigned_via).toBe('auto');
    const unit = fleetById[o.unit_id!];
    expect(unit.vehicle.service_id).toBe('taxi');
    expect(unit.status).toBe('available');
    // Es la más cercana entre las libres del tipo correcto (posiciones en vivo).
    const ranked = rankUnits({ ...o, status: 'requested' }, [], T0 + T.centralAutoAssignMs).filter((c) => c.compatible);
    expect(o.unit_id).toBe(ranked[0].unit.id);
    // La unidad mandada al pasajero lleva su posición actual.
    expect(assigned[0].unit.lat).not.toBe(unit.lat);
    expect(o.approach?.path.length).toBeGreaterThan(1);
  });

  it('en modo manual no asigna sola; el operador elige', () => {
    S().setMode('manual', T0);
    S().receiveRide(ride(), T0);
    expect(S().tick(T0 + 60_000).assigned).toHaveLength(0);
    expect(order().status).toBe('requested');
    const pick = rankUnits(order(), S().orders, T0 + 61_000)[2];
    const out = S().assign('ride-test01', pick.unit.id, 'manual', T0 + 61_000);
    expect(out?.unit.id).toBe(pick.unit.id);
    expect(order().assigned_via).toBe('manual');
    // Una unidad ocupada no se puede volver a asignar.
    S().receiveRide(ride('ride-x'), T0 + 62_000);
    expect(S().assign('ride-x', pick.unit.id, 'manual', T0 + 62_000)).toBeNull();
  });

  it('pasar a auto programa la asignación de los pendientes', () => {
    S().setMode('manual', T0);
    S().receiveRide(ride(), T0);
    S().setMode('auto', T0 + 5_000);
    expect(order().auto_at).toBeGreaterThan(T0 + 5_000);
    S().tick(T0 + 5_000 + T.centralAutoAssignMs);
    expect(order().status).toBe('assigned');
  });

  it('la unidad asignada deja de contar como disponible', () => {
    const before = computeKpis(S()).unitsAvailable;
    S().receiveRide(ride(), T0);
    S().tick(T0 + T.centralAutoAssignMs);
    expect(computeKpis(S()).unitsAvailable).toBe(before - 1);
    expect(unitViews(S().orders).find((v) => v.unit.id === order().unit_id)?.state).toBe('assigned');
  });
});

describe('estados del pasajero', () => {
  it('refleja en_route con el reloj y la ruta del pasajero, y avanza hasta finalizado', () => {
    S().receiveRide(ride(), T0);
    S().tick(T0 + T.centralAutoAssignMs);
    const unitId = order().unit_id!;
    const path = estimateRoute([-2.13, -79.86], [-2.1449, -79.8676]).path;
    S().applyStatus({ ride_id: 'ride-test01', status: 'en_route', driver_id: unitId, phase_started_at: T0 + 4_000, phase_ms: 13_000, path }, T0 + 4_100);
    expect(order().status).toBe('en_route');
    expect(order().approach?.started_at).toBe(T0 + 4_000);
    // A mitad de la fase, la unidad está a mitad de la ruta del pasajero.
    const mid = unitPose(unitId, order(), T0 + 4_000 + 6_500);
    expect(mid.mode).toBe('approach');
    S().applyStatus({ ride_id: 'ride-test01', status: 'arrived' }, T0 + 17_000);
    S().applyStatus({ ride_id: 'ride-test01', status: 'in_trip', phase_started_at: T0 + 19_600, phase_ms: 16_000, path }, T0 + 19_600);
    expect(unitPose(unitId, order(), T0 + 25_000).mode).toBe('trip');
    S().applyStatus({ ride_id: 'ride-test01', status: 'completed' }, T0 + 36_000);
    expect(order().status).toBe('completed');
    // No retrocede.
    expect(S().applyStatus({ ride_id: 'ride-test01', status: 'en_route' }, T0 + 37_000)).toBe(false);
    expect(order().timeline.map((t) => t.status)).toEqual(['requested', 'assigned', 'en_route', 'arrived', 'in_trip', 'completed']);
  });

  it('si la app se autoasignó, la central adopta esa unidad', () => {
    S().setMode('manual', T0);
    S().receiveRide(ride(), T0);
    const unit = fleetById['drv-02'];
    expect(S().applyAppAssigned('ride-test01', unit, T0 + 6_000)).toBe(true);
    expect(order().unit_id).toBe('drv-02');
    expect(order().assigned_via).toBe('app');
  });

  it('ignora estados de pedidos que no conoce', () => {
    expect(S().applyStatus({ ride_id: 'ride-nada', status: 'arrived' }, T0)).toBe(false);
  });
});

describe('reasignación', () => {
  it('cambia la unidad antes de la recogida y libera la anterior', () => {
    S().receiveRide(ride(), T0);
    S().tick(T0 + T.centralAutoAssignMs);
    const first = order().unit_id!;
    const other = rankUnits(order(), S().orders, T0 + 5_000, [first]).find((c) => c.compatible)!;
    const out = S().reassign('ride-test01', other.unit.id, T0 + 5_000);
    expect(out?.unit.id).toBe(other.unit.id);
    expect(order().unit_id).toBe(other.unit.id);
    expect(order().reassignments).toBe(1);
    expect(unitViews(S().orders).find((v) => v.unit.id === first)?.state).toBe('available');
    expect(events.some((e) => e.type === 'reassigned')).toBe(true);
  });

  it('no se reasigna cuando la unidad ya llegó o el viaje empezó', () => {
    S().receiveRide(ride(), T0);
    S().tick(T0 + T.centralAutoAssignMs);
    S().applyStatus({ ride_id: 'ride-test01', status: 'arrived' }, T0 + 10_000);
    const other = rankUnits(order(), S().orders, T0 + 10_000)[0];
    expect(S().reassign('ride-test01', other.unit.id, T0 + 10_000)).toBeNull();
  });
});

describe('alertas', () => {
  it('pedido sin asignar más allá del umbral → alerta; "Asignar ya" la resuelve', () => {
    S().setMode('manual', T0);
    S().receiveRide(ride(), T0);
    expect(computeAlerts(S().orders, T0 + T.alertUnassignedMs - 1, T)).toHaveLength(0);
    const alerts = computeAlerts(S().orders, T0 + T.alertUnassignedMs, T);
    expect(alerts).toEqual([expect.objectContaining({ order_id: 'ride-test01', kind: 'unassigned' })]);
    expect(S().resolveAlert('ride-test01', T0 + T.alertUnassignedMs + 1)).not.toBeNull();
    expect(computeAlerts(S().orders, T0 + T.alertUnassignedMs + 2, T)).toHaveLength(0);
  });

  it('unidad que no avanza → alerta; "Reasignar ya" cambia la unidad y la quita', () => {
    S().seed(T0);
    const stuck = S().orders.find((o) => o.stalled_at != null)!;
    expect(stuck).toBeDefined();
    const t = stuck.stalled_at! + T.alertStalledMs;
    expect(computeAlerts(S().orders, t - 1, T).some((a) => a.order_id === stuck.id)).toBe(false);
    expect(computeAlerts(S().orders, t, T)).toContainEqual(expect.objectContaining({ order_id: stuck.id, kind: 'stalled' }));
    // La unidad atascada no se mueve.
    const a = unitPose(stuck.unit_id!, stuck, t);
    const b = unitPose(stuck.unit_id!, stuck, t + 5_000);
    expect(a.point).toEqual(b.point);
    const out = S().resolveAlert(stuck.id, t + 1);
    expect(out?.unit.id).not.toBe(stuck.unit_id);
    expect(computeAlerts(S().orders, t + 2, T).some((x) => x.order_id === stuck.id)).toBe(false);
  });

  it('pedido real cuya unidad se pasó de su hora de llegada también alerta', () => {
    S().receiveRide(ride(), T0);
    S().tick(T0 + T.centralAutoAssignMs);
    const end = order().approach!.started_at + order().approach!.duration_ms;
    expect(computeAlerts(S().orders, end + T.alertStalledMs, T)).toContainEqual(expect.objectContaining({ kind: 'stalled' }));
  });
});

describe('cancelación', () => {
  it('la cancelación del pasajero se refleja y libera la unidad', () => {
    S().receiveRide(ride(), T0);
    S().tick(T0 + T.centralAutoAssignMs);
    const unitId = order().unit_id!;
    expect(S().cancel('ride-test01', 'passenger', T0 + 5_000)).toBe(true);
    expect(order().status).toBe('cancelled');
    expect(order().cancelled_by).toBe('passenger');
    expect(unitViews(S().orders).find((v) => v.unit.id === unitId)?.state).toBe('available');
    expect(S().cancel('ride-test01', 'passenger', T0 + 6_000)).toBe(false);
    expect(computeKpis(S()).active).toBe(0);
  });

  it('cancelar un pedido sin asignar evita que se asigne después', () => {
    S().receiveRide(ride(), T0);
    S().cancel('ride-test01', 'passenger', T0 + 500);
    expect(S().tick(T0 + 60_000).assigned).toHaveLength(0);
  });
});

describe('actividad sembrada', () => {
  it('siembra una vez pedidos en varios estados, incluido uno atascado', () => {
    expect(S().seed(T0)).toBe(true);
    expect(S().seed(T0 + 1)).toBe(false);
    const st = new Set(S().orders.map((o) => o.status));
    for (const x of ['completed', 'cancelled', 'in_trip', 'en_route', 'requested'] as const) expect(st.has(x)).toBe(true);
    expect(S().orders.every((o) => o.source === 'seed')).toBe(true);
    // Las unidades de los pedidos activos no se repiten.
    const units = S().orders.filter((o) => ['en_route', 'in_trip'].includes(o.status)).map((o) => o.unit_id);
    expect(new Set(units).size).toBe(units.length);
  });

  it('los sembrados avanzan solos y aparecen pedidos nuevos', () => {
    S().seed(T0);
    const n = S().orders.length;
    let t = T0;
    for (let i = 0; i < 200; i++) S().tick((t += 500));
    expect(S().orders.length).toBeGreaterThan(n);
    expect(S().orders.filter((o) => o.status === 'completed').length).toBeGreaterThan(1);
  });

  it('el promedio de asignación cuenta solo lo decidido en la sesión', () => {
    S().seed(T0);
    expect(computeKpis(S()).avgAssignMs).toBeNull();
    S().tick(T0 + T.centralAutoAssignMs + 10);
    const k = computeKpis(S());
    expect(k.assignedCount).toBe(1);
    expect(k.avgAssignMs).toBeGreaterThan(T.centralAutoAssignMs - 1);
  });
});

describe('flota de zona y rutas por calles', () => {
  it('los pedidos sembrados no usan las unidades de zona (las que ve el pasajero)', () => {
    S().seed(T0);
    let t = T0;
    for (let i = 0; i < 120; i++) S().tick((t += 500));
    const used = S().orders.filter((o) => o.source === 'seed' && o.unit_id).map((o) => o.unit_id!);
    expect(used.length).toBeGreaterThan(2);
    for (const id of used) expect(LOCAL_UNIT_IDS).not.toContain(id);
  });

  it('un pedido de la app sí puede ir a una unidad de zona', () => {
    S().receiveRide(ride(), T0);
    const ranked = rankUnits(order(), S().orders, T0);
    expect(ranked.some((c) => LOCAL_UNIT_IDS.includes(c.unit.id))).toBe(true);
  });

  it('tramo provisional: no avanza hasta tener la ruta; con ella, el reloj arranca', () => {
    S().seed(T0);
    const o = S().orders.find((x) => x.source === 'seed' && x.status === 'en_route' && x.stalled_at == null)!;
    expect(o.approach?.src).toBe('pending');
    expect(unitPose(o.unit_id!, o, T0 + 1_000).mode).toBe('patrol');
    const route = { ...estimateRoute([-2.13, -79.86], pickupOf(o)), source: 'osrm' as const };
    expect(S().setLegRoute(o.id, 'approach', o.approach!.started_at, route, T0 + 1_500)).toBe(true);
    const next = S().orders.find((x) => x.id === o.id)!;
    expect(next.approach?.src).toBe('osrm');
    expect(next.approach?.started_at).toBe(T0 + 1_500);
    expect(next.approach?.path).toBe(route.path);
    expect(unitPose(o.unit_id!, next, T0 + 1_600).mode).toBe('approach');
    // Una respuesta para un tramo que ya cambió se ignora.
    expect(S().setLegRoute(o.id, 'approach', o.approach!.started_at, route, T0 + 2_000)).toBe(false);
  });
});
