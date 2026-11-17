import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { travelProgress } from '@/lib/fleetSim';
import { estimateFare } from '@/lib/pricing';
import type { Route } from '@/lib/routing';
import { simTimings } from '@/lib/simConfig';
import { getService, DEFAULT_SERVICE_ID } from '@/mocks/services';
import type { FleetUnit, LatLng, PaymentMethod, Ride, ServiceId, TripHistoryItem } from '@/types';

/**
 * Máquina de estados del pedido (pasajero), PLAN_IVANCAR.md §3.1:
 *
 *   home → destination → service ⇄ payment → searching → assigned → inTrip → rating → home
 *   home ⇄ history → service ("Repetir viaje")
 *
 * - Solo se aceptan las transiciones de `TRANSITIONS`; cualquier otra es un no-op que
 *   devuelve `false` (nunca lanza).
 * - `cancel()` desde searching o assigned vuelve a home y limpia pedido, unidad y destino
 *   (conserva la recogida).
 * - `back()` existe en cada paso previo a pedir.
 * - El store no hace efectos (red, canal, timers): los hace `useRideSimulation`. Cada
 *   transición se anuncia en `rideEvents` (analítica, canal, háptica del Bloque 5).
 *
 * Recarga de página: se persiste en sessionStorage lo necesario para retomar el pedido
 * (paso, puntos, ruta, servicio, pedido, unidad, ruta de llegada y reloj de la fase).
 * Las fases con tiempo (búsqueda, llegada, viaje) siguen el reloj de pared: al volver,
 * la unidad está donde debería y, si la fase terminó, la simulación avanza sola.
 * sessionStorage (no localStorage) para que dos pestañas no compartan el mismo pedido.
 */

export type Step =
  | 'home'
  | 'destination'
  | 'service'
  | 'payment'
  | 'searching'
  | 'assigned'
  | 'inTrip'
  | 'rating'
  | 'history';

export const TRANSITIONS: Record<Step, readonly Step[]> = {
  home: ['destination', 'service', 'history'],
  destination: ['home', 'service'],
  service: ['home', 'destination', 'payment', 'searching'],
  payment: ['service', 'searching'],
  searching: ['assigned', 'home'],
  assigned: ['inTrip', 'home'],
  inTrip: ['rating'],
  rating: ['home'],
  history: ['home', 'service'],
};

export function canTransition(from: Step, to: Step): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Pasos previos a pedir: se puede editar recogida, destino, servicio y opciones. */
export const PRE_ORDER: readonly Step[] = ['home', 'destination', 'service', 'payment'];

/** Punto con nombre (recogida o destino). */
export interface Spot {
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  /** Id del lugar del catálogo o del lugar guardado, si viene de ahí. */
  place_id?: string;
}

export interface RideOptions {
  payment: PaymentMethod;
  /** ISO o null = ahora. */
  scheduledFor: string | null;
  note: string;
}

export type AssignedBy = 'central' | 'auto';

export interface RideState {
  step: Step;
  /** Paso desde el que se llegó a 'service' (para "volver"). */
  serviceFrom: 'home' | 'destination';
  pickup: Spot | null;
  destination: Spot | null;
  /** Ruta recogida → destino. null mientras se calcula. */
  route: Route | null;
  serviceId: ServiceId;
  /** Horas (solo "Servicio por horas"). */
  hours: number;
  options: RideOptions;

  ride: Ride | null;
  unit: FleetUnit | null;
  assignedBy: AssignedBy | null;
  /** Ruta de la unidad a la recogida. */
  approach: Route | null;
  /** Reloj de la fase actual (searching / assigned / inTrip), en ms de época. */
  phaseStartedAt: number | null;
  phaseDurationMs: number | null;
  /** Viajes terminados en esta sesión (más reciente primero). Mis viajes los muestra antes que los de ejemplo. */
  history: TripHistoryItem[];
  /** La central confirmó el pedido (`ride:ack`) y en qué modo trabaja. null = sin confirmación. */
  centralMode: 'auto' | 'manual' | null;

  /* UI efímera (no se persiste) */
  /** Destino: elegir moviendo el mapa en vez de la lista. */
  mapPick: boolean;
  /** Chat con el conductor abierto (Bloque 4 monta el chat real). */
  chatOpen: boolean;
}

