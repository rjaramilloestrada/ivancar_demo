import { LayoutGroup } from 'motion/react';
import { useMemo, type KeyboardEvent } from 'react';
import { IconAlert, IconClock } from '@/components/ui';
import { cn } from '@/lib/cn';
import { simTimings } from '@/lib/simConfig';
import { computeAlerts, isActive, matchesFilter, useDispatch, type DispatchAlert, type DispatchOrder } from '@/store/dispatchStore';
import { useNow } from '../passenger/hooks';
import { OrderCard } from './OrderCard';
import { FILTERS } from './status';

/** Activos primero (los nuevos arriba), luego los terminados (más recientes primero). */
function sortOrders(list: DispatchOrder[]): DispatchOrder[] {
  return [...list].sort((a, b) => {
    const aa = isActive(a) ? 1 : 0;
    const bb = isActive(b) ? 1 : 0;
    if (aa !== bb) return bb - aa;
    return aa ? b.received_at - a.received_at : b.status_at - a.status_at;
  });
}

/** Flechas arriba/abajo recorren las tarjetas; Inicio/Fin van a la primera/última. */
function onListKey(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const all = [...document.querySelectorAll<HTMLButtonElement>('[data-order-button]')];
  if (!all.length) return;
  const i = all.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : e.key === 'ArrowDown' ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1);
  e.preventDefault();
  all[next]?.focus();
}

/**
 * Columna de operación: zona de alertas (pedidos que requieren acción, arriba) y la cola de
 * pedidos con filtros por estado. Teclado: Tab entra a la lista, flechas la recorren,
 * Enter/Espacio selecciona.
 */
export function OrdersColumn({ className }: { className?: string }) {
  const orders = useDispatch((s) => s.orders);
  const mode = useDispatch((s) => s.mode);
  const filter = useDispatch((s) => s.filter);
  const setFilter = useDispatch((s) => s.setFilter);
  const selectedOrderId = useDispatch((s) => s.selectedOrderId);
  const selectOrder = useDispatch((s) => s.selectOrder);
  const now = useNow(1000);

  const alerts = useMemo(() => computeAlerts(orders, now, simTimings()), [orders, now]);
  const alertById = useMemo(() => new Map<string, DispatchAlert>(alerts.map((a) => [a.order_id, a])), [alerts]);
  const alertOrders = alerts.map((a) => orders.find((o) => o.id === a.order_id)!).filter(Boolean);
  const list = useMemo(() => sortOrders(orders.filter((o) => !alertById.has(o.id) && matchesFilter(o, filter))), [orders, alertById, filter]);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map((f) => [f.id, orders.filter((o) => matchesFilter(o, f.id)).length])) as Record<string, number>,
    [orders],
  );

  const card = (o: DispatchOrder) => (
    <OrderCard
      key={o.id}
      order={o}
      now={now}
      mode={mode}
      alert={alertById.get(o.id)}
      selected={o.id === selectedOrderId}
      onSelect={() => selectOrder(o.id === selectedOrderId ? null : o.id)}
    />
  );

  return (
    <LayoutGroup>
      <div className={cn('flex min-h-0 flex-col', className)} onKeyDown={onListKey}>
        {alertOrders.length > 0 && (
            <section
              aria-labelledby="alerts-title"
              className="mb-3 max-h-[60%] shrink-0 overflow-y-auto rounded-[20px] border border-ivancar-yellow/40 bg-ivancar-yellow/[0.06] p-2.5"
              data-testid="alerts-zone"
            >
              <h2 id="alerts-title" className="flex items-center gap-2 px-1.5 pb-2 pt-0.5 text-[12px] font-extrabold uppercase tracking-[0.14em] text-ivancar-yellow">
                <IconAlert size={15} />
                Requiere atención
                <span className="ml-auto grid size-5 place-items-center rounded-full bg-ivancar-yellow text-[11px] text-on-yellow tabular-nums">{alertOrders.length}</span>
              </h2>
              <ul className="flex flex-col gap-2" aria-label="Pedidos con alerta">
                {alertOrders.map(card)}
              </ul>
            </section>
        )}

        <div className="flex shrink-0 items-center justify-between gap-3 pb-2.5">
          <h2 className="title-display text-[18px]">Pedidos</h2>
          <span className="flex items-center gap-1.5 text-[12px] text-fg-55">
            <IconClock size={14} />
            En vivo
          </span>
        </div>
        <div role="group" aria-label="Filtrar pedidos por estado" className="flex shrink-0 flex-wrap gap-1.5 pb-3">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12.5px] font-semibold transition-colors',
                filter === f.id ? 'border-ivancar-yellow bg-ivancar-yellow text-on-yellow' : 'border-line-strong text-fg-75 hover:border-fg-55',
              )}
              data-testid={`filter-${f.id}`}
            >
              {f.label}
              <span className={cn('tabular-nums', filter === f.id ? 'text-on-yellow/70' : 'text-fg-55')}>{counts[f.id]}</span>
            </button>
          ))}
        </div>

        <ul className="-mr-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-4 pr-2" aria-label="Cola de pedidos" data-testid="orders-list">
          {list.map(card)}
          {list.length === 0 && (
            <li className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-[14px] text-fg-65">
              {filter === 'all' ? 'Sin pedidos por ahora. Los que entren desde la app aparecerán aquí.' : 'No hay pedidos con este estado.'}
            </li>
          )}
        </ul>
      </div>
    </LayoutGroup>
  );
}
