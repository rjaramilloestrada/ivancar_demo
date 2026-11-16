import type { RideStatus } from '@/types';
import type { AssignedVia, DispatchMode, OrderFilter } from '@/store/dispatchStore';

/**
 * Estados del pedido en la central: etiqueta y color. Colores sobre fondo oscuro con
 * contraste AA para texto pequeño (≥ 4.5:1 sobre #0C0C0C).
 */
export const STATUS_META: Record<RideStatus, { label: string; color: string }> = {
  requested: { label: 'Sin asignar', color: '#FFB547' },
  assigned: { label: 'Asignado', color: '#8CC8FF' },
  en_route: { label: 'En camino', color: '#F6C90E' },
  arrived: { label: 'Llegó', color: '#C3A6FF' },
  in_trip: { label: 'En viaje', color: '#3DDC84' },
  completed: { label: 'Finalizado', color: '#9A9A9A' },
  cancelled: { label: 'Cancelado', color: '#FF7A70' },
};

export const FILTERS: { id: OrderFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'unassigned', label: 'Sin asignar' },
  { id: 'active', label: 'En curso' },
  { id: 'closed', label: 'Cerrados' },
];

export const VIA_LABEL: Record<AssignedVia, string> = {
  auto: 'Asignación automática',
  manual: 'Asignado por el operador',
  app: 'Autoasignado por la app',
};

export const MODE_LABEL: Record<DispatchMode, string> = { auto: 'Automático', manual: 'Manual' };

/** 75 000 ms → "1:15". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Hora local "21:14". */
export function hhmm(t: number): string {
  return new Date(t).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Duración corta para indicadores: "2,4 s", "1 min 05 s". */
export function shortDuration(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toLocaleString('es-EC', { maximumFractionDigits: 1, minimumFractionDigits: s < 10 ? 1 : 0 })} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${String(Math.round(s % 60)).padStart(2, '0')} s`;
}
