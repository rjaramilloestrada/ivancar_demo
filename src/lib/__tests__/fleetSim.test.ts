import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_UNIT_IDS, fleetById } from '@/mocks/drivers';
import { patrolRoutes } from '@/mocks/fleetRoutes';
import type { LatLng } from '@/types';
import { approachAt, pickUnit, visibleUnits, type PlannedApproach } from '../dispatch';
import { getFleetPlan, inPlan, passengerUnitIds, patrolPosition, patrolSegment, PATROL_SPEED_MPS, setFleetPlan, travelProgress } from '../fleetSim';
import { bearing, destinationPoint, haversine, pathLength, poseOnPath, removeSpurs, simplifyPath } from '../geo';
import { choosePhases, needsPlan, planFrom, REUSE_M } from '../localFleet';
import { estimateRoute } from '../routing';

const CENTER: LatLng = [-2.1685, -79.9104]; // Urdesa

/** Circuito cuadrado de ~2,4 km alrededor del centro (sin red). */
function square(center: LatLng, half = 600): LatLng[] {
  const pts = [45, 135, 225, 315].map((b) => destinationPoint(center, b, half * Math.SQRT2));
  const out: LatLng[] = [];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    for (let k = 0; k < 10; k++) out.push([a[0] + ((b[0] - a[0]) * k) / 10, a[1] + ((b[1] - a[1]) * k) / 10]);
  }
  out.push(out[0]);
  return out;
}

afterEach(() => {
  setFleetPlan(null, { force: true });
});

