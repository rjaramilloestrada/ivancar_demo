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
const MIN_INTERVAL_MS = 1100;
const FAIL_PAUSE_MS = 60_000;

const reverseCache = new Map<string, ReverseResult | null>();
let lastRequestAt = 0;
let failures = 0;
let pausedUntil = 0;
/** Solo una petición pendiente a la vez: la nueva reemplaza a la anterior. */
let pending: { key: string; latlng: LatLng; resolve: (r: ReverseResult | null) => void; signal?: AbortSignal } | null = null;
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

async function send(job: NonNullable<typeof pending>) {
  lastRequestAt = Date.now();
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  job.signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url = `${NOMINATIM_URL}?format=jsonv2&lat=${job.latlng[0].toFixed(6)}&lon=${job.latlng[1].toFixed(6)}&zoom=18&addressdetails=1&accept-language=es`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const result = parse((await res.json()) as NominatimJson);
    failures = 0;
    reverseCache.set(job.key, result);
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

/**
 * Dirección por Nominatim. Resuelve `null` si no hay respuesta útil, si falla, si está en
 * pausa por fallos o si se reemplaza por una petición más nueva. Nunca rechaza.
 */
export function reverseGeocode(latlng: LatLng, { signal }: { signal?: AbortSignal } = {}): Promise<ReverseResult | null> {
  const k = rkey(latlng);
  if (reverseCache.has(k)) return Promise.resolve(reverseCache.get(k) ?? null);
  if (Date.now() < pausedUntil || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    pending?.resolve(null); // se descarta la anterior: sin ráfagas
    pending = { key: k, latlng, resolve, signal };
    schedule();
  });
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
