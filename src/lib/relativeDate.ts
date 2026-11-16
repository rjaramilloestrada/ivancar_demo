/**
 * Fecha relativa corta en español de Ecuador para listas (Mis viajes):
 *   "Hace un momento", "Hace 12 min", "Hoy · 14:20", "Ayer · 18:40",
 *   "Hace 3 días · 21:05", "31 oct · 16:15" (y el año si no es el actual).
 * Usa la hora local del dispositivo.
 */
export function relativeDate(input: string | number | Date, now: number | Date = Date.now()): string {
  const d = new Date(input);
  const n = new Date(now);
  const time = d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
  const diffMs = n.getTime() - d.getTime();
  if (diffMs >= 0 && diffMs < 60_000) return 'Hace un momento';
  if (diffMs >= 0 && diffMs < 60 * 60_000) return `Hace ${Math.floor(diffMs / 60_000)} min`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(n) - startOf(d)) / 86_400_000);
  if (days === 0) return `Hoy · ${time}`;
  if (days === 1) return `Ayer · ${time}`;
  if (days > 1 && days < 7) return `Hace ${days} días · ${time}`;
  const date = d
    .toLocaleDateString('es-EC', { day: 'numeric', month: 'short', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) })
    .replace(/\./g, '');
  return `${date} · ${time}`;
}
