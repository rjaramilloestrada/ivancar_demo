import { beforeEach, describe, expect, it } from 'vitest';
import { estimateRoute } from '@/lib/routing';
import { fleet } from '@/mocks/drivers';
import {
  canTransition,
  phaseProgress,
  rideEvents,
  routeKey,
  TRANSITIONS,
  useRide,
  type RideEvent,
  type Spot,
  type Step,
} from '../rideStore';

const pickup: Spot = { lat: -2.1449, lng: -79.8676, label: 'Parque Histórico' };
const airport: Spot = { lat: -2.1574, lng: -79.8836, label: 'Aeropuerto', place_id: 'plc-aeropuerto' };
const route = estimateRoute([pickup.lat, pickup.lng], [airport.lat, airport.lng]);
const unit = fleet[0];
const approach = estimateRoute([unit.lat, unit.lng], [pickup.lat, pickup.lng]);

const S = () => useRide.getState();

/** Lleva el store hasta 'service' con ruta lista. */
function toService() {
  S().setPickup(pickup);
  expect(S().chooseDestination(airport)).toBe(true);
  expect(S().setRoute(route, routeKey(pickup, airport))).toBe(true);
}

let events: RideEvent[] = [];
let off: (() => void) | undefined;
beforeEach(() => {
  off?.();
  useRide.setState({ step: 'home', history: [], pickup: null });
  S().reset();
  events = [];
  off = rideEvents.on((e) => events.push(e));
});

describe('tabla de transiciones', () => {
  it('es coherente: todo destino es un paso conocido', () => {
    const steps = Object.keys(TRANSITIONS) as Step[];
    for (const from of steps) for (const to of TRANSITIONS[from]) expect(steps).toContain(to);
  });

  it('acepta el camino feliz y rechaza saltos', () => {
    expect(canTransition('home', 'service')).toBe(true);
    expect(canTransition('service', 'searching')).toBe(true);
    expect(canTransition('home', 'searching')).toBe(false);
    expect(canTransition('home', 'assigned')).toBe(false);
    expect(canTransition('searching', 'inTrip')).toBe(false);
    expect(canTransition('inTrip', 'home')).toBe(false); // no se cancela en viaje
    expect(canTransition('rating', 'searching')).toBe(false);
  });
});

describe('flujo completo', () => {
  it('home → service (destino sugerido) → searching → assigned → inTrip → rating → home', () => {
    toService();
    expect(S().step).toBe('service');
    expect(S().serviceId).toBe('taxi'); // preseleccionado
    expect(S().options.payment).toBe('cash'); // efectivo por defecto

    expect(S().requestRide(1_000)).toBe(true);
    expect(S().step).toBe('searching');
    expect(S().ride?.status).toBe('requested');
    expect(S().ride?.fare_estimate_usd).toBeGreaterThan(0);

    expect(S().assignUnit(unit, approach, 'auto', 2_000)).toBe(true);
    expect(S().step).toBe('assigned');
    expect(S().ride?.driver_id).toBe(unit.id);
    expect(phaseProgress(S(), 2_000)).toBe(0);
    expect(phaseProgress(S(), 2_000 + S().phaseDurationMs! / 2)).toBeCloseTo(0.5);

    expect(S().markArrived()).toBe(true);
    expect(S().markArrived()).toBe(false); // una sola vez
    expect(S().startTrip(20_000)).toBe(true);
    expect(S().step).toBe('inTrip');

    expect(S().completeTrip(40_000)).toBe(true);
    expect(S().step).toBe('rating');
    expect(S().history).toHaveLength(1);
    expect(S().history[0].status).toBe('completed');
    expect(S().history[0].vehicle_plate).toBe(unit.vehicle.plate);

    expect(S().finish({ rating: 5, tip: 1 })).toBe(true);
    expect(S().step).toBe('home');
    expect(S().ride).toBeNull();
    expect(S().destination).toBeNull();
    expect(S().pickup).toEqual(pickup); // la recogida se conserva
    expect(S().history[0].rating).toBe(5);
    expect(S().history[0].tip_usd).toBe(1);

    expect(events.map((e) => e.type)).toEqual([
      'destination_selected',
      'requested',
      'assigned',
      'arrived',
      'trip_started',
      'completed',
      'rated',
    ]);
  });

  it('pago y opciones: ida y vuelta desde servicio y pedido desde opciones', () => {
    toService();
    expect(S().openOptions()).toBe(true);
    expect(S().step).toBe('payment');
    expect(S().setOptions({ payment: 'voucher', note: 'Garita principal' })).toBe(true);
    expect(S().closeOptions()).toBe(true);
    expect(S().step).toBe('service');
    expect(S().openOptions()).toBe(true);
    expect(S().requestRide()).toBe(true);
    expect(S().ride?.payment_method).toBe('voucher');
    expect(S().ride?.note).toBe('Garita principal');
  });
});

