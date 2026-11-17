import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { COMPATIBLE, estimatePickupMinutes } from '@/lib/dispatch';
import { patrolPosition, poseAlong, travelProgress, type FleetPose } from '@/lib/fleetSim';
import { haversine } from '@/lib/geo';
import { estimateFare } from '@/lib/pricing';
import { estimateRoute, type Route } from '@/lib/routing';
import { simTimings, type SimTimings } from '@/lib/simConfig';
import { seedPayments, seedServices, seedTrips, type SeedTrip } from '@/mocks/dispatchSeeds';
import { fleet, fleetById, LOCAL_UNIT_IDS } from '@/mocks/drivers';
import { servicesById } from '@/mocks/services';
import type { FleetUnit, LatLng, Ride, RideStatus, ServiceId } from '@/types';

/**
 * Estado de la central de despacho (`#/central`), separado del pasajero.
 *
 * - Pedidos: los reales (`source: 'app'`) llegan por el canal desde la vista pasajero; los
 *   simulados (`source: 'seed'`) los siembra la propia central para que el panel tenga vida.
 * - El store es puro: no publica en el canal ni pone timers. `tick(now)` avanza la
 *   simulación (asignación automática, fases de los pedidos sembrados, pedidos nuevos) y
 *   devuelve lo que la capa de efectos (`features/central/useDispatchSimulation.ts`) debe
 *   comunicar al pasajero.
 * - Los pedidos reales los "mueve" el pasajero: la central refleja sus `ride:status` y usa
 *   su reloj y su ruta (`phase_started_at`, `phase_ms`, `path`) para dibujar la unidad.
 * - Todo lo que depende del tiempo se calcula con el reloj de pared: tras recargar, cada
 *   unidad está donde debe. Se persiste en sessionStorage (clave `ivancar-dispatch`).
 */

export type OrderSource = 'app' | 'seed';
export type DispatchMode = 'auto' | 'manual';
/** Quién decidió la unidad: la central sola, el operador, o la app (sin respuesta de la central). */
export type AssignedVia = 'auto' | 'manual' | 'app';
/** Filtros de la cola. 'closed' = finalizados y cancelados. */
export type OrderFilter = 'all' | 'unassigned' | 'active' | 'closed';

/** Tramo con reloj: la unidad recorre `path` entre `started_at` y `started_at + duration_ms`. */
export interface OrderLeg {
  path: LatLng[];
  started_at: number;
  duration_ms: number;
  /** Duración creíble que se muestra (s). El demo comprime el tiempo. */
  duration_s: number;
  /**
   * Origen del trazado: 'osrm' (por calles), 'fallback' (estimado: OSRM no respondió) o
   * 'pending' (trazado provisional mientras se pide la ruta: no se dibuja y la unidad no
   * arranca hasta tenerla). Sin el campo (datos viejos) se trata como 'osrm'.
   */
  src?: 'osrm' | 'fallback' | 'pending';
}

export type LegKind = 'approach' | 'trip';

export interface TimelineEntry {
  status: RideStatus | 'reassigned';
  at: number;
  note?: string;
}

export interface DispatchOrder {
  id: string;
  source: OrderSource;
  /** Fila del pedido tal como la mandó el pasajero (o la generó la simulación). */
  ride: Ride;
  status: RideStatus;
  /** Cuándo lo recibió la central (ms de época). */
  received_at: number;
  status_at: number;
  unit_id: string | null;
  assigned_at: number | null;
  assigned_via: AssignedVia | null;
  /** Modo auto: momento en que la central asigna sola. */
  auto_at: number | null;
  approach: OrderLeg | null;
  trip: OrderLeg | null;
  /** Simulación de "la unidad no avanza": detenida desde este momento en este progreso. */
  stalled_at: number | null;
  stalled_progress: number | null;
  /** Simulación: la unidad se detendrá al llegar a esta fracción del camino (solo sembrados). */
  stall_plan: number | null;
  reassignments: number;
  cancelled_by: 'passenger' | 'central' | null;
  timeline: TimelineEntry[];
}

export interface DispatchState {
  orders: DispatchOrder[];
  mode: DispatchMode;
  selectedOrderId: string | null;
  selectedUnitId: string | null;
  filter: OrderFilter;
  /** Inicio de la sesión de la central: el promedio de asignación cuenta desde aquí. */
  sessionStartedAt: number;
  seeded: boolean;
  nextSeedAt: number | null;
  seedCount: number;
}

/** Asignación hecha por el store que hay que comunicar al pasajero. */
export interface AssignmentOut {
  order: DispatchOrder;
  unit: FleetUnit;
  via: AssignedVia;
}

export interface TickResult {
  assigned: AssignmentOut[];
}

