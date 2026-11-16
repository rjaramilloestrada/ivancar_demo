import { describe, expect, it } from 'vitest';
import { relativeDate } from '../relativeDate';

const now = new Date(2026, 10, 16, 15, 30); // 16 nov 2026, 15:30 (hora local)

describe('relativeDate', () => {
  it('minutos y horas del mismo día', () => {
    expect(relativeDate(new Date(2026, 10, 16, 15, 29, 40), now)).toBe('Hace un momento');
    expect(relativeDate(new Date(2026, 10, 16, 15, 18), now)).toBe('Hace 12 min');
    expect(relativeDate(new Date(2026, 10, 16, 9, 5), now)).toBe('Hoy · 09:05');
  });
  it('ayer y días recientes', () => {
    expect(relativeDate(new Date(2026, 10, 15, 23, 50), now)).toBe('Ayer · 23:50');
    expect(relativeDate(new Date(2026, 10, 13, 18, 40), now)).toBe('Hace 3 días · 18:40');
  });
  it('fechas más antiguas con mes corto y año si cambia', () => {
    expect(relativeDate(new Date(2026, 9, 31, 16, 15), now)).toMatch(/^31 oct · 16:15$/);
    expect(relativeDate(new Date(2025, 11, 2, 8, 0), now)).toMatch(/2025/);
  });
});
