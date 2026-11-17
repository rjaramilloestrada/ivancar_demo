import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGeocodeForTests, reverseGeocode, searchPlaces, SERVICE_BOX } from '../geocode';

const row = (name: string, extra: Record<string, unknown> = {}) => ({
  place_id: Math.floor(Math.random() * 1e6),
  osm_type: 'way',
  osm_id: name.length,
  lat: '-2.17',
  lon: '-79.9',
  name,
  display_name: `${name}, Kennedy, Guayaquil`,
  address: { road: name, suburb: 'Kennedy', city: 'Guayaquil' },
  ...extra,
});

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
  resetGeocodeForTests();
  fetchMock = vi.fn(async () => okResponse([row('Avenida Francisco de Orellana')]));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('searchPlaces', () => {
  it('no consulta con menos de 3 caracteres', async () => {
    expect(await searchPlaces('ke')).toBeNull();
    expect(await searchPlaces('  a ')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pide a Nominatim acotado a la zona de servicio, en español y con límite 6', async () => {
    const p = searchPlaces('Av. Francisco de Orellana');
    await vi.advanceTimersByTimeAsync(10);
    await p;
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('q')).toBe('Av. Francisco de Orellana');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('accept-language')).toBe('es');
    expect(url.searchParams.get('countrycodes')).toBe('ec');
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('limit')).toBe('6');
    const b = SERVICE_BOX;
    expect(url.searchParams.get('viewbox')).toBe(`${b.lngMin},${b.latMax},${b.lngMax},${b.latMin}`);
  });

  it('devuelve nombre corto y línea secundaria (barrio, ciudad), en el orden recibido', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse([
        row('Mall del Sol', { lat: '-2.155', lon: '-79.892', address: { suburb: 'Ciudadela Vernaza Norte', city: 'Guayaquil' } }),
        row('Policentro', { lat: '-2.171', lon: '-79.9', address: { neighbourhood: 'Kennedy', city: 'Guayaquil' } }),
      ]),
    );
    const p = searchPlaces('mall');
    await vi.advanceTimersByTimeAsync(10);
    const r = await p;
    expect(r?.map((x) => x.title)).toEqual(['Mall del Sol', 'Policentro']);
    expect(r?.[0].subtitle).toBe('Ciudadela Vernaza Norte, Guayaquil');
    expect(r?.[1].subtitle).toBe('Kennedy, Guayaquil');
    expect(r?.[0].lat).toBeCloseTo(-2.155);
    expect(r?.[0].lng).toBeCloseTo(-79.892);
  });

  it('deja un solo tramo por calle y barrio', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([row('Avenida Kennedy', { osm_id: 1 }), row('Avenida Kennedy', { osm_id: 2 }), row('Avenida Kennedy', { osm_id: 3 })]));
    const p = searchPlaces('kennedy');
    await vi.advanceTimersByTimeAsync(10);
    expect((await p)?.length).toBe(1);
  });

  it('cachea: la misma consulta (sin importar mayúsculas ni espacios) no vuelve a la red', async () => {
    const a = searchPlaces('Kennedy');
    await vi.advanceTimersByTimeAsync(10);
    await a;
    const b = await searchPlaces('  kennedy ');
    expect(b?.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('cachea también las búsquedas sin resultados', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([]));
    const a = searchPlaces('zzzz');
    await vi.advanceTimersByTimeAsync(10);
    expect(await a).toEqual([]);
    expect(await searchPlaces('zzzz')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respeta el intervalo mínimo de 1100 ms entre peticiones', async () => {
    const a = searchPlaces('kennedy');
    await vi.advanceTimersByTimeAsync(10);
    await a;
    const b = searchPlaces('orellana');
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(700);
    await b;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('solo envía la última petición pendiente (sin ráfagas)', async () => {
    const first = searchPlaces('kennedy');
    await vi.advanceTimersByTimeAsync(10);
    await first; // consume el primer hueco
    const a = searchPlaces('uno uno');
    const b = searchPlaces('dos dos');
    const c = searchPlaces('tres tres');
    await vi.advanceTimersByTimeAsync(1200);
    expect(await a).toBeNull();
    expect(await b).toBeNull();
    expect((await c)?.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('tres+tres'.replace('+', '%20'));
  });

  it('la búsqueda inversa y la directa comparten el mismo ritmo', async () => {
    const rev = reverseGeocode([-2.17, -79.9]);
    await vi.advanceTimersByTimeAsync(10);
    await rev;
    const s = searchPlaces('kennedy');
    await vi.advanceTimersByTimeAsync(600);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(600);
    await s;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('una petición abortada resuelve null y no cuenta como fallo', async () => {
    const ctrl = new AbortController();
    const p = searchPlaces('kennedy', { signal: ctrl.signal });
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(10);
    expect(await p).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    // sigue funcionando
    const q = searchPlaces('orellana');
    await vi.advanceTimersByTimeAsync(1200);
    expect((await q)?.length).toBe(1);
  });

  it('falla de red o HTTP: resuelve null, no cachea, y tras 2 fallos pausa 60 s', async () => {
    fetchMock.mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) } as Response);
    const a = searchPlaces('kennedy');
    await vi.advanceTimersByTimeAsync(10);
    expect(await a).toBeNull();
    const b = searchPlaces('orellana');
    await vi.advanceTimersByTimeAsync(1200);
    expect(await b).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // En pausa: ni siquiera se intenta.
    expect(await searchPlaces('malecon')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Pasada la pausa vuelve a funcionar (y lo fallido no quedó en caché).
    await vi.advanceTimersByTimeAsync(61_000);
    const c = searchPlaces('kennedy');
    await vi.advanceTimersByTimeAsync(1200);
    expect((await c)?.length).toBe(1);
  });

  it('timeout de 4 s: aborta la petición y resuelve null', async () => {
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(new Error('abort')));
        }),
    );
    const p = searchPlaces('kennedy');
    await vi.advanceTimersByTimeAsync(3900);
    let settled = false;
    void p.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(await p).toBeNull();
  });

  it('sin conexión no hace peticiones', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(await searchPlaces('kennedy')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignora filas sin coordenadas válidas', async () => {
    fetchMock.mockResolvedValueOnce(okResponse([row('Sin coords', { lat: 'x' }), row('Policentro')]));
    const p = searchPlaces('policentro');
    await vi.advanceTimersByTimeAsync(10);
    expect((await p)?.map((x) => x.title)).toEqual(['Policentro']);
  });
});