export interface DispatchActions {
  /** Siembra la actividad inicial (una sola vez por sesión). */
  seed(now?: number): boolean;
  /** Pedido nuevo desde el pasajero. Deduplica por id: devuelve false si ya existía. */
  receiveRide(ride: Ride, now?: number): boolean;
  setMode(mode: DispatchMode, now?: number): void;
  /** Asigna una unidad a un pedido sin asignar. La unidad debe estar libre. */
  assign(orderId: string, unitId: string, via: AssignedVia, now?: number): AssignmentOut | null;
  /** Cambia la unidad de un pedido asignado o en camino (antes de que llegue). */
  reassign(orderId: string, unitId: string, now?: number): AssignmentOut | null;
  /** Atajo de las alertas: asigna (o reasigna) ya a la mejor unidad libre. */
  resolveAlert(orderId: string, now?: number): AssignmentOut | null;
  /** El pasajero se autoasignó (sin central a tiempo) o confirmó otra unidad. */
  applyAppAssigned(rideId: string, unit: FleetUnit, now?: number): boolean;
  /** `ride:status` del pasajero. */
  applyStatus(msg: AppStatus, now?: number): boolean;
  cancel(orderId: string, by: 'passenger' | 'central', now?: number): boolean;
  /** Avanza la simulación hasta `now`. */
  tick(now?: number): TickResult;
  /**
   * Ruta pedida para un tramo provisional (`src: 'pending'`). `startedAt` identifica el
   * tramo (si cambió, se ignora). El reloj del tramo empieza ahora.
   */
  setLegRoute(orderId: string, kind: LegKind, startedAt: number, route: Route, now?: number): boolean;
  selectOrder(id: string | null): void;
  selectUnit(id: string | null): void;
  setFilter(f: OrderFilter): void;
  /** Todo a cero (demo nueva). */
  reset(now?: number): void;
}

export interface AppStatus {
  ride_id: string;
  status: 'en_route' | 'arrived' | 'in_trip' | 'completed';
  driver_id?: string;
  phase_started_at?: number;
  phase_ms?: number;
  path?: LatLng[];
  /** Origen de `path` (por calles o estimado). */
  path_source?: 'osrm' | 'fallback';
  eta_s?: number;
}

export type DispatchStore = DispatchState & DispatchActions;

/* ------------------------------------------------------------ Constantes */

export const ACTIVE: readonly RideStatus[] = ['requested', 'assigned', 'en_route', 'arrived', 'in_trip'];
/** Estados en que la unidad todavía no recoge al pasajero: se puede reasignar. */
export const REASSIGNABLE: readonly RideStatus[] = ['assigned', 'en_route'];
/** Pedidos terminados que se conservan en pantalla. */
export const MAX_FINISHED = 14;
/** Los pedidos sembrados van algo más lentos que el del pasajero: el tablero no "hierve". */
const SEED_APPROACH_FACTOR = 1.6;
const SEED_TRIP_FACTOR = 1.8;
/**
 * Recorridos de los sembrados, en orden (índices de `seedTrips`). Los seis primeros son los
 * del arranque: el atascado y el que espera van por Guayaquil, lejos de la recogida por
 * defecto del pasajero (Parque Histórico), para que no se tapen en el mapa.
 */
const SEED_TRIP_ORDER = [0, 7, 1, 9, 4, 10, 3, 6, 2, 11, 5, 8];
/** Cada cuántos pedidos sembrados uno se queda "atascado" (dispara la alerta). */
const STALL_EVERY = 4;

export const isActive = (o: Pick<DispatchOrder, 'status'>) => ACTIVE.includes(o.status);

/* ----------------------------------------------------------- Bus de eventos */

export type DispatchEvent =
  | { type: 'order_received'; order: DispatchOrder }
  | { type: 'assigned'; order: DispatchOrder; unit: FleetUnit; via: AssignedVia }
  | { type: 'reassigned'; order: DispatchOrder; unit: FleetUnit; previous_unit_id: string | null }
  | { type: 'status'; order: DispatchOrder }
  | { type: 'cancelled'; order: DispatchOrder }
  | { type: 'alert_raised'; alert: DispatchAlert }
  | { type: 'alert_resolved'; order_id: string };

const listeners = new Set<(e: DispatchEvent) => void>();

/**
 * Eventos de la central: punto de enganche para la capa de animación (Bloque 5),
 * el anunciador accesible y la analítica. Un oyente nunca rompe el flujo.
 */