export type RideEvent =
  | { type: 'destination_selected'; spot: Spot }
  | { type: 'requested'; ride: Ride }
  | { type: 'assigned'; ride: Ride; unit: FleetUnit; by: AssignedBy; approach: Route }
  | { type: 'reassigned'; ride: Ride; unit: FleetUnit; previous: FleetUnit }
  | { type: 'arrived'; ride: Ride; unit: FleetUnit }
  | { type: 'trip_started'; ride: Ride }
  | { type: 'completed'; ride: Ride; item: TripHistoryItem }
  | { type: 'cancelled'; ride: Ride; by: 'passenger' | 'central'; reason?: string }
  | { type: 'rated'; ride_id: string; rating: number | null; tip: number | null };

type EventListener = (e: RideEvent) => void;
const listeners = new Set<EventListener>();

/**
 * Bus de eventos del pedido. Punto de enganche para analítica, canal con la central y
 * la capa de animación del Bloque 5 (háptica al llegar, confetti al terminar…).
 */
export const rideEvents = {
  on(fn: EventListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  emit(e: RideEvent) {
    for (const fn of [...listeners]) {
      try {
        fn(e);
      } catch {
        /* un oyente nunca rompe el flujo */
      }
    }
  },
};

export interface FinishInput {
  rating: number | null;
  tip: number | null;
  comment?: string;
}

export interface RideActions {
  setPickup(spot: Spot): boolean;
  openDestination(): boolean;
  setMapPick(on: boolean): void;
  chooseDestination(spot: Spot): boolean;
  setRoute(route: Route, forKey: string): boolean;
  selectService(id: ServiceId): boolean;
  setHours(hours: number): boolean;
  setOptions(patch: Partial<RideOptions>): boolean;
  openOptions(): boolean;
  closeOptions(): boolean;
  back(): boolean;
  requestRide(now?: number): boolean;
  assignUnit(unit: FleetUnit, approach: Route, by: AssignedBy, now?: number): boolean;
  reassignUnit(unit: FleetUnit, approach: Route, now?: number): boolean;
  /** La unidad llegó a la recogida (solo emite el evento; el paso sigue en 'assigned'). */
  markArrived(): boolean;
  startTrip(now?: number): boolean;
  completeTrip(now?: number): boolean;
  finish(input: FinishInput): boolean;
  cancel(by?: 'passenger' | 'central', reason?: string): boolean;
  openHistory(): boolean;
  closeHistory(): boolean;
  /** "Repetir viaje": precarga el destino (y el servicio) de un viaje pasado y va a elegir servicio. */
  repeatTrip(item: TripHistoryItem): boolean;
  /** La central confirmó el pedido en curso. */
  setCentralAck(rideId: string, mode: 'auto' | 'manual'): boolean;
  setChatOpen(open: boolean): void;
  /** Vuelve todo al estado inicial (conserva el historial y la recogida). */
  reset(): void;
}

export type RideStore = RideState & RideActions;

export const HOURS_MIN = 2;
export const HOURS_MAX = 8;

const initialOptions: RideOptions = { payment: 'cash', scheduledFor: null, note: '' };

const initialState: RideState = {
  step: 'home',
  serviceFrom: 'home',
  pickup: null,
  destination: null,
  route: null,
  serviceId: DEFAULT_SERVICE_ID,
  hours: HOURS_MIN,
  options: initialOptions,
  ride: null,
  unit: null,
  assignedBy: null,
  approach: null,
  phaseStartedAt: null,
  phaseDurationMs: null,
  history: [],
  centralMode: null,
  mapPick: false,
  chatOpen: false,
};

/** Clave de la ruta para un par recogida-destino (descarta respuestas viejas). */
export function routeKey(a: Spot | null, b: Spot | null): string {
  if (!a || !b) return '';
  return `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
}

const spotLatLng = (s: Spot): LatLng => [s.lat, s.lng];

function rideId(): string {
  const r =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '')
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `ride-${r.slice(0, 10)}`;
}

/** Código corto y legible del pedido ("A7K3QX"). */
export function rideCode(id: string): string {
  return id.replace(/^ride-/, '').slice(0, 6).toUpperCase();
}

/** Simplifica una polilínea a ≤ max puntos (historial, mini mapas, mensajes a la central). */
export function thin(path: LatLng[], max = 60): LatLng[] {
  if (path.length <= max) return path;
  const step = (path.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => path[Math.round(i * step)]);
}

/** Tarifa referencial del servicio elegido con la ruta actual. */
export function currentFare(s: Pick<RideState, 'serviceId' | 'route' | 'hours'>) {
  return estimateFare(getService(s.serviceId), s.route?.distance_m ?? 0, { hours: s.hours });
}

/** sessionStorage si existe; si no (tests, modo privado estricto), memoria. */
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

export const STORAGE_KEY = 'ivancar-ride';
export const STORAGE_VERSION = 1;

export const useRide = create<RideStore>()(
  persist(
    (set, get) => {
      /** Cambia de paso si la transición es válida. */
      const go = (to: Step, patch: Partial<RideState> = {}): boolean => {
        const from = get().step;
        if (from !== to && !canTransition(from, to)) return false;
        set({ ...patch, step: to });
        return true;
      };
      const inPreOrder = () => PRE_ORDER.includes(get().step);

      return {
        ...initialState,

        setPickup(spot) {
          if (get().step !== 'home') return false;
          set({ pickup: spot });
          return true;
        },

        openDestination() {
          return go('destination', { mapPick: false });
        },

        setMapPick(on) {
          if (get().step === 'destination') set({ mapPick: on });
        },

        chooseDestination(spot) {
          const s = get();
          if (s.step !== 'home' && s.step !== 'destination') return false;
          if (!s.pickup) return false;
          const sameRoute = routeKey(s.pickup, spot) === routeKey(s.pickup, s.destination);
          const ok = go('service', {
            destination: spot,
            route: sameRoute ? s.route : null,
            serviceFrom: s.step === 'destination' ? 'destination' : 'home',
            mapPick: false,
          });
          if (ok) rideEvents.emit({ type: 'destination_selected', spot });
          return ok;
        },

        setRoute(route, forKey) {
          const s = get();
          if (!inPreOrder() || forKey !== routeKey(s.pickup, s.destination)) return false;
          set({ route });
          return true;
        },

        selectService(id) {
          if (!inPreOrder()) return false;
          set({ serviceId: id });
          return true;
        },

        setHours(hours) {
          if (!inPreOrder()) return false;
          set({ hours: Math.min(HOURS_MAX, Math.max(HOURS_MIN, Math.round(hours))) });
          return true;
        },

        setOptions(patch) {
          if (!inPreOrder()) return false;
          const note = patch.note != null ? patch.note.slice(0, 140) : undefined;
          set({ options: { ...get().options, ...patch, ...(note != null ? { note } : {}) } });
          return true;
        },

        openOptions() {
          return get().step === 'service' && go('payment');
        },

        closeOptions() {
          return get().step === 'payment' && go('service');
        },

        back() {
          const s = get();
          switch (s.step) {
            case 'destination':
              if (s.mapPick) {
                set({ mapPick: false });
                return true;
              }
              return go('home');
            case 'service':
              return s.serviceFrom === 'destination' ? go('destination', { mapPick: false }) : go('home');
            case 'payment':
              return go('service');
            case 'history':
              return go('home');
            default:
              return false;
          }
        },

        requestRide(now = Date.now()) {
          const s = get();
          if (s.step !== 'service' && s.step !== 'payment') return false;
          if (!s.pickup || !s.destination || !s.route) return false;
          const fare = currentFare(s);
          const iso = new Date(now).toISOString();
          const ride: Ride = {
            id: rideId(),
            created_at: iso,
            updated_at: iso,
            status: 'requested',
            service_id: s.serviceId,
            payment_method: s.options.payment,
            pickup_lat: s.pickup.lat,
            pickup_lng: s.pickup.lng,
            pickup_label: s.pickup.label,
            dropoff_lat: s.destination.lat,
            dropoff_lng: s.destination.lng,
            dropoff_label: s.destination.label,
            distance_m: s.route.distance_m,
            duration_s: s.route.duration_s,
            fare_estimate_usd: fare.amount,
            fare_final_usd: null,
            driver_id: null,
            vehicle_id: null,
            assigned_at: null,
            completed_at: null,
            cancelled_at: null,
            scheduled_for: s.options.scheduledFor,
            note: s.options.note.trim() || null,
            passenger_name: null,
            rating: null,
            tip_usd: null,
          };
          const ok = go('searching', {
            ride,
            unit: null,
            approach: null,
            assignedBy: null,
            centralMode: null,
            phaseStartedAt: now,
            phaseDurationMs: null,
          });
          if (ok) rideEvents.emit({ type: 'requested', ride });
          return ok;
        },

        assignUnit(unit, approach, by, now = Date.now()) {
          const s = get();
          if (s.step !== 'searching' || !s.ride) return false;
          const iso = new Date(now).toISOString();
          const ride: Ride = {
            ...s.ride,
            status: 'en_route',
            driver_id: unit.id,
            vehicle_id: unit.vehicle_id,
            assigned_at: iso,
            updated_at: iso,
          };
          const ok = go('assigned', {
            ride,
            unit,
            approach,
            assignedBy: by,
            phaseStartedAt: now,
            phaseDurationMs: simTimings().approachMs,
          });
          if (ok) rideEvents.emit({ type: 'assigned', ride, unit, by, approach });
          return ok;
        },

        reassignUnit(unit, approach, now = Date.now()) {
          const s = get();
          if (s.step !== 'assigned' || !s.ride || !s.unit || s.ride.status === 'arrived') return false;
          if (unit.id === s.unit.id) return false;
          const previous = s.unit;
          const ride: Ride = {
            ...s.ride,
            driver_id: unit.id,
            vehicle_id: unit.vehicle_id,
            updated_at: new Date(now).toISOString(),
          };
          set({ ride, unit, approach, assignedBy: 'central', phaseStartedAt: now, phaseDurationMs: simTimings().approachMs });
          rideEvents.emit({ type: 'reassigned', ride, unit, previous });
          return true;
        },

        markArrived() {
          const s = get();
          if (s.step !== 'assigned' || !s.ride || !s.unit || s.ride.status === 'arrived') return false;
          const ride: Ride = { ...s.ride, status: 'arrived', updated_at: new Date().toISOString() };
          set({ ride });
          rideEvents.emit({ type: 'arrived', ride, unit: s.unit });
          return true;
        },

        startTrip(now = Date.now()) {
          const s = get();
          if (s.step !== 'assigned' || !s.ride) return false;
          const ride: Ride = { ...s.ride, status: 'in_trip', updated_at: new Date(now).toISOString() };
          const ok = go('inTrip', { ride, phaseStartedAt: now, phaseDurationMs: simTimings().tripMs });
          if (ok) rideEvents.emit({ type: 'trip_started', ride });
          return ok;
        },

        completeTrip(now = Date.now()) {
          const s = get();
          if (s.step !== 'inTrip' || !s.ride || !s.unit) return false;
          const iso = new Date(now).toISOString();
          const ride: Ride = {
            ...s.ride,
            status: 'completed',
            completed_at: iso,
            updated_at: iso,
            fare_final_usd: s.ride.fare_estimate_usd,
          };
          const item: TripHistoryItem = {
            ...ride,
            status: 'completed',
            route: thin(s.route?.path ?? [spotLatLng(s.pickup!), spotLatLng(s.destination!)]),
            driver_display_name: s.unit.display_name,
            vehicle_plate: s.unit.vehicle.plate,
          };
          const ok = go('rating', {
            ride,
            history: [item, ...s.history.filter((h) => h.id !== item.id)],
            phaseStartedAt: null,
            phaseDurationMs: null,
          });
          if (ok) rideEvents.emit({ type: 'completed', ride, item });
          return ok;
        },

        finish({ rating, tip }) {
          const s = get();
          if (s.step !== 'rating' || !s.ride) return false;
          const id = s.ride.id;
          const r = rating != null ? Math.min(5, Math.max(1, Math.round(rating))) : null;
          const t = tip != null && tip > 0 ? tip : null;
          const history = s.history.map((h) => (h.id === id ? { ...h, rating: r, tip_usd: t } : h));
          const ok = go('home', { ...clearedRide(), history });
          if (ok) rideEvents.emit({ type: 'rated', ride_id: id, rating: r, tip: t });
          return ok;
        },

        cancel(by = 'passenger', reason) {
          const s = get();
          if ((s.step !== 'searching' && s.step !== 'assigned') || !s.ride) return false;
          const iso = new Date().toISOString();
          const ride: Ride = { ...s.ride, status: 'cancelled', cancelled_at: iso, updated_at: iso };
          const ok = go('home', clearedRide());
          if (ok) rideEvents.emit({ type: 'cancelled', ride, by, reason });
          return ok;
        },

        openHistory() {
          return go('history');
        },

        closeHistory() {
          return get().step === 'history' && go('home');
        },

        repeatTrip(item) {
          const s = get();
          if (s.step !== 'history') return false;
          const pickup: Spot = s.pickup ?? { lat: item.pickup_lat, lng: item.pickup_lng, label: item.pickup_label };
          const destination: Spot = { lat: item.dropoff_lat, lng: item.dropoff_lng, label: item.dropoff_label };
          const sameRoute = routeKey(pickup, destination) === routeKey(s.pickup, s.destination);
          const ok = go('service', {
            pickup,
            destination,
            route: sameRoute ? s.route : null,
            serviceId: item.service_id,
            hours: HOURS_MIN,
            options: initialOptions,
            serviceFrom: 'home',
            mapPick: false,
          });
          if (ok) rideEvents.emit({ type: 'destination_selected', spot: { ...destination, place_id: 'repeat' } });
          return ok;
        },

        setCentralAck(rideId, mode) {
          const s = get();
          if (s.step !== 'searching' || s.ride?.id !== rideId) return false;
          if (s.centralMode !== mode) set({ centralMode: mode });
          return true;
        },

        setChatOpen(open) {
          const st = get().step;
          set({ chatOpen: open && (st === 'assigned' || st === 'inTrip') });
        },

        reset() {
          const { history, pickup } = get();
          set({ ...initialState, history, pickup });
        },
      };
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      // Lo efímero de UI (mapPick, chatOpen) no se guarda.
      partialize: ({ mapPick: _m, chatOpen: _c, ...rest }) => {
        const out: Partial<RideStore> = {};
        for (const [k, v] of Object.entries(rest)) if (typeof v !== 'function') (out as Record<string, unknown>)[k] = v;
        return out;
      },
      // Si lo guardado no tiene forma válida, se empieza limpio.
      merge: (persisted, current) => {
        const p = persisted as Partial<RideState> | undefined;
        if (!p || typeof p !== 'object' || !p.step || !(p.step in TRANSITIONS)) return current;
        const merged = { ...current, ...p, mapPick: false, chatOpen: false } as RideStore;
        // Estados incoherentes (p. ej. assigned sin unidad) → inicio limpio, conservando historial.
        const broken =
          (['searching', 'assigned', 'inTrip', 'rating'].includes(merged.step) && !merged.ride) ||
          (['assigned', 'inTrip'].includes(merged.step) && (!merged.unit || !merged.approach || !merged.phaseStartedAt)) ||
          (['service', 'payment'].includes(merged.step) && (!merged.pickup || !merged.destination));
        return broken ? { ...current, history: merged.history ?? [], pickup: merged.pickup ?? null } : merged;
      },
    },
  ),
);

/** Campos a limpiar al cancelar o terminar (la recogida se conserva). */
function clearedRide(): Partial<RideState> {
  return {
    destination: null,
    route: null,
    serviceId: DEFAULT_SERVICE_ID,
    hours: HOURS_MIN,
    options: initialOptions,
    ride: null,
    unit: null,
    assignedBy: null,
    centralMode: null,
    approach: null,
    phaseStartedAt: null,
    phaseDurationMs: null,
    mapPick: false,
    chatOpen: false,
    serviceFrom: 'home',
  };
}

/**
 * Avance (0..1) sobre la ruta de la fase con reloj a la hora `now`: arranca y frena suave
 * (`travelProgress`). La central usa la misma curva para el mismo reloj.
 */
export function phaseProgress(s: Pick<RideState, 'phaseStartedAt' | 'phaseDurationMs'>, now = Date.now()): number {
  if (!s.phaseStartedAt || !s.phaseDurationMs) return 0;
  return travelProgress((now - s.phaseStartedAt) / s.phaseDurationMs);
}
