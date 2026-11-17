import { useEffect, useMemo, useState } from 'react';
import { places, savedPlaces, sectors } from '@/mocks/places';
import type { LatLng, Place, Sector } from '@/types';
import { toLatLng } from '@/types';
import { haversine, nearest } from './geo';

/**
 * Direcciones para el pin.
 *
 * 1. `localLabel(latlng)`: etiqueta local instantánea, sin red (lugar conocido o sector
 *    más cercano). Siempre disponible: es lo que se muestra primero.
 * 2. `reverseGeocode(latlng)`: mejora opcional con Nominatim (OSM). Respeta su política
 *    de uso: como máximo 1 petición por segundo en total, sin ráfagas (solo se envía la
 *    última posición pedida), caché por coordenada, y pausa tras fallos repetidos.
 *    El navegador manda su Referer/User-Agent; no se puede fijar uno propio desde JS.
 * 3. `useAddress(latlng)`: hook que combina ambos con debounce y cancelación.
 */

export interface LocalLabel {
  /** Texto principal: "Plaza Lagos" o "Cerca de Plaza Lagos" o "Kennedy". */
  title: string;
  /** Sector y ciudad: "Samborondón", "Kennedy, Guayaquil". */
  subtitle: string;
  /** "Cerca de Plaza Lagos, Samborondón". */
  text: string;
  place: Place | null;
  sector: Sector | null;
}

/** Radio dentro del cual el punto ES el lugar (m). */
const AT_PLACE_M = 120;
/** Radio dentro del cual el punto está "cerca de" un lugar (m). */
const NEAR_PLACE_M = 650;

interface Landmark {
  name: string;
  sector: string;
  point: LatLng;
  place: Place | null;
}

const landmarks: Landmark[] = places.map((p) => ({ name: p.short_name, sector: p.sector, point: toLatLng(p), place: p }));

function sectorFor(latlng: LatLng): Sector | null {
  // El sector cuyo borde (centro + radio) queda más cerca en proporción a su radio.
  let best: Sector | null = null;
  let bestScore = Infinity;
  for (const s of sectors) {
    const score = haversine(latlng, toLatLng(s)) / s.radius_m;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore <= 2.2 ? best : null;
}

function sectorText(s: Sector | null): string {
  if (!s) return 'Guayas';
  return s.name === s.city ? s.name : `${s.name}, ${s.city}`;
}

/** Etiqueta local instantánea para una coordenada. */
export function localLabel(latlng: LatLng): LocalLabel {
  const sector = sectorFor(latlng);
  const { item: lm, distance } = nearest(latlng, landmarks, (l) => l.point);
  const where = sectorText(sector);

  if (lm && distance <= AT_PLACE_M) {
    return { title: lm.name, subtitle: where, text: `${lm.name}, ${sector?.name ?? where}`, place: lm.place, sector };
  }
  if (lm && distance <= NEAR_PLACE_M) {
    const title = `Cerca de ${lm.name}`;
    return { title, subtitle: where, text: `${title}, ${sector?.name ?? where}`, place: lm.place, sector };
  }
  if (sector) {
    return { title: sector.name, subtitle: sector.city, text: sectorText(sector), place: null, sector };
  }
  return { title: 'Punto en el mapa', subtitle: 'Guayas', text: 'Punto en el mapa, Guayas', place: null, sector: null };
}

/** Nombre de un lugar guardado si el punto está encima (≤ 80 m). */
export function savedPlaceAt(latlng: LatLng) {
  return savedPlaces.find((s) => haversine(latlng, toLatLng(s)) <= 80) ?? null;
}

/* --------------------------------------------------------------- Nominatim */

export interface ReverseResult {
  /** Calle o lugar ("Avenida Río Guayas"), si Nominatim lo sabe. */
  street: string | null;
  /** Barrio o ciudadela ("Samborondón"). */
  area: string | null;
}

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
export const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1100;
const FAIL_PAUSE_MS = 60_000;
const TIMEOUT_MS = 4000;

/** Zona de servicio del demo (Guayaquil, Samborondón, Durán y Vía a la Costa). */
export const SERVICE_BOX = { latMin: -2.4, latMax: -1.9, lngMin: -80.2, lngMax: -79.7 } as const;

const reverseCache = new Map<string, ReverseResult | null>();
const searchCache = new Map<string, DirectResult[]>();
let lastRequestAt = 0;
let failures = 0;
let pausedUntil = 0;

/**
 * Control de ritmo compartido por la búsqueda inversa y la directa (política de uso de
 * Nominatim): una sola petición pendiente a la vez (la nueva reemplaza a la anterior),
 * al menos MIN_INTERVAL_MS entre envíos, pausa tras fallos y nada si no hay red.
 */
interface Job {
  url: string;
  signal?: AbortSignal;
  /** Procesa el JSON y deja el resultado en su caché. */
  accept: (json: unknown) => unknown;
  resolve: (r: unknown) => void;
}
let pending: Job | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const rkey = (p: LatLng) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`; // ~11 m

interface NominatimJson {
  error?: string;
  name?: string;
  address?: Record<string, string | undefined>;
}

function parse(j: NominatimJson): ReverseResult | null {
  if (j.error || !j.address) return null;
  const a = j.address;
  const street = a.road ?? a.pedestrian ?? a.footway ?? (j.name || null) ?? null;
  const area = a.neighbourhood ?? a.residential ?? a.quarter ?? a.suburb ?? a.city_district ?? a.city ?? a.town ?? null;
  if (!street && !area) return null;
  return { street, area };
}

async function send(job: Job) {
  lastRequestAt = Date.now();
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  job.signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(job.url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const result = job.accept(await res.json());
    failures = 0;
    job.resolve(result);
  } catch {
    // Abortar por el llamador no cuenta como fallo; el timeout sí.
    if (!job.signal?.aborted) {
      failures++;
      if (failures >= 2) pausedUntil = Date.now() + FAIL_PAUSE_MS;
    }
    job.resolve(null);
  } finally {
    clearTimeout(timeout);
    job.signal?.removeEventListener('abort', onAbort);
  }
}

function schedule() {
  if (timer || !pending) return;
  const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
  timer = setTimeout(() => {
    timer = null;
    const job = pending;
    pending = null;
    if (!job) return;
    if (job.signal?.aborted) return job.resolve(null);
    void send(job);
  }, wait);
}

function offline(): boolean {
  return Date.now() < pausedUntil || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

function enqueue<T>(url: string, accept: (json: unknown) => T, signal?: AbortSignal): Promise<T | null> {
  return new Promise((resolve) => {
    pending?.resolve(null); // se descarta la anterior: sin ráfagas
    pending = { url, signal, accept, resolve: resolve as (r: unknown) => void };
    schedule();
  });
}

/**
 * Dirección por Nominatim. Resuelve `null` si no hay respuesta útil, si falla, si está en
 * pausa por fallos o si se reemplaza por una petición más nueva. Nunca rechaza.
 */
export function reverseGeocode(latlng: LatLng, { signal }: { signal?: AbortSignal } = {}): Promise<ReverseResult | null> {
  const k = rkey(latlng);
  if (reverseCache.has(k)) return Promise.resolve(reverseCache.get(k) ?? null);
  if (offline()) return Promise.resolve(null);
  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${latlng[0].toFixed(6)}&lon=${latlng[1].toFixed(6)}&zoom=18&addressdetails=1&accept-language=es`;
  return enqueue(
    url,
    (json) => {
      const r = parse(json as NominatimJson);
      reverseCache.set(k, r);
      return r;
    },
    signal,
  );
}