export const dispatchEvents = {
  on(fn: (e: DispatchEvent) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(e: DispatchEvent) {
    for (const fn of [...listeners]) {
      try {
        fn(e);
      } catch {
        /* nada */
      }
    }
  },
};

/* -------------------------------------------------------------- Utilidades */

/** Código corto y legible del pedido ("A7K3QX"). Mismo formato que ve el pasajero. */
export function orderCode(id: string): string {
  return id.replace(/^(ride|seed)-/, '').slice(0, 6).toUpperCase();
}

export const pickupOf = (o: DispatchOrder): LatLng => [o.ride.pickup_lat, o.ride.pickup_lng];
export const dropoffOf = (o: DispatchOrder): LatLng => [o.ride.dropoff_lat, o.ride.dropoff_lng];

/** Avance (0..1) sobre el tramo a la hora `now`, con arranque y frenado suaves (como el pasajero). */
export function legProgress(leg: OrderLeg | null, now: number): number {
  if (!leg || leg.src === 'pending') return 0;
  return travelProgress((now - leg.started_at) / Math.max(1, leg.duration_ms));
}

/** Unidades que la central no usa para pedidos simulados (las que ve el pasajero). */
export const seedExclude = (o: Pick<DispatchOrder, 'source'>): string[] => (o.source === 'seed' ? [...LOCAL_UNIT_IDS] : []);

/** Progreso de la llegada de la unidad (congelado si está "atascada"). */
export function approachProgress(o: DispatchOrder, now: number): number {
  if (o.stalled_at != null && o.stalled_progress != null && now >= o.stalled_at) return o.stalled_progress;
  return legProgress(o.approach, now);
}

/** Índice unidad → pedido activo que la ocupa. */
export function busyIndex(orders: readonly DispatchOrder[]): Map<string, DispatchOrder> {
  const m = new Map<string, DispatchOrder>();
  for (const o of orders) if (o.unit_id && isActive(o) && o.status !== 'requested') m.set(o.unit_id, o);
  return m;
}

export type UnitState = 'available' | 'busy' | 'assigned';

export interface UnitView {
  unit: FleetUnit;
  state: UnitState;
  order: DispatchOrder | null;
}

/** Estado de cada unidad: libre, ocupada (fuera de la central) o en un pedido. */
export function unitViews(orders: readonly DispatchOrder[]): UnitView[] {
  const idx = busyIndex(orders);
  return fleet
    .filter((u) => u.status !== 'offline')
    .map((u) => {
      const order = idx.get(u.id) ?? null;
      return { unit: u, order, state: order ? 'assigned' : u.status === 'busy' ? 'busy' : 'available' };
    });
}

/**
 * Posición de una unidad a la hora `now`: en patrulla, yendo a la recogida, esperando
 * o en viaje, según su pedido.
 */
export function unitPose(unitId: string, order: DispatchOrder | null, now: number): FleetPose & { mode: 'patrol' | 'approach' | 'waiting' | 'trip' } {
  const base = fleetById[unitId];
  if (order && order.unit_id === unitId) {
    // Tramo provisional (ruta en camino): la unidad sigue su patrulla hasta tenerla.
    if ((order.status === 'assigned' || order.status === 'en_route') && order.approach) {
      if (order.approach.src !== 'pending') return { ...poseAlong(order.approach.path, approachProgress(order, now)), mode: 'approach' };
      // "Atascada" antes de tener ruta: queda donde estaba al detenerse.
      if (order.stalled_at != null && now >= order.stalled_at) {
        return { ...patrolPosition(unitId, order.stalled_at, base ? [base.lat, base.lng] : undefined), mode: 'approach' };
      }
    }
    if (order.status === 'arrived') {
      const end = order.approach ? poseAlong(order.approach.path, 1) : { point: pickupOf(order), bearing: 0 };
      return { ...end, mode: 'waiting' };
    }
    if (order.status === 'in_trip' && order.trip) {
      return { ...poseAlong(order.trip.path, legProgress(order.trip, now)), mode: 'trip' };
    }
  }
  return { ...patrolPosition(unitId, now, base ? [base.lat, base.lng] : undefined), mode: 'patrol' };
}

/** La unidad con su posición actual (lo que se manda al pasajero al asignar). */
export function unitAt(unitId: string, orders: readonly DispatchOrder[], now: number): FleetUnit {
  const u = fleetById[unitId];
  const order = busyIndex(orders).get(unitId) ?? null;
  const pose = unitPose(unitId, order, now);
  return { ...u, lat: pose.point[0], lng: pose.point[1], heading: Math.round(pose.bearing), updated_at: new Date(now).toISOString() };
}

export interface UnitCandidate {
  unit: FleetUnit;
  distance_m: number;
  eta_min: number;
  /** El tipo de vehículo sirve para el servicio pedido. */
  compatible: boolean;
}

/**
 * Unidades libres para un pedido, de la más cercana a la más lejana (con su posición
 * actual), con ETA. `compatible` marca las del tipo correcto.
 */
export function rankUnits(order: DispatchOrder, orders: readonly DispatchOrder[], now: number, exclude: string[] = []): UnitCandidate[] {
  const pickup = pickupOf(order);
  const types = COMPATIBLE[order.ride.service_id];
  return unitViews(orders)
    .filter((v) => v.state === 'available' && !exclude.includes(v.unit.id))
    .map((v) => {
      const unit = unitAt(v.unit.id, orders, now);
      return {
        unit,
        distance_m: haversine(pickup, [unit.lat, unit.lng]),
        eta_min: estimatePickupMinutes(unit, pickup),
        compatible: types.includes(unit.vehicle.service_id),
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m);
}

/**
 * Mejor unidad libre: la más cercana del tipo preferido (orden de `COMPATIBLE`), si no,
 * cualquier libre. Misma regla que `pickUnit` de `lib/dispatch.ts`, con posiciones en vivo.
 */
export function bestUnit(order: DispatchOrder, orders: readonly DispatchOrder[], now: number, exclude: string[] = []): UnitCandidate | null {
  const ranked = rankUnits(order, orders, now, exclude);
  for (const type of COMPATIBLE[order.ride.service_id]) {
    const hit = ranked.find((c) => c.unit.vehicle.service_id === type);
    if (hit) return hit;
  }
  return ranked[0] ?? null;
}

/* ---------------------------------------------------------------- Alertas */

export type AlertKind = 'unassigned' | 'stalled';

export interface DispatchAlert {
  order_id: string;
  kind: AlertKind;
  /** Desde cuándo hay alerta (ms de época). */
  since: number;
  /** Desde cuándo está el problema (espera sin asignar o unidad detenida). */
  problem_since: number;
}

/** Alertas activas a la hora `now`. Umbrales en `simConfig` (cortos en el demo). */
export function computeAlerts(orders: readonly DispatchOrder[], now: number, T: SimTimings = simTimings()): DispatchAlert[] {
  const out: DispatchAlert[] = [];
  for (const o of orders) {
    if (o.status === 'requested') {
      const since = o.received_at + T.alertUnassignedMs;
      if (now >= since) out.push({ order_id: o.id, kind: 'unassigned', since, problem_since: o.received_at });
    } else if (REASSIGNABLE.includes(o.status) && o.approach) {
      // La unidad no avanza: detenida (simulación) o pasada de su hora de llegada.
      const problem = o.stalled_at ?? o.approach.started_at + o.approach.duration_ms;
      const since = problem + T.alertStalledMs;
      if (now >= since) out.push({ order_id: o.id, kind: 'stalled', since, problem_since: problem });
    }
  }
  return out.sort((a, b) => a.since - b.since);
}

/* -------------------------------------------------------------- Indicadores */

export interface DispatchKpis {
  active: number;
  unassigned: number;
  unitsAvailable: number;
  unitsTotal: number;
  /** Promedio (ms) de recibido → asignado en esta sesión de la central. null = sin datos. */
  avgAssignMs: number | null;
  assignedCount: number;
}

export function computeKpis(s: Pick<DispatchState, 'orders' | 'sessionStartedAt'>): DispatchKpis {
  const views = unitViews(s.orders);
  const waits = s.orders
    .filter((o) => o.assigned_at != null && o.assigned_at >= s.sessionStartedAt && o.received_at >= s.sessionStartedAt - 1)
    .map((o) => o.assigned_at! - o.received_at);
  return {
    active: s.orders.filter(isActive).length,
    unassigned: s.orders.filter((o) => o.status === 'requested').length,
    unitsAvailable: views.filter((v) => v.state === 'available').length,
    unitsTotal: views.length,
    avgAssignMs: waits.length ? waits.reduce((a, b) => a + b, 0) / waits.length : null,
    assignedCount: waits.length,
  };
}

export function matchesFilter(o: DispatchOrder, f: OrderFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'unassigned':
      return o.status === 'requested';
    case 'active':
      return isActive(o) && o.status !== 'requested';
    case 'closed':
      return o.status === 'completed' || o.status === 'cancelled';
  }
}

/* -------------------------------------------------------- Pedidos sembrados */

function seedId(n: number, now: number): string {
  return `seed-${(now + n * 7919).toString(36).slice(-4)}${n.toString(36).padStart(2, '0')}`.toLowerCase();
}

function seedRide(id: string, trip: SeedTrip, service_id: ServiceId, payment: Ride['payment_method'], createdAt: number): Ride {
  const iso = new Date(createdAt).toISOString();
  const fare = estimateFare(servicesById[service_id], trip.distance_m).amount;
  return {
    id,
    created_at: iso,
    updated_at: iso,
    status: 'requested',
    service_id,
    payment_method: payment,
    pickup_lat: trip.pickup.lat,
    pickup_lng: trip.pickup.lng,
    pickup_label: trip.pickup.label,
    dropoff_lat: trip.dropoff.lat,
    dropoff_lng: trip.dropoff.lng,
    dropoff_label: trip.dropoff.label,
    distance_m: trip.distance_m,
    duration_s: trip.duration_s,
    fare_estimate_usd: fare,
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
  };
}

function newOrder(ride: Ride, source: OrderSource, receivedAt: number): DispatchOrder {
  return {
    id: ride.id,
    source,
    ride,
    status: 'requested',
    received_at: receivedAt,
    status_at: receivedAt,
    unit_id: null,
    assigned_at: null,
    assigned_via: null,
    auto_at: null,
    approach: null,
    trip: null,
    stalled_at: null,
    stalled_progress: null,
    stall_plan: null,
    reassignments: 0,
    cancelled_by: null,
    timeline: [{ status: 'requested', at: receivedAt }],
  };
}

/**
 * Tramo de llegada provisional desde la posición actual de la unidad: la capa de efectos
 * pide la ruta por calles (`setLegRoute`); si OSRM no responde, queda la estimada.
 */
function approachLeg(unit: FleetUnit, pickup: LatLng, startedAt: number, durationMs: number): OrderLeg {
  const r = estimateRoute([unit.lat, unit.lng], pickup);
  return { path: r.path, started_at: startedAt, duration_ms: durationMs, duration_s: r.duration_s, src: 'pending' };
}

/* ------------------------------------------------------------------ Store */

const memory = new Map<string, string>();
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return sessionStorage.getItem(k);
    } catch {
      return memory.get(k) ?? null;
    }
  },
  setItem: (k, v) => {
    try {
      sessionStorage.setItem(k, v);
    } catch {
      memory.set(k, v);
    }
  },
  removeItem: (k) => {
    try {
      sessionStorage.removeItem(k);
    } catch {
      memory.delete(k);
    }
  },
};

