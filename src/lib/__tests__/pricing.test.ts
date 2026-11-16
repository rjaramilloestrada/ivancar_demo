import { describe, expect, it } from 'vitest';
import { services, servicesById } from '@/mocks/services';
import { DEMO_FARE_CONFIG, DEMO_FARE_NOTICE, estimateFare, formatFare, formatUSD, roundUpTo } from '../pricing';

const taxi = servicesById.taxi;

describe('estimateFare (distancia)', () => {
  it('base + km × tarifa, redondeado hacia arriba a 0,25', () => {
    // 1,5 + 8 × 0,45 = 5,10 → 5,25
    const f = estimateFare(taxi, 8_000);
    expect(f.amount).toBe(5.25);
    expect(f.minimum_applied).toBe(false);
    expect(f.mode).toBe('distance');
    expect(f.currency).toBe('USD');
  });

  it('aplica el mínimo en carreras cortas', () => {
    const f = estimateFare(taxi, 500);
    expect(f.amount).toBe(DEMO_FARE_CONFIG.minimum);
    expect(f.minimum_applied).toBe(true);
  });

  it('el factor del servicio escala precio y mínimo', () => {
    const exe = servicesById.ejecutivo;
    expect(estimateFare(exe, 8_000).amount).toBe(roundUpTo((1.5 + 8 * 0.45) * exe.price_factor, 0.25));
    expect(estimateFare(exe, 100).amount).toBe(roundUpTo(DEMO_FARE_CONFIG.minimum * exe.price_factor, 0.25));
  });

  it('crece con la distancia y nunca es negativo', () => {
    let prev = 0;
    for (const km of [0, 1, 3, 5, 10, 20, 40]) {
      const a = estimateFare(taxi, km * 1000).amount;
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(estimateFare(taxi, -500).amount).toBe(DEMO_FARE_CONFIG.minimum);
    expect(estimateFare(taxi, NaN).amount).toBe(DEMO_FARE_CONFIG.minimum);
  });

  it('siempre es múltiplo de 0,25 y lleva la etiqueta de demo', () => {
    for (const s of services) {
      for (const m of [700, 2_345, 9_999, 18_250]) {
        const f = estimateFare(s, m);
        expect(Math.abs(f.amount * 4 - Math.round(f.amount * 4))).toBeLessThan(1e-9);
        expect(f.notice).toBe(DEMO_FARE_NOTICE);
      }
    }
    expect(DEMO_FARE_NOTICE).toBe('Tarifa referencial de demo');
  });

  it('orden relativo: taxi < encomiendas < ejecutivo < camioneta < SUV', () => {
    const at = (id: keyof typeof servicesById) => estimateFare(servicesById[id], 10_000).amount;
    expect(at('taxi')).toBeLessThan(at('encomiendas'));
    expect(at('encomiendas')).toBeLessThan(at('ejecutivo'));
    expect(at('ejecutivo')).toBeLessThan(at('camioneta'));
    expect(at('camioneta')).toBeLessThan(at('suv'));
  });
});

describe('estimateFare (por horas)', () => {
  const hourly = servicesById.por_horas;
  it('cotiza por hora con mínimo de horas e ignora la distancia', () => {
    const f = estimateFare(hourly, 50_000);
    expect(f.mode).toBe('hourly');
    expect(f.hours).toBe(hourly.min_hours);
    expect(f.amount).toBe(hourly.hourly_rate! * hourly.min_hours!);
    expect(f.minimum_applied).toBe(false);
  });
  it('redondea horas hacia arriba y respeta el mínimo', () => {
    expect(estimateFare(hourly, 0, { hours: 3.2 }).hours).toBe(4);
    const one = estimateFare(hourly, 0, { hours: 1 });
    expect(one.hours).toBe(2);
    expect(one.minimum_applied).toBe(true);
  });
});

describe('formato', () => {
  it('USD con coma decimal', () => {
    expect(formatUSD(4.75)).toBe('$4,75');
    expect(formatUSD(24)).toBe('$24,00');
  });
  it('formatFare', () => {
    expect(formatFare(estimateFare(taxi, 8_000))).toBe('$5,25');
    expect(formatFare(estimateFare(servicesById.por_horas, 0))).toBe('$24,00 · 2 h');
  });
  it('roundUpTo tolera coma flotante', () => {
    expect(roundUpTo(5.25, 0.25)).toBe(5.25);
    expect(roundUpTo(0.1 + 0.2, 0.1)).toBeCloseTo(0.3, 9);
  });
});
