import { describe, expect, it } from 'vitest';
import {
  bearing,
  boundsOf,
  cumulativeDistances,
  curvedPath,
  formatDistance,
  formatMinutes,
  haversine,
  lerpAngle,
  pathLength,
  pointAlong,
  randomNearby,
  seededRandom,
  slicePath,
} from '../geo';
import type { LatLng } from '@/types';

const AIRPORT: LatLng = [-2.1574, -79.8836];
const PLAZA_LAGOS: LatLng = [-2.09832, -79.87466];

describe('haversine', () => {
  it('es 0 para el mismo punto', () => {
    expect(haversine(AIRPORT, AIRPORT)).toBe(0);
  });
  it('un grado de latitud ≈ 111,2 km', () => {
    expect(haversine([0, 0], [1, 0])).toBeCloseTo(111_195, -2);
  });
  it('aeropuerto → Plaza Lagos ≈ 6,6 km en línea recta', () => {
    const d = haversine(AIRPORT, PLAZA_LAGOS);
    expect(d).toBeGreaterThan(6_400);
    expect(d).toBeLessThan(6_900);
  });
  it('es simétrica', () => {
    expect(haversine(AIRPORT, PLAZA_LAGOS)).toBeCloseTo(haversine(PLAZA_LAGOS, AIRPORT), 6);
  });
});

describe('bearing', () => {
  it('norte, este, sur, oeste', () => {
    expect(bearing([0, 0], [1, 0])).toBeCloseTo(0, 5);
    expect(bearing([0, 0], [0, 1])).toBeCloseTo(90, 5);
    expect(bearing([0, 0], [-1, 0])).toBeCloseTo(180, 5);
    expect(bearing([0, 0], [0, -1])).toBeCloseTo(270, 5);
  });
  it('siempre en [0, 360)', () => {
    const b = bearing(PLAZA_LAGOS, AIRPORT);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('lerpAngle', () => {
  it('cruza 0° por el camino corto', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(0, 6);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6);
  });
});

describe('polilíneas', () => {
  const path: LatLng[] = [
    [0, 0],
    [0, 0.01],
    [0.01, 0.01],
  ];
  const total = pathLength(path);

  it('largo = suma de tramos y cum termina en el total', () => {
    const cum = cumulativeDistances(path);
    expect(cum[0]).toBe(0);
    expect(cum.at(-1)).toBeCloseTo(total, 6);
    expect(total).toBeCloseTo(haversine(path[0], path[1]) + haversine(path[1], path[2]), 6);
  });

  it('pointAlong en extremos y a la mitad (cambio de tramo)', () => {
    expect(pointAlong(path, 0).point).toEqual([0, 0]);
    expect(pointAlong(path, 1).point[0]).toBeCloseTo(0.01, 9);
    const mid = pointAlong(path, 0.5);
    expect(mid.point[0]).toBeCloseTo(0, 6);
    expect(mid.point[1]).toBeCloseTo(0.01, 4);
    const q = pointAlong(path, 0.25);
    expect(q.bearing).toBeCloseTo(90, 3);
    const t = pointAlong(path, 0.75);
    expect(t.bearing).toBeCloseTo(0, 3);
    expect(t.index).toBe(1);
  });

  it('pointAlong recorta fracciones fuera de rango', () => {
    expect(pointAlong(path, -1).point).toEqual([0, 0]);
    expect(pointAlong(path, 2).distance).toBeCloseTo(total, 6);
  });

  it('pointAlong ignora tramos de largo cero para el rumbo', () => {
    const dup: LatLng[] = [
      [0, 0],
      [0, 0],
      [0, 0.01],
    ];
    expect(pointAlong(dup, 0).bearing).toBeCloseTo(90, 3);
  });

  it('slicePath conserva largo proporcional', () => {
    const half = slicePath(path, 0, 0.5);
    expect(pathLength(half)).toBeCloseTo(total / 2, 0);
    const mid = slicePath(path, 0.25, 0.75);
    expect(pathLength(mid)).toBeCloseTo(total / 2, 0);
    expect(mid.length).toBe(3); // punto inicial, vértice intermedio, punto final
  });
});

describe('curvedPath', () => {
  it('empieza y termina en los puntos, y es un poco más larga que la recta', () => {
    const c = curvedPath(AIRPORT, PLAZA_LAGOS, { segments: 32 });
    expect(c).toHaveLength(33);
    expect(c[0]).toEqual(AIRPORT);
    expect(c.at(-1)![0]).toBeCloseTo(PLAZA_LAGOS[0], 9);
    expect(c.at(-1)![1]).toBeCloseTo(PLAZA_LAGOS[1], 9);
    const ratio = pathLength(c) / haversine(AIRPORT, PLAZA_LAGOS);
    expect(ratio).toBeGreaterThan(1.01);
    expect(ratio).toBeLessThan(1.15);
  });
  it('bend 0 = recta', () => {
    const c = curvedPath(AIRPORT, PLAZA_LAGOS, { bend: 0 });
    expect(pathLength(c)).toBeCloseTo(haversine(AIRPORT, PLAZA_LAGOS), 0);
  });
  it('es determinista', () => {
    expect(curvedPath(AIRPORT, PLAZA_LAGOS)).toEqual(curvedPath(AIRPORT, PLAZA_LAGOS));
  });
});

describe('randomNearby y seededRandom', () => {
  it('queda dentro del radio', () => {
    const rng = seededRandom(7);
    for (let i = 0; i < 200; i++) {
      const p = randomNearby(AIRPORT, 500, rng, 100);
      const d = haversine(AIRPORT, p);
      expect(d).toBeLessThanOrEqual(500.5);
      expect(d).toBeGreaterThanOrEqual(99.5);
    }
  });
  it('seededRandom es reproducible y en [0, 1)', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    for (let i = 0; i < 20; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe('boundsOf', () => {
  it('sur-oeste y norte-este', () => {
    expect(boundsOf([AIRPORT, PLAZA_LAGOS])).toEqual([
      [-2.1574, -79.8836],
      [-2.09832, -79.87466],
    ]);
  });
});

describe('formato', () => {
  it('distancias', () => {
    expect(formatDistance(0)).toBe('10 m');
    expect(formatDistance(847)).toBe('850 m');
    expect(formatDistance(4_230)).toBe('4,2 km');
    expect(formatDistance(12_960)).toBe('13,0 km');
    expect(formatDistance(123_400)).toBe('123 km');
    expect(formatDistance(NaN)).toBe('—');
  });
  it('minutos', () => {
    expect(formatMinutes(0)).toBe('1 min');
    expect(formatMinutes(0.4)).toBe('1 min');
    expect(formatMinutes(12.2)).toBe('13 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(65)).toBe('1 h 05 min');
    expect(formatMinutes(-1)).toBe('—');
  });
});