/* ------------------------------------------------------- Búsqueda directa */

export interface DirectResult {
  id: string;
  /** Nombre corto: "Avenida Francisco de Orellana", "Mall del Sol". */
  title: string;
  /** Barrio y ciudad: "Kennedy, Guayaquil". */
  subtitle: string;
  lat: number;
  lng: number;
}

/** Mínimo de caracteres para consultar (política de uso: nada de autocompletar por tecla). */
export const SEARCH_MIN_CHARS = 3;
export const SEARCH_DEBOUNCE_MS = 450;
const SEARCH_LIMIT = 6;

interface SearchJson {
  place_id?: number | string;
  osm_type?: string;
  osm_id?: number | string;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
}

const cleanQuery = (q: string) => q.trim().replace(/\s+/g, ' ');
const skey = (q: string) => cleanQuery(q).toLowerCase();

function parseSearch(json: unknown): DirectResult[] {
  if (!Array.isArray(json)) return [];
  const out: DirectResult[] = [];
  const seen = new Set<string>();
  for (const raw of json as SearchJson[]) {
    const lat = Number(raw.lat);
    const lng = Number(raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const a = raw.address ?? {};
    const first = raw.display_name?.split(',')[0]?.trim();
    const title = raw.name || a.road || first || '';
    if (!title) continue;
    const area = a.neighbourhood ?? a.quarter ?? a.suburb ?? a.city_district ?? null;
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
    const road = a.road && a.road !== title ? a.road : null;
    const subtitle = [road && a.house_number ? `${road} ${a.house_number}` : road, area, city]
      .filter((x, i, arr): x is string => !!x && x !== title && arr.indexOf(x) === i)
      .slice(0, 2)
      .join(', ');
    // Las calles llegan en varios tramos con el mismo nombre: se deja uno por nombre y barrio.
    const k = `${title}|${subtitle}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ id: `osm-${raw.osm_type ?? 'x'}-${raw.osm_id ?? raw.place_id ?? out.length}`, title, subtitle: subtitle || 'Guayas', lat, lng });
  }
  return out;
}

/**
 * Búsqueda directa de direcciones y lugares con Nominatim, acotada a la zona de servicio.
 * Resuelve la lista (vacía si no hay coincidencias) o `null` si no hubo respuesta: falla,
 * sin red, en pausa, texto demasiado corto o reemplazada por una petición más nueva.
 */
export function searchPlaces(query: string, { signal }: { signal?: AbortSignal } = {}): Promise<DirectResult[] | null> {
  const q = cleanQuery(query);
  if (q.length < SEARCH_MIN_CHARS) return Promise.resolve(null);
  const k = skey(q);
  const hit = searchCache.get(k);
  if (hit) return Promise.resolve(hit);
  if (offline()) return Promise.resolve(null);
  const b = SERVICE_BOX;
  const url =
    `${NOMINATIM_SEARCH_URL}?format=jsonv2&q=${encodeURIComponent(q)}&accept-language=es&countrycodes=ec` +
    `&viewbox=${b.lngMin},${b.latMax},${b.lngMax},${b.latMin}&bounded=1&addressdetails=1&limit=${SEARCH_LIMIT}`;
  return enqueue(
    url,
    (json) => {
      const r = parseSearch(json);
      searchCache.set(k, r);
      return r;
    },
    signal,
  );
}

/** Solo para pruebas: reinicia caché, ritmo y pausas. */
export function resetGeocodeForTests() {
  reverseCache.clear();
  searchCache.clear();
  lastRequestAt = 0;
  failures = 0;
  pausedUntil = 0;
  pending?.resolve(null);
  pending = null;
  if (timer) clearTimeout(timer);
  timer = null;
}

export interface DirectSearchState {
  results: DirectResult[];
  /** true mientras se espera (incluye el debounce). */
  loading: boolean;
  /** true si no hubo respuesta (sin red, fallo o pausa). */
  failed: boolean;
  /** true si ya hay una consulta resuelta para el texto actual. */
  done: boolean;
}

/** Búsqueda directa con debounce para un campo de texto. Inactiva con menos de 3 caracteres. */
export function useDirectSearch(query: string, { debounceMs = SEARCH_DEBOUNCE_MS }: { debounceMs?: number } = {}): DirectSearchState {
  const q = cleanQuery(query);
  const active = q.length >= SEARCH_MIN_CHARS;
  const k = skey(q);
  const [state, setState] = useState<{ key: string; results: DirectResult[] | null } | null>(null);

  useEffect(() => {
    if (!active) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, { signal: ctrl.signal }).then((results) => {
        if (!ctrl.signal.aborted) setState({ key: k, results });
      });
    }, debounceMs);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, k, active, debounceMs]);

  if (!active) return { results: [], loading: false, failed: false, done: false };
  const current = state && state.key === k ? state : null;
  return { results: current?.results ?? [], loading: !current, failed: !!current && current.results === null, done: !!current };
}

/* ------------------------------------------------------------------- Hook */

export interface AddressState {
  /** Etiqueta local (instantánea). */
  local: LocalLabel;
  /** Resultado de Nominatim, o null mientras carga / si no responde. */
  remote: ReverseResult | null;
  /** true mientras se espera a Nominatim. */
  resolving: boolean;
  /** Texto principal recomendado: calle de Nominatim o etiqueta local. */
  title: string;
  /** Texto secundario recomendado. */
  subtitle: string;
}

/**
 * Dirección para una coordenada: etiqueta local al instante y, tras `debounceMs` sin
 * cambios, mejora con Nominatim. Pasa `latlng = null` para no hacer nada.
 * `remote: false` desactiva Nominatim (p. ej. en listas o tests).
 */
export function useAddress(
  latlng: LatLng | null,
  { debounceMs = 700, remote: useRemote = true }: { debounceMs?: number; remote?: boolean } = {},
): AddressState | null {
  const lat = latlng?.[0];
  const lng = latlng?.[1];
  const local = useMemo(() => (lat == null || lng == null ? null : localLabel([lat, lng])), [lat, lng]);
  const [remote, setRemote] = useState<{ key: string; value: ReverseResult | null } | null>(null);
  const k = lat == null || lng == null ? '' : rkey([lat, lng]);

  useEffect(() => {
    if (lat == null || lng == null || !useRemote) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      reverseGeocode([lat, lng], { signal: ctrl.signal }).then((value) => {
        if (!ctrl.signal.aborted) setRemote({ key: rkey([lat, lng]), value });
      });
    }, debounceMs);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [lat, lng, debounceMs, useRemote]);

  if (!local) return null;
  const r = remote && remote.key === k ? remote.value : null;
  const resolving = useRemote && (!remote || remote.key !== k);
  const saved = lat != null && lng != null ? savedPlaceAt([lat, lng]) : null;
  const title = saved ? saved.label : local.place && local.title === local.place.short_name ? local.title : (r?.street ?? local.title);
  const subtitle = r?.street && title === r.street ? local.text : local.subtitle;
  return { local, remote: r, resolving, title, subtitle };
}