describe('travelProgress', () => {
  it('va de 0 a 1, nunca retrocede y es suave en los extremos', () => {
    expect(travelProgress(0)).toBe(0);
    expect(travelProgress(1)).toBeCloseTo(1, 10);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = travelProgress(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // Arranque suave: al 4 % del tiempo avanzó menos del 4 % del camino.
    expect(travelProgress(0.04)).toBeLessThan(0.04);
    // Velocidad constante en medio: pasos iguales.
    expect(travelProgress(0.5) - travelProgress(0.4)).toBeCloseTo(travelProgress(0.6) - travelProgress(0.5), 10);
  });
});

describe('geo: rumbo estable y limpieza', () => {
  it('poseOnPath ignora un quiebre final corto (no gira 180° al llegar)', () => {
    const a: LatLng = [-2.17, -79.91];
    const b = destinationPoint(a, 0, 300); // 300 m al norte
    const back = destinationPoint(b, 180, 3); // 3 m de vuelta al sur
    const path = [a, b, back];
    const end = poseOnPath(path, 1);
    expect(Math.min(end.bearing, 360 - end.bearing)).toBeLessThan(45); // sigue mirando al norte
  });

  it('removeSpurs quita una entrada y salida por la misma calle', () => {
    const a: LatLng = [-2.17, -79.91];
    const b = destinationPoint(a, 90, 200);
    const spur = destinationPoint(b, 0, 80);
    const c = destinationPoint(b, 90, 200);
    const clean = removeSpurs([a, b, spur, b, c]);
    expect(clean).toHaveLength(3);
    expect(pathLength(clean)).toBeCloseTo(400, -1);
  });

  it('simplifyPath conserva extremos y forma', () => {
    const line: LatLng[] = Array.from({ length: 50 }, (_, i) => [-2.17 + i * 1e-5, -79.91]);
    const s = simplifyPath(line, 2);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual(line[0]);
    expect(s[1]).toEqual(line[49]);
  });

  it('los circuitos incluidos no tienen vaivenes cortos', () => {
    for (const r of Object.values(patrolRoutes)) expect(removeSpurs(r.path).length).toBe(r.path.length);
  });
});

describe('plan de flota', () => {
  it('sin plan, el pasajero ve las unidades de zona en sus circuitos por defecto', () => {
    expect(getFleetPlan()).toBeNull();
    expect(passengerUnitIds()).toEqual([...LOCAL_UNIT_IDS]);
    const p = patrolPosition('drv-15', 1_000_000);
    expect(p.point[0]).toBeLessThan(-2);
  });

  it('planFrom reparte 6 unidades de zona cerca de la recogida, con tipos para cada servicio', () => {
    const plan = planFrom(CENTER, [square(CENTER, 450), square(CENTER, 900)], 'osrm', 5_000_000);
    expect(plan.units.map((u) => u.id).sort()).toEqual([...LOCAL_UNIT_IDS].sort());
    setFleetPlan(plan);
    const near = passengerUnitIds().filter((id) => {
      const d = haversine(patrolPosition(id, 5_000_000).point, CENTER);
      return d >= 300 && d <= 2_000;
    });
    expect(near.length).toBeGreaterThanOrEqual(4);
    const types = new Set(passengerUnitIds().map((id) => fleetById[id].vehicle.service_id));
    for (const t of ['taxi', 'ejecutivo', 'suv', 'camioneta']) expect(types.has(t as never)).toBe(true);
    expect(inPlan('drv-15')).toBe(true);
    expect(inPlan('drv-01')).toBe(false);
  });

  it('las posiciones dependen solo de la hora (mismo plan = mismo punto en pasajero y central)', () => {
    const plan = planFrom(CENTER, [square(CENTER, 450), square(CENTER, 900)], 'osrm', 5_000_000);
    setFleetPlan(JSON.parse(JSON.stringify(plan))); // como llega por el canal
    const a = patrolPosition('drv-16', 5_012_345);
    setFleetPlan(plan, { force: true });
    const b = patrolPosition('drv-16', 5_012_345);
    expect(a.point).toEqual(b.point);
    // Avanza a la velocidad de patrulla.
    const c = patrolPosition('drv-16', 5_013_345);
    expect(haversine(b.point, c.point)).toBeCloseTo(PATROL_SPEED_MPS, 0);
  });

  it('ignora un plan más viejo o repetido', () => {
    const p1 = planFrom(CENTER, [square(CENTER)], 'osrm', 2_000);
    const p0 = planFrom(CENTER, [square(CENTER)], 'osrm', 1_000);
    expect(setFleetPlan(p1)).toBe(true);
    expect(setFleetPlan(p1)).toBe(false);
    expect(setFleetPlan(p0)).toBe(false);
  });

  it('reutiliza el plan mientras la recogida no se aleje', () => {
    const plan = planFrom(CENTER, [square(CENTER)], 'osrm');
    expect(needsPlan(CENTER, null)).toBe(true);
    expect(needsPlan(destinationPoint(CENTER, 0, REUSE_M - 100), plan)).toBe(false);
    expect(needsPlan(destinationPoint(CENTER, 0, REUSE_M + 100), plan)).toBe(true);
  });

  it('choosePhases deja las unidades dentro del rango pedido', () => {
    const loop = square(CENTER, 700);
    const phases = choosePhases(loop, CENTER, 3, [500, 1_100]);
    expect(phases).toHaveLength(3);
  });

  it('patrolSegment sigue el circuito entre dos horas, también al cruzar el cierre', () => {
    setFleetPlan(planFrom(CENTER, [square(CENTER, 300)], 'osrm', 0));
    const loopLen = pathLength(square(CENTER, 300));
    for (const t0 of [10_000, Math.round((loopLen / PATROL_SPEED_MPS) * 1000) - 2_000]) {
      const seg = patrolSegment('drv-15', t0, t0 + 6_000)!;
      expect(seg.length).toBeGreaterThanOrEqual(2);
      expect(pathLength(seg)).toBeCloseTo(6 * PATROL_SPEED_MPS, 0);
      expect(haversine(seg[0], patrolPosition('drv-15', t0).point)).toBeLessThan(0.5);
      expect(haversine(seg[seg.length - 1], patrolPosition('drv-15', t0 + 6_000).point)).toBeLessThan(0.5);
    }
  });
});

describe('asignación con el reloj de flota', () => {
  it('pickUnit elige entre las unidades visibles, con su posición actual', () => {
    setFleetPlan(planFrom(CENTER, [square(CENTER, 450), square(CENTER, 900)], 'osrm', 0));
    const now = 77_000;
    const u = pickUnit('taxi', CENTER, { now })!;
    expect(passengerUnitIds()).toContain(u.id);
    expect(u.vehicle.service_id).toBe('taxi');
    expect([u.lat, u.lng]).toEqual(patrolPosition(u.id, now).point);
    // Es la más cercana de las visibles del tipo.
    const taxis = visibleUnits(now).filter((x) => x.vehicle.service_id === 'taxi');
    const best = Math.min(...taxis.map((x) => haversine(CENTER, [x.lat, x.lng])));
    expect(haversine(CENTER, [u.lat, u.lng])).toBeCloseTo(best, 6);
    expect(pickUnit('suv', CENTER, { now })!.vehicle.service_id).toBe('suv');
  });

  it('approachAt empalma la patrulla con la ruta: arranca donde está la unidad', () => {
    setFleetPlan(planFrom(CENTER, [square(CENTER, 450), square(CENTER, 900)], 'osrm', 0));
    const at = 50_000;
    const from = patrolPosition('drv-16', at).point;
    const planned: PlannedApproach = { unitId: 'drv-16', at, route: estimateRoute(from, CENTER) };
    const now = at - 4_000;
    const r = approachAt(planned, now)!;
    expect(haversine(r.path[0], patrolPosition('drv-16', now).point)).toBeLessThan(0.5);
    expect(r.distance_m).toBeGreaterThan(planned.route.distance_m);
    // Si la asignación llega muy tarde, la ruta preparada ya no sirve.
    expect(approachAt(planned, at + 5_000)).toBeNull();
    // Rumbo de salida: el de la patrulla en ese punto.
    const diff = Math.abs(((bearing(r.path[0], r.path[1]) - patrolPosition('drv-16', now).bearing + 540) % 360) - 180);
    expect(diff).toBeLessThan(30);
  });
});