describe('transiciones inválidas (no-op, sin lanzar)', () => {
  it('no pide sin destino ni ruta', () => {
    expect(S().requestRide()).toBe(false);
    S().setPickup(pickup);
    S().chooseDestination(airport);
    expect(S().requestRide()).toBe(false); // ruta aún no lista
    expect(S().step).toBe('service');
  });

  it('no elige destino sin recogida', () => {
    expect(S().chooseDestination(airport)).toBe(false);
    expect(S().step).toBe('home');
  });

  it('no asigna fuera de la búsqueda ni empieza viaje sin unidad', () => {
    expect(S().assignUnit(unit, approach, 'auto')).toBe(false);
    expect(S().startTrip()).toBe(false);
    expect(S().completeTrip()).toBe(false);
    expect(S().finish({ rating: 5, tip: null })).toBe(false);
    toService();
    S().requestRide();
    expect(S().startTrip()).toBe(false);
    expect(S().step).toBe('searching');
  });

  it('ignora respuestas de ruta viejas (otro destino)', () => {
    toService();
    const other: Spot = { lat: -2.0983, lng: -79.8747, label: 'Plaza Lagos' };
    expect(S().setRoute(route, routeKey(pickup, other))).toBe(false);
  });

  it('no edita servicio ni opciones con el pedido en curso', () => {
    toService();
    S().requestRide();
    expect(S().selectService('suv')).toBe(false);
    expect(S().setOptions({ payment: 'card' })).toBe(false);
    expect(S().setPickup({ ...pickup, lat: -2.2 })).toBe(false);
  });

  it('no cancela en viaje ni desde inicio', () => {
    expect(S().cancel()).toBe(false);
    toService();
    S().requestRide();
    S().assignUnit(unit, approach, 'central');
    S().startTrip();
    expect(S().cancel()).toBe(false);
    expect(S().step).toBe('inTrip');
  });

  it('acota las horas del servicio por horas', () => {
    expect(S().setHours(1)).toBe(true);
    expect(S().hours).toBe(2);
    S().setHours(40);
    expect(S().hours).toBe(8);
  });
});

describe('cancelación', () => {
  it('durante la búsqueda vuelve a inicio y limpia el pedido', () => {
    toService();
    S().requestRide();
    expect(S().cancel()).toBe(true);
    expect(S().step).toBe('home');
    expect(S().ride).toBeNull();
    expect(S().unit).toBeNull();
    expect(S().destination).toBeNull();
    expect(S().route).toBeNull();
    expect(S().phaseStartedAt).toBeNull();
    const c = events.find((e) => e.type === 'cancelled');
    expect(c && c.type === 'cancelled' && c.ride.status).toBe('cancelled');
  });

  it('con unidad asignada vuelve a inicio y la central puede cancelar', () => {
    toService();
    S().requestRide();
    S().assignUnit(unit, approach, 'auto');
    expect(S().cancel('central', 'Sin unidades')).toBe(true);
    expect(S().step).toBe('home');
    expect(S().unit).toBeNull();
    const c = events.find((e) => e.type === 'cancelled');
    expect(c && c.type === 'cancelled' && c.by).toBe('central');
  });
});

describe('volver', () => {
  it('servicio vuelve a donde se vino', () => {
    toService();
    expect(S().back()).toBe(true);
    expect(S().step).toBe('home');

    S().openDestination();
    S().chooseDestination(airport);
    expect(S().serviceFrom).toBe('destination');
    expect(S().back()).toBe(true);
    expect(S().step).toBe('destination');
    expect(S().back()).toBe(true);
    expect(S().step).toBe('home');
  });

  it('elegir en el mapa: volver sale primero del modo mapa', () => {
    S().setPickup(pickup);
    S().openDestination();
    S().setMapPick(true);
    expect(S().back()).toBe(true);
    expect(S().step).toBe('destination');
    expect(S().mapPick).toBe(false);
  });

  it('no hay volver una vez pedido', () => {
    toService();
    S().requestRide();
    expect(S().back()).toBe(false);
    expect(S().step).toBe('searching');
  });

  it('historial abre y cierra solo desde inicio', () => {
    expect(S().openHistory()).toBe(true);
    expect(S().step).toBe('history');
    expect(S().back()).toBe(true);
    expect(S().step).toBe('home');
    toService();
    expect(S().openHistory()).toBe(false);
  });
});

describe('reasignación', () => {
  it('cambia la unidad y reinicia la llegada', () => {
    toService();
    S().requestRide();
    S().assignUnit(unit, approach, 'central', 1_000);
    const other = fleet[1];
    expect(S().reassignUnit(other, approach, 5_000)).toBe(true);
    expect(S().unit?.id).toBe(other.id);
    expect(S().phaseStartedAt).toBe(5_000);
    expect(S().reassignUnit(other, approach)).toBe(false); // misma unidad
    S().markArrived();
    expect(S().reassignUnit(fleet[2], approach)).toBe(false); // ya llegó
  });
});

describe('Bloque 4: repetir viaje y confirmación de la central', () => {
  it('"Repetir viaje" desde Mis viajes precarga destino y servicio y va a elegir servicio', async () => {
    const { tripHistory } = await import('@/mocks/history');
    const trip = tripHistory[0];
    S().setPickup(pickup);
    expect(S().openHistory()).toBe(true);
    expect(S().repeatTrip(trip)).toBe(true);
    expect(S().step).toBe('service');
    expect(S().destination).toMatchObject({ label: trip.dropoff_label, lat: trip.dropoff_lat, lng: trip.dropoff_lng });
    expect(S().serviceId).toBe(trip.service_id);
    expect(S().pickup).toEqual(pickup); // la recogida actual se conserva
    expect(S().route).toBeNull(); // la ruta se recalcula
    expect(events.some((e) => e.type === 'destination_selected')).toBe(true);
  });

  it('solo se repite desde Mis viajes', async () => {
    const { tripHistory } = await import('@/mocks/history');
    expect(S().repeatTrip(tripHistory[0])).toBe(false);
  });

  it('ride:ack de la central se guarda solo para el pedido en búsqueda', () => {
    toService();
    S().requestRide();
    const id = S().ride!.id;
    expect(S().centralMode).toBeNull();
    expect(S().setCentralAck('ride-otro', 'manual')).toBe(false);
    expect(S().setCentralAck(id, 'manual')).toBe(true);
    expect(S().centralMode).toBe('manual');
    S().cancel();
    expect(S().centralMode).toBeNull();
  });
});
