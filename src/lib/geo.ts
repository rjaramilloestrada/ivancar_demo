import type { LatLng } from '@/types';

/**
 * Geometría para el demo: distancias, interpolación sobre polilíneas, rumbo y formato.
 * Todas las coordenadas son tuplas [lat, lng] en grados. Distancias en metros.
 */

const R = 6_371_008.8; // radio medio de la Tierra (m)
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Distancia de gran círculo entre dos puntos (m). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Distancias acumuladas desde el inicio: cum[i] = largo de path[0..i]. */
export function cumulativeDistances(path: readonly LatLng[]): number[] {
  const cum = new Array<number>(path.length);
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) acc += haversine(path[i - 1], path[i]);
    cum[i] = acc;
  }
  return cum;
}

/** Largo total de una polilínea (m). */
export function pathLength(path: readonly LatLng[]): number {
  let acc = 0;
  for (let i = 1; i < path.length; i++) acc += haversine(path[i - 1], path[i]);
  return acc;
}

/** Rumbo inicial de a hacia b en grados [0, 360), 0 = norte, sentido horario. */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a[0]);
  const φ2 = toRad(b[0]);
  const Δλ = toRad(b[1] - a[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Interpolación lineal entre dos puntos (suficiente para tramos urbanos cortos). */
export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Interpola un ángulo por el camino más corto (grados). */
export function lerpAngle(from: number, to: number, t: number): number {
  const d = ((((to - from) % 360) + 540) % 360) - 180;
  return (from + d * t + 360) % 360;
}

export interface PathPoint {
  point: LatLng;
  /** Rumbo del tramo donde cae el punto. */
  bearing: number;
  /** Índice del vértice inicial del tramo. */
  index: number;
  /** Distancia recorrida desde el inicio (m). */
  distance: number;
}

/**
 * Punto a una fracción (0..1) del largo de la polilínea.
 * Pasa `cum` (de `cumulativeDistances`) si vas a llamarla muchas veces sobre la misma ruta.
 */
export function pointAlong(path: readonly LatLng[], fraction: number, cum = cumulativeDistances(path)): PathPoint {
  const n = path.length;
  if (n === 0) return { point: [0, 0], bearing: 0, index: 0, distance: 0 };
  if (n === 1) return { point: path[0], bearing: 0, index: 0, distance: 0 };
  const total = cum[n - 1];
  const f = Math.min(1, Math.max(0, fraction));
  const target = f * total;
  // Búsqueda binaria del tramo [lo, lo+1] que contiene target.
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  // Rumbo: saltar tramos de largo cero.
  let a = lo;
  let b = lo + 1;
  while (b < n - 1 && cum[b] - cum[a] === 0) b++;
  while (a > 0 && cum[b] - cum[a] === 0) a--;
  const seg = cum[lo + 1] - cum[lo];
  const t = seg > 0 ? (target - cum[lo]) / seg : 0;
  return {
    point: lerpLatLng(path[lo], path[lo + 1], t),
    bearing: bearing(path[a], path[b]),
    index: lo,
    distance: target,
  };
}

/** Sub-polilínea entre dos fracciones del largo (0..1). */
export function slicePath(
  path: readonly LatLng[],
  from: number,
  to: number,
  cum = cumulativeDistances(path),
): LatLng[] {
  if (path.length < 2) return path.slice();
  const f0 = Math.min(1, Math.max(0, Math.min(from, to)));
  const f1 = Math.min(1, Math.max(0, Math.max(from, to)));
  const start = pointAlong(path, f0, cum);
  const end = pointAlong(path, f1, cum);
  const out: LatLng[] = [start.point];
  for (let i = start.index + 1; i <= end.index; i++) out.push(path[i]);
  out.push(end.point);
  return out;
}

/**
 * Curva suave entre dos puntos (Bézier cuadrática), como ruta de respaldo cuando no hay
 * enrutador. `bend` es la flecha relativa al largo (0 = recta). El lado de la curva es
 * determinista para el mismo par de puntos.
 */
export function curvedPath(a: LatLng, b: LatLng, { segments = 48, bend = 0.16 } = {}): LatLng[] {
  const mid = lerpLatLng(a, b, 0.5);
  // Perpendicular en un plano local (lng escalado por cos(lat)).
  const k = Math.cos(toRad(mid[0]));
  const dx = (b[1] - a[1]) * k;
  const dy = b[0] - a[0];
  const side = (Math.round((a[0] + a[1] + b[0] + b[1]) * 1e4) & 1) === 0 ? 1 : -1;
  const ctrl: LatLng = [mid[0] + dx * bend * side, mid[1] + (-dy * bend * side) / (k || 1)];
  const out: LatLng[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    out.push([
      u * u * a[0] + 2 * u * t * ctrl[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * ctrl[1] + t * t * b[1],
    ]);
  }
  return out;
}

/** Punto destino a `distance` m con rumbo `deg` desde `origin`. */
export function destinationPoint(origin: LatLng, deg: number, distance: number): LatLng {
  const δ = distance / R;
  const θ = toRad(deg);
  const φ1 = toRad(origin[0]);
  const λ1 = toRad(origin[1]);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [toDeg(φ2), toDeg(λ2)];
}

/**
 * Punto aleatorio uniforme dentro de un radio (m). `minRadius` evita caer encima del centro.
 * Ojo: no sabe de ríos; úsalo con radios cortos o con puntos de tierra conocidos.
 */
export function randomNearby(center: LatLng, radius: number, rng: () => number = Math.random, minRadius = 0): LatLng {
  const r = Math.sqrt(minRadius ** 2 + rng() * (radius ** 2 - minRadius ** 2));
  return destinationPoint(center, rng() * 360, r);
}

/** PRNG determinista (mulberry32), útil para mocks reproducibles. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Caja envolvente [[sur, oeste], [norte, este]] (formato de Leaflet). */
export function boundsOf(points: readonly LatLng[]): [LatLng, LatLng] {
  let s = Infinity;
  let w = Infinity;
  let n = -Infinity;
  let e = -Infinity;
  for (const [lat, lng] of points) {
    if (lat < s) s = lat;
    if (lat > n) n = lat;
    if (lng < w) w = lng;
    if (lng > e) e = lng;
  }
  return [
    [s, w],
    [n, e],
  ];
}

/** Índice y distancia del punto más cercano de una lista. */
export function nearest<T>(origin: LatLng, items: readonly T[], getPoint: (item: T) => LatLng) {
  let best: T | undefined;
  let bestD = Infinity;
  for (const item of items) {
    const d = haversine(origin, getPoint(item));
    if (d < bestD) {
      bestD = d;
      best = item;
    }
  }
  return { item: best, distance: bestD };
}

/* ------------------------------------------------------------------ Formato */

const nf1 = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-EC', { maximumFractionDigits: 0 });

/** 0–999 m → "850 m" (redondeo a 10 m); ≥ 1 km → "4,2 km"; ≥ 100 km → "123 km". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 950) return `${nf0.format(Math.max(10, Math.round(meters / 10) * 10))} m`;
  const km = meters / 1000;
  return km >= 100 ? `${nf0.format(km)} km` : `${nf1.format(km)} km`;
}

/** Minutos → "1 min", "12 min", "1 h", "1 h 05 min". Redondea hacia arriba, mínimo 1. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—';
  const m = Math.max(1, Math.ceil(minutes - 1e-9));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')} min`;
}

/** Segundos → igual que formatMinutes. */
export function formatDuration(seconds: number): string {
  return formatMinutes(seconds / 60);
}

/* ------------------------------------------------------- Rumbo estable y limpieza */

/** Punto a `d` metros del inicio (sin rumbo). */
function pointAtDistance(path: readonly LatLng[], cum: readonly number[], d: number): LatLng {
  const n = path.length;
  if (n === 1) return path[0];
  const total = cum[n - 1];
  const target = Math.min(total, Math.max(0, d));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= target) lo = mid;
    else hi = mid;
  }
  const seg = cum[lo + 1] - cum[lo];
  return lerpLatLng(path[lo], path[lo + 1], seg > 0 ? (target - cum[lo]) / seg : 0);
}

/**
 * Punto y rumbo a una fracción del largo, con el rumbo medido sobre una ventana de
 * ±`window` metros (no sobre el tramo exacto). Así un tramo diminuto o un quiebre al final
 * de la ruta no hacen girar el auto, y al llegar (fracción 1) el rumbo es el de los
 * últimos metros recorridos, no el de un tramo suelto.
 */
export function poseOnPath(
  path: readonly LatLng[],
  fraction: number,
  cum: readonly number[] = cumulativeDistances(path),
  window = 14,
): { point: LatLng; bearing: number } {
  const n = path.length;
  if (n === 0) return { point: [0, 0], bearing: 0 };
  if (n === 1) return { point: path[0], bearing: 0 };
  const total = cum[n - 1];
  const d = Math.min(1, Math.max(0, fraction)) * total;
  const point = pointAtDistance(path, cum, d);
  if (total <= 0) return { point, bearing: 0 };
  const w = Math.min(window, total / 2);
  let a = d - w;
  let b = d + w;
  if (a < 0) {
    b -= a;
    a = 0;
  }
  if (b > total) {
    a = Math.max(0, a - (b - total));
    b = total;
  }
  return { point, bearing: bearing(pointAtDistance(path, cum, a), pointAtDistance(path, cum, b)) };
}

/** Simplificación Douglas-Peucker con tolerancia en metros (proyección local). */
export function simplifyPath(path: readonly LatLng[], toleranceM = 4): LatLng[] {
  if (path.length <= 2) return path.slice();
  const k = Math.cos(toRad(path[0][0]));
  const xy = path.map(([lat, lng]) => [toRad(lng) * k * R, toRad(lat) * R] as const);
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, path.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = xy[s];
    const [x2, y2] = xy[e];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [x, y] = xy[i];
      let t = len2 > 0 ? ((x - x1) * dx + (y - y1) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = x1 + t * dx - x;
      const ey = y1 + t * dy - y;
      const d = ex * ex + ey * ey;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx > 0 && maxD > toleranceM * toleranceM) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return path.filter((_, i) => keep[i]);
}

/**
 * Quita los "vaivenes" de una polilínea: tramos en que el recorrido entra a una calle y
 * vuelve por el mismo camino (un punto que reaparece a menos de `nearM` metros tras un desvío
 * de `minDetourM`–`maxDetourM` metros). También quita puntos repetidos. No toca el primer ni el último punto.
 */
export function removeSpurs(
  path: readonly LatLng[],
  { nearM = 9, lookahead = 40, minDetourM = 25, maxDetourM = 600 } = {},
): LatLng[] {
  let out = path.filter((p, i) => i === 0 || haversine(p, path[i - 1]) > 0.5);
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length - 2 && !changed; i++) {
      let detour = 0;
      for (let j = i + 2; j < Math.min(out.length - 1, i + lookahead); j++) {
        detour += haversine(out[j - 1], out[j]);
        if (j === i + 2) detour += haversine(out[i], out[i + 1]);
        if (detour > maxDetourM) break;
        if (detour >= minDetourM && haversine(out[i], out[j]) < nearM) {
          out = [...out.slice(0, i + 1), ...out.slice(j + 1)];
          changed = true;
          break;
        }
      }
    }
  }
  return out;
}
