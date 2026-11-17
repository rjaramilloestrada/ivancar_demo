import { afterEach, describe, expect, it, vi } from 'vitest';
import { relativeDate } from '@/lib/relativeDate';
import { haversine } from '@/lib/geo';
import { toLatLng } from '@/types';
import { ago, tripHistory } from '../history';
import { placesById } from '../places';

afterEach(() => vi.useRealTimers());

describe('fechas del historial relativas a hoy', () => {
  it('ago() usa la hora de Guayaquil (UTC-5)', () => {
    // 17 nov 2026, 03:00 UTC = 16 nov 22:00 en Guayaquil.
    const now = Date.UTC(2026, 10, 17, 3, 0);
    expect(ago(0, '08:00', now)).toBe('2026-11-16T08:00:00-05:00');
    expect(ago(2, '18:40', now)).toBe('2026-11-14T18:40:00-05:00');
    expect(ago(16, '16:15', now)).toBe('2026-10-31T16:15:00-05:00');
  });

  it('cruza fin de mes y de año', () => {
    const now = Date.UTC(2027, 0, 3, 15, 0);
    expect(ago(5, '07:50', now)).toBe('2026-12-29T07:50:00-05:00');
  });

  it('el historial siempre queda en el pasado y ordenado del más reciente al más antiguo', () => {
    const times = tripHistory.map((t) => new Date(t.completed_at!).getTime());
    expect(times.every((t) => t < Date.now())).toBe(true);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('se lee como "Ayer", "Hace N días" y fecha corta, nunca como una fecha fija vieja', async () => {
    // Mediodía en Guayaquil: el día coincide en UTC y en la hora de Guayaquil.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-12-20T17:00:00Z'));
    vi.resetModules();
    const { tripHistory: fresh } = await import('../history');
    const labels = fresh.map((t) => relativeDate(t.completed_at!));
    expect(labels[0]).toMatch(/^Ayer · /);
    expect(labels[1]).toMatch(/^Hace 2 días · /);
    expect(labels[2]).toMatch(/^Hace [56] días · /); // 21:05 en Guayaquil cae al día siguiente en UTC
    expect(labels[3]).toMatch(/^\d{1,2} \w{3,4} · /);
  });

  it('creado y asignado van antes de completado', () => {
    for (const t of tripHistory) {
      expect(new Date(t.created_at).getTime()).toBeLessThan(new Date(t.assigned_at!).getTime());
      expect(new Date(t.assigned_at!).getTime()).toBeLessThan(new Date(t.completed_at!).getTime());
    }
  });
});

describe('rutas del historial terminan en su destino', () => {
  it('el último punto de cada ruta queda a menos de 300 m del destino', () => {
    for (const t of tripHistory) {
      const end = t.route![t.route!.length - 1];
      expect(haversine(end, [t.dropoff_lat, t.dropoff_lng])).toBeLessThan(300);
    }
  });

  it('el aeropuerto está en la terminal de pasajeros, no en Garzota', () => {
    const ap = toLatLng(placesById['plc-aeropuerto']);
    expect(haversine(ap, [-2.1574, -79.8836])).toBeLessThan(150);
  });
});