export const DISPATCH_STORAGE_KEY = 'ivancar-dispatch';

const initialState = (now = Date.now()): DispatchState => ({
  orders: [],
  mode: 'auto',
  selectedOrderId: null,
  selectedUnitId: null,
  filter: 'all',
  sessionStartedAt: now,
  seeded: false,
  nextSeedAt: null,
  seedCount: 0,
});

/** Reemplaza un pedido por id (inmutable). */
const patchOrder = (orders: DispatchOrder[], id: string, fn: (o: DispatchOrder) => DispatchOrder) =>
  orders.map((o) => (o.id === id ? fn(o) : o));

/** Conserva todos los activos y los `MAX_FINISHED` terminados más recientes. */
function prune(orders: DispatchOrder[]): DispatchOrder[] {
  let finished = 0;
  return orders.filter((o) => isActive(o) || ++finished <= MAX_FINISHED);
}

export const useDispatch = create<DispatchStore>()(
  persist(
    (set, get) => {
      const T = () => simTimings();
      const find = (id: string) => get().orders.find((o) => o.id === id) ?? null;

      /** Asigna (núcleo compartido por auto, manual, alertas y app). */
      const doAssign = (orders: DispatchOrder[], order: DispatchOrder, unitId: string, via: AssignedVia, now: number) => {
        const unit = unitAt(unitId, orders, now);
        const t = T();
        const seed = order.source === 'seed';
        const approach = approachLeg(unit, pickupOf(order), now, Math.round(t.approachMs * (seed ? SEED_APPROACH_FACTOR : 1)));
        // Pedido sembrado: va directo a "en camino". Pedido real: "asignado" hasta que el pasajero confirma.
        const status: RideStatus = seed ? 'en_route' : 'assigned';
        const next: DispatchOrder = {
          ...order,
          status,
          status_at: now,
          unit_id: unitId,
          assigned_at: now,
          assigned_via: via,
          auto_at: null,
          approach,
          ride: { ...order.ride, status, driver_id: unitId, vehicle_id: unit.vehicle_id, assigned_at: new Date(now).toISOString() },
          timeline: [...order.timeline, { status, at: now, note: via }],
        };
        return { next, unit };
      };

      const isFree = (orders: DispatchOrder[], unitId: string) =>
        unitViews(orders).some((v) => v.unit.id === unitId && v.state === 'available');

      /** Pedido sembrado nuevo (o con estado inicial dado). */
      const makeSeed = (n: number, now: number, receivedAt = now): DispatchOrder => {
        const trip = seedTrips[SEED_TRIP_ORDER[n % SEED_TRIP_ORDER.length]];
        const id = seedId(n, now);
        const ride = seedRide(id, trip, seedServices[n % seedServices.length], seedPayments[n % seedPayments.length], receivedAt);
        return newOrder(ride, 'seed', receivedAt);
      };

      const tripLeg = (o: DispatchOrder, now: number): OrderLeg => {
        const trip = seedTrips.find((t) => t.pickup.lat === o.ride.pickup_lat && t.dropoff.lat === o.ride.dropoff_lat && t.pickup.lng === o.ride.pickup_lng);
        const duration_ms = Math.round(T().tripMs * SEED_TRIP_FACTOR);
        // Los recorridos sembrados ya son rutas por calles; si no hay, se pide la ruta.
        if (trip) return { path: trip.path, started_at: now, duration_ms, duration_s: o.ride.duration_s, src: 'osrm' };
        return { path: estimateRoute(pickupOf(o), dropoffOf(o)).path, started_at: now, duration_ms, duration_s: o.ride.duration_s, src: 'pending' };
      };

      return {
        ...initialState(),

        seed(now = Date.now()) {
          if (get().seeded) return false;
          const t = T();
          let orders: DispatchOrder[] = [];
          const add = (o: DispatchOrder) => (orders = [o, ...orders]);
          const assignSeed = (o: DispatchOrder, at: number) => {
            const best = bestUnit(o, orders, at, seedExclude(o));
            if (!best) return o;
            const { next } = doAssign(orders, o, best.unit.id, 'auto', at);
            return next;
          };

          // 1. Terminado hace unos minutos.
          {
            let o = makeSeed(0, now, now - 14 * 60_000);
            o = assignSeed(o, now - 14 * 60_000 + 4_000);
            o = {
              ...o,
              status: 'completed',
              status_at: now - 3 * 60_000,
              timeline: [...o.timeline, { status: 'completed', at: now - 3 * 60_000 }],
            };
            add(o);
          }
          // 2. Cancelado por el pasajero.
          {
            const o = makeSeed(1, now, now - 9 * 60_000);
            add({ ...o, status: 'cancelled', status_at: now - 8 * 60_000, cancelled_by: 'passenger', timeline: [...o.timeline, { status: 'cancelled', at: now - 8 * 60_000 }] });
          }
          // 3. En viaje.
          {
            let o = makeSeed(2, now, now - 4 * 60_000);
            o = assignSeed(o, now - 4 * 60_000 + 5_000);
            const trip = tripLeg(o, now - Math.round(t.tripMs * 0.5));
            o = { ...o, status: 'in_trip', status_at: trip.started_at, trip, timeline: [...o.timeline, { status: 'arrived', at: now - 70_000 }, { status: 'in_trip', at: trip.started_at }] };
            add(o);
          }
          // 4. En camino, normal.
          {
            const o = makeSeed(3, now, now - 9_000);
            add(assignSeed(o, now - 3_000));
          }
          // 5. En camino, atascado: la alerta salta pocos segundos después de abrir.
          {
            const at = now - Math.round(t.approachMs * 0.9);
            let o = makeSeed(4, now, at - 7_000);
            o = assignSeed(o, at);
            add({
              ...o,
              stalled_at: now - Math.max(0, t.alertStalledMs - 4_000),
              stalled_progress: 0.42,
            });
          }
          // 6. Recién entrado, sin asignar: se ve a la central decidir al abrir.
          {
            const o = makeSeed(5, now, now - 400);
            add({ ...o, auto_at: get().mode === 'auto' ? now + t.centralAutoAssignMs : null });
          }

          set({ orders, seeded: true, seedCount: 6, nextSeedAt: now + t.seedEveryMs, sessionStartedAt: now - 500 });
          return true;
        },

        receiveRide(ride, now = Date.now()) {
          if (find(ride.id)) return false;
          const order = newOrder(ride, 'app', now);
          if (get().mode === 'auto') order.auto_at = now + T().centralAutoAssignMs;
          set({ orders: prune([order, ...get().orders]) });
          dispatchEvents.emit({ type: 'order_received', order });
          return true;
        },

        setMode(mode, now = Date.now()) {
          if (get().mode === mode) return;
          const t = T();
          set({
            mode,
            orders: get().orders.map((o) =>
              o.status === 'requested' ? { ...o, auto_at: mode === 'auto' ? now + Math.round(t.centralAutoAssignMs / 2) : null } : o,
            ),
          });
        },

        assign(orderId, unitId, via, now = Date.now()) {
          const orders = get().orders;
          const order = find(orderId);
          if (!order || order.status !== 'requested' || !isFree(orders, unitId)) return null;
          const { next, unit } = doAssign(orders, order, unitId, via, now);
          set({ orders: patchOrder(orders, orderId, () => next) });
          dispatchEvents.emit({ type: 'assigned', order: next, unit, via });
          return { order: next, unit, via };
        },

        reassign(orderId, unitId, now = Date.now()) {
          const orders = get().orders;
          const order = find(orderId);
          if (!order || !REASSIGNABLE.includes(order.status) || order.unit_id === unitId || !isFree(orders, unitId)) return null;
          const unit = unitAt(unitId, orders, now);
          const seed = order.source === 'seed';
          const approach = approachLeg(unit, pickupOf(order), now, Math.round(T().approachMs * (seed ? SEED_APPROACH_FACTOR : 1)));
          const next: DispatchOrder = {
            ...order,
            unit_id: unitId,
            approach,
            stalled_at: null,
            stalled_progress: null,
            stall_plan: null,
            status: seed ? 'en_route' : order.status,
            status_at: now,
            reassignments: order.reassignments + 1,
            ride: { ...order.ride, driver_id: unitId, vehicle_id: unit.vehicle_id },
            timeline: [...order.timeline, { status: 'reassigned', at: now, note: unit.vehicle.plate }],
          };
          set({ orders: patchOrder(orders, orderId, () => next) });
          dispatchEvents.emit({ type: 'reassigned', order: next, unit, previous_unit_id: order.unit_id });
          return { order: next, unit, via: 'manual' };
        },

        resolveAlert(orderId, now = Date.now()) {
          const s = get();
          const order = find(orderId);
          if (!order) return null;
          if (order.status === 'requested') {
            const best = bestUnit(order, s.orders, now, seedExclude(order));
            return best ? s.assign(orderId, best.unit.id, 'manual', now) : null;
          }
          if (REASSIGNABLE.includes(order.status)) {
            const best = bestUnit(order, s.orders, now, [...(order.unit_id ? [order.unit_id] : []), ...seedExclude(order)]);
            return best ? s.reassign(orderId, best.unit.id, now) : null;
          }
          return null;
        },

        applyAppAssigned(rideId, unit, now = Date.now()) {
          const order = find(rideId);
          if (!order || !fleetById[unit.id]) return false;
          if (order.status === 'requested') {
            const orders = get().orders;
            const { next } = doAssign(orders, order, unit.id, 'app', now);
            set({ orders: patchOrder(orders, rideId, () => next) });
            dispatchEvents.emit({ type: 'assigned', order: next, unit, via: 'app' });
            return true;
          }
          if (REASSIGNABLE.includes(order.status) && order.unit_id !== unit.id) {
            // La app manda: adoptar su unidad (carrera entre la central y la autoasignación).
            set({
              orders: patchOrder(get().orders, rideId, (o) => ({
                ...o,
                unit_id: unit.id,
                assigned_via: 'app',
                ride: { ...o.ride, driver_id: unit.id, vehicle_id: unit.vehicle_id },
              })),
            });
            return true;
          }
          return false;
        },

        applyStatus(msg, now = Date.now()) {
          const order = find(msg.ride_id);
          if (!order || order.status === 'cancelled' || order.status === 'completed') return false;
          const rank: Record<RideStatus, number> = { requested: 0, assigned: 1, en_route: 2, arrived: 3, in_trip: 4, completed: 5, cancelled: 6 };
          // No retroceder (salvo en_route repetido: reasignación confirmada).
          if (rank[msg.status] < rank[order.status]) return false;
          const unitId = msg.driver_id && fleetById[msg.driver_id] ? msg.driver_id : order.unit_id;
          const leg: OrderLeg | null =
            msg.path && msg.path.length >= 2 && msg.phase_started_at && msg.phase_ms
              ? { path: msg.path, started_at: msg.phase_started_at, duration_ms: msg.phase_ms, duration_s: msg.eta_s ?? order.ride.duration_s, src: msg.path_source ?? 'osrm' }
              : null;
          const next: DispatchOrder = { ...order, unit_id: unitId, ride: { ...order.ride, status: msg.status, driver_id: unitId } };
          if (msg.status === 'en_route') {
            if (leg) next.approach = leg;
            else if (!next.approach && unitId) next.approach = approachLeg(unitAt(unitId, get().orders, now), pickupOf(order), now, T().approachMs);
            next.stalled_at = null;
            next.stalled_progress = null;
            if (!next.assigned_at) {
              next.assigned_at = now;
              next.assigned_via = next.assigned_via ?? 'app';
            }
          } else if (msg.status === 'in_trip') {
            next.trip = leg ?? { path: estimateRoute(pickupOf(order), dropoffOf(order)).path, started_at: now, duration_ms: T().tripMs, duration_s: order.ride.duration_s, src: 'pending' };
          } else if (msg.status === 'completed') {
            next.ride = { ...next.ride, completed_at: new Date(now).toISOString(), fare_final_usd: order.ride.fare_estimate_usd };
          }
          if (msg.status !== order.status) {
            next.status = msg.status;
            next.status_at = now;
            next.timeline = [...order.timeline, { status: msg.status, at: now }];
          }
          set({ orders: prune(patchOrder(get().orders, order.id, () => next)) });
          if (msg.status !== order.status) dispatchEvents.emit({ type: 'status', order: next });
          return true;
        },

        cancel(orderId, by, now = Date.now()) {
          const order = find(orderId);
          if (!order || !isActive(order)) return false;
          const next: DispatchOrder = {
            ...order,
            status: 'cancelled',
            status_at: now,
            cancelled_by: by,
            auto_at: null,
            ride: { ...order.ride, status: 'cancelled', cancelled_at: new Date(now).toISOString() },
            timeline: [...order.timeline, { status: 'cancelled', at: now, note: by }],
          };
          set({ orders: prune(patchOrder(get().orders, orderId, () => next)) });
          dispatchEvents.emit({ type: 'cancelled', order: next });
          return true;
        },

        tick(now = Date.now()) {
          const s = get();
          const t = T();
          let orders = s.orders;
          let changed = false;
          const assigned: AssignmentOut[] = [];
          const statusEvents: DispatchOrder[] = [];

          // 1) Asignación automática de los pedidos que ya esperaron su pausa visible.
          if (s.mode === 'auto') {
            for (const o of [...orders].reverse()) {
              if (o.status !== 'requested' || o.auto_at == null || o.auto_at > now) continue;
              const best = bestUnit(o, orders, now, seedExclude(o));
              if (!best) {
                // Sin unidades libres: reintenta en un rato (y la alerta hará su trabajo).
                orders = patchOrder(orders, o.id, (x) => ({ ...x, auto_at: now + 3_000 }));
                changed = true;
                continue;
              }
              const { next, unit } = doAssign(orders, o, best.unit.id, 'auto', now);
              orders = patchOrder(orders, o.id, () => next);
              assigned.push({ order: next, unit, via: 'auto' });
              changed = true;
            }
          }

          // 2) Fases de los pedidos sembrados (los reales los mueve el pasajero).
          for (const o of orders) {
            if (o.source !== 'seed') continue;
            if (o.status === 'en_route' && o.approach && o.stalled_at == null && now >= o.approach.started_at + o.approach.duration_ms) {
              const at = o.approach.started_at + o.approach.duration_ms;
              const next = { ...o, status: 'arrived' as const, status_at: at, timeline: [...o.timeline, { status: 'arrived' as const, at }] };
              orders = patchOrder(orders, o.id, () => next);
              statusEvents.push(next);
              changed = true;
            } else if (o.status === 'arrived' && now >= o.status_at + t.arrivedPauseMs) {
              const at = o.status_at + t.arrivedPauseMs;
              const trip = tripLeg(o, at);
              const next = { ...o, status: 'in_trip' as const, status_at: at, trip, timeline: [...o.timeline, { status: 'in_trip' as const, at }] };
              orders = patchOrder(orders, o.id, () => next);
              statusEvents.push(next);
              changed = true;
            } else if (o.status === 'in_trip' && o.trip && now >= o.trip.started_at + o.trip.duration_ms) {
              const at = o.trip.started_at + o.trip.duration_ms;
              const next = { ...o, status: 'completed' as const, status_at: at, timeline: [...o.timeline, { status: 'completed' as const, at }] };
              orders = patchOrder(orders, o.id, () => next);
              statusEvents.push(next);
              changed = true;
            }
          }

          // 3) Pedido sembrado nuevo cada cierto tiempo (uno de cada STALL_EVERY se "atasca").
          let { nextSeedAt, seedCount } = s;
          if (s.seeded && nextSeedAt != null && now >= nextSeedAt) {
            const activeSeeds = orders.filter((o) => o.source === 'seed' && isActive(o)).length;
            if (activeSeeds < 5) {
              const o = makeSeed(seedCount, now);
              const stall = seedCount % STALL_EVERY === STALL_EVERY - 1;
              const order: DispatchOrder = { ...o, auto_at: s.mode === 'auto' ? now + t.centralAutoAssignMs : null, stall_plan: stall ? 0.4 : null };
              orders = [order, ...orders];
              dispatchEvents.emit({ type: 'order_received', order });
              seedCount++;
            }
            nextSeedAt = now + t.seedEveryMs;
            changed = true;
          }

          // 4) Atascos programados: la unidad se detiene a mitad de camino.
          for (const o of orders) {
            if (o.stall_plan == null || o.stalled_at != null || o.status !== 'en_route' || !o.approach) continue;
            if (legProgress(o.approach, now) >= o.stall_plan) {
              orders = patchOrder(orders, o.id, (x) => ({ ...x, stall_plan: null, stalled_at: now, stalled_progress: legProgress(x.approach, now) }));
              changed = true;
            }
          }

          if (changed) set({ orders: prune(orders), nextSeedAt, seedCount });
          for (const a of assigned) dispatchEvents.emit({ type: 'assigned', order: a.order, unit: a.unit, via: a.via });
          for (const o of statusEvents) dispatchEvents.emit({ type: 'status', order: o });
          return { assigned };
        },

        setLegRoute(orderId, kind, startedAt, route, now = Date.now()) {
          const order = find(orderId);
          const leg = order?.[kind];
          if (!order || !leg || leg.src !== 'pending' || leg.started_at !== startedAt || !isActive(order)) return false;
          const next: OrderLeg = {
            ...leg,
            path: route.path,
            duration_s: kind === 'approach' ? route.duration_s : leg.duration_s,
            src: route.source,
            // El reloj arranca con la ruta (la unidad no avanzó mientras se pedía).
            started_at: Math.max(leg.started_at, now),
          };
          // Atascada mientras se pedía la ruta: sigue detenida, al inicio de la ruta (donde está).
          const stalled = kind === 'approach' && order.stalled_at != null && order.stalled_at <= now ? { stalled_progress: 0 } : {};
          set({ orders: patchOrder(get().orders, orderId, (o) => ({ ...o, [kind]: next, ...stalled })) });
          return true;
        },

        selectOrder(id) {
          set({ selectedOrderId: id, selectedUnitId: null });
        },

        selectUnit(id) {
          set({ selectedUnitId: id, selectedOrderId: null });
        },

        setFilter(filter) {
          set({ filter });
        },

        reset(now = Date.now()) {
          set(initialState(now));
        },
      };
    },
    {
      name: DISPATCH_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        orders: s.orders,
        mode: s.mode,
        selectedOrderId: s.selectedOrderId,
        selectedUnitId: s.selectedUnitId,
        filter: s.filter,
        sessionStartedAt: s.sessionStartedAt,
        seeded: s.seeded,
        nextSeedAt: s.nextSeedAt,
        seedCount: s.seedCount,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<DispatchState> | undefined;
        if (!p || typeof p !== 'object' || !Array.isArray(p.orders)) return current;
        return { ...current, ...p };
      },
    },
  ),
);
