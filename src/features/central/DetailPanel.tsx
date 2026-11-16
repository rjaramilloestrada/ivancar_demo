import { useEffect, useMemo, useRef } from 'react';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { IconAlert, IconClose, IconStar } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDistance, formatMinutes } from '@/lib/geo';
import { DEMO_FARE_NOTICE, formatUSD } from '@/lib/pricing';
import { simTimings } from '@/lib/simConfig';
import { fleetById } from '@/mocks/drivers';
import { getService } from '@/mocks/services';
import {
  approachProgress,
  computeAlerts,
  isActive,
  legProgress,
  orderCode,
  rankUnits,
  REASSIGNABLE,
  unitViews,
  useDispatch,
  type DispatchOrder,
  type UnitState,
} from '@/store/dispatchStore';
import type { FleetUnit } from '@/types';
import { useNow } from '../passenger/hooks';
import { Avatar, PAYMENT_LABEL, RouteSummary } from '../passenger/parts';
import { central } from './commands';
import { StatusPill } from './OrderCard';
import { clock, STATUS_META, VIA_LABEL } from './status';
import { useCentralUi } from './uiStore';

/** Panel de detalle sobre el mapa: pedido elegido (con selector de unidad) o unidad elegida. */
export function DetailPanel({ className }: { className?: string }) {
  const selectedOrderId = useDispatch((s) => s.selectedOrderId);
  const selectedUnitId = useDispatch((s) => s.selectedUnitId);
  const order = useDispatch((s) => s.orders.find((o) => o.id === s.selectedOrderId) ?? null);
  if (selectedOrderId && order) return <OrderDetail order={order} className={className} />;
  if (selectedUnitId) return <UnitDetail unitId={selectedUnitId} className={className} />;
  return null;
}

const panelClass =
  'pointer-events-auto flex max-h-full flex-col overflow-hidden rounded-[22px] border border-line-strong bg-surface shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)]';

function PanelHeader({ title, children, onClose }: { title: string; children?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 pb-3.5 pt-4">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[20px] font-black tracking-[0.02em] tabular-nums">{title}</h2>
        {children && <div className="mt-1.5 flex flex-wrap items-center gap-2">{children}</div>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar detalle"
        className="-mr-1.5 grid size-10 shrink-0 place-items-center rounded-full text-fg-75 transition-colors hover:bg-white/10 hover:text-fg"
        data-testid="detail-close"
      >
        <IconClose size={20} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Pedido */

function OrderDetail({ order: o, className }: { order: DispatchOrder; className?: string }) {
  const orders = useDispatch((s) => s.orders);
  const mode = useDispatch((s) => s.mode);
  const selectOrder = useDispatch((s) => s.selectOrder);
  const picker = useCentralUi((s) => s.picker);
  const openPicker = useCentralUi((s) => s.openPicker);
  const closePicker = useCentralUi((s) => s.closePicker);
  const now = useNow(1000);
  const alert = useMemo(() => computeAlerts(orders, now, simTimings()).find((a) => a.order_id === o.id), [orders, now, o.id]);
  const unit = o.unit_id ? fleetById[o.unit_id] : null;
  const service = getService(o.ride.service_id);
  const pickerOpen = picker?.orderId === o.id && (o.status === 'requested' || REASSIGNABLE.includes(o.status));
  const code = orderCode(o.id);

  // Cerrar el selector si el pedido ya no lo admite (p. ej. llegó la unidad).
  useEffect(() => {
    if (picker?.orderId === o.id && !pickerOpen) closePicker();
  }, [picker, pickerOpen, o.id, closePicker]);

  let eta: string | null = null;
  let progress: number | null = null;
  if ((o.status === 'assigned' || o.status === 'en_route') && o.approach) {
    progress = approachProgress(o, now);
    const left = o.approach.duration_s * (1 - progress);
    eta = o.stalled_at ? 'Unidad detenida' : left > 15 ? `Llega en ${formatMinutes(left / 60)}` : 'Llegando';
  } else if (o.status === 'in_trip' && o.trip) {
    progress = legProgress(o.trip, now);
    const left = o.trip.duration_s * (1 - progress);
    eta = left > 15 ? `Destino en ${formatMinutes(left / 60)}` : 'Llegando a destino';
  } else if (o.status === 'arrived') eta = 'Esperando al pasajero';

  return (
    <section aria-label={`Detalle del pedido ${code}`} className={cn(panelClass, className)} data-testid="order-detail" data-order-id={o.id}>
      <PanelHeader title={`Pedido #${code}`} onClose={() => selectOrder(null)}>
        <StatusPill status={o.status} />
        <span className="text-[12px] text-fg-55">{o.source === 'app' ? 'Desde la app del pasajero' : 'Pedido simulado'}</span>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
        {alert && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-ivancar-yellow/70 bg-ivancar-yellow/10 p-3">
            <IconAlert size={20} className="shrink-0 text-ivancar-yellow" />
            <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">
              {alert.kind === 'unassigned' ? `Lleva ${clock(now - alert.problem_since)} sin unidad.` : `La unidad no avanza hace ${clock(now - alert.problem_since)}.`}
            </p>
            <button
              type="button"
              onClick={() => central.resolve(o.id)}
              className="h-9 shrink-0 rounded-full bg-ivancar-yellow px-4 text-[13px] font-extrabold text-on-yellow hover:bg-ivancar-yellow-soft"
              data-testid="detail-alert-action"
            >
              {alert.kind === 'unassigned' ? 'Asignar ya' : 'Reasignar ya'}
            </button>
          </div>
        )}

        <RouteSummary from={o.ride.pickup_label} to={o.ride.dropoff_label} />

        <dl className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
          <Meta label="Servicio">
            <span className="flex items-center gap-1.5">
              <ServiceIcon service={o.ride.service_id} size={24} />
              <span className="truncate">{service.name}</span>
            </span>
          </Meta>
          <Meta label="Pago">{PAYMENT_LABEL[o.ride.payment_method]}</Meta>
          <Meta label="Tarifa" note={DEMO_FARE_NOTICE}>
            <span className="tabular-nums">{formatUSD(o.ride.fare_estimate_usd)}</span> · {formatDistance(o.ride.distance_m)}
          </Meta>
          <Meta
            label="Recibido"
            note={o.status === 'requested' ? `Esperando ${clock(now - o.received_at)}` : o.assigned_at ? `Asignado en ${clock(o.assigned_at - o.received_at)}` : undefined}
          >
            <span className="tabular-nums">{new Date(o.received_at).toLocaleTimeString('es-EC', { hour12: false })}</span>
          </Meta>
        </dl>
        {o.ride.note && <p className="mt-2 rounded-xl bg-white/5 px-3 py-2 text-[13px] text-fg-80">Nota: “{o.ride.note}”</p>}

        {unit && isActive(o) && o.status !== 'requested' && (
          <div className="mt-4 rounded-2xl border border-line bg-surface-raised p-3.5" data-testid="detail-unit">
            <div className="flex items-center gap-3">
              <Avatar unit={unit} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold">{unit.display_name}</p>
                <p className="truncate text-[12px] text-fg-65">
                  {unit.vehicle.make} {unit.vehicle.model} · {unit.vehicle.color}
                </p>
              </div>
              <span className="rounded-md bg-white px-2 py-1 text-[13px] font-black tracking-[0.05em] text-black" data-testid="detail-plate">
                {unit.vehicle.plate}
              </span>
            </div>
            {eta && (
              <div className="mt-3">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className={cn('font-bold', o.stalled_at ? 'text-ivancar-yellow' : 'text-fg')}>{eta}</span>
                  {o.assigned_via && <span className="text-[11.5px] text-fg-55">{VIA_LABEL[o.assigned_via]}</span>}
                </div>
                {progress != null && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-[width] duration-1000 ease-linear"
                      style={{ width: `${progress * 100}%`, background: STATUS_META[o.status].color }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {!pickerOpen && o.status === 'requested' && (
          <button
            type="button"
            onClick={() => openPicker(o.id, 'assign')}
            className="mt-4 h-12 w-full rounded-full bg-ivancar-yellow text-[15px] font-extrabold text-on-yellow transition-colors hover:bg-ivancar-yellow-soft"
            data-testid="open-assign"
          >
            {mode === 'auto' ? 'Elegir unidad ahora' : 'Asignar unidad'}
          </button>
        )}
        {!pickerOpen && REASSIGNABLE.includes(o.status) && (
          <button
            type="button"
            onClick={() => openPicker(o.id, 'reassign')}
            className="mt-3 h-11 w-full rounded-full border border-line-strong text-[14px] font-bold text-fg transition-colors hover:border-fg-55"
            data-testid="open-reassign"
          >
            Reasignar unidad
          </button>
        )}

        {pickerOpen && picker && <UnitPicker order={o} kind={picker.kind} now={now} onClose={closePicker} />}

        <h3 className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-fg-55">Historial del pedido</h3>
        <ol className="mt-2 flex flex-col gap-1.5 text-[13px]" data-testid="order-timeline">
          {o.timeline.map((t, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: t.status === 'reassigned' ? '#fff' : STATUS_META[t.status].color }} />
              <span className="flex-1 text-fg-80">
                {t.status === 'reassigned' ? `Reasignado a ${t.note ?? 'otra unidad'}` : STATUS_META[t.status].label}
                {t.status === 'cancelled' && t.note ? ` por ${t.note === 'central' ? 'la central' : 'el pasajero'}` : ''}
              </span>
              <span className="tabular-nums text-fg-55">{new Date(t.at).toLocaleTimeString('es-EC', { hour12: false })}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Meta({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[0.04] px-3 py-2">
      <dt className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-55">{label}</dt>
      <dd className="mt-0.5 truncate font-semibold">{children}</dd>
      {note && <dd className="text-[10.5px] leading-tight text-fg-55">{note}</dd>}
    </div>
  );
}

/* ------------------------------------------------------- Selector de unidad */

function UnitPicker({ order: o, kind, now, onClose }: { order: DispatchOrder; kind: 'assign' | 'reassign'; now: number; onClose: () => void }) {
  const orders = useDispatch((s) => s.orders);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // La lista se recalcula cada pocos segundos (las unidades se mueven), no en cada render.
  const bucket = Math.floor(now / 3000);
  const candidates = useMemo(
    () =>
      rankUnits(o, orders, Date.now(), o.unit_id ? [o.unit_id] : [])
        .sort((a, b) => a.eta_min - b.eta_min || Number(b.compatible) - Number(a.compatible) || a.distance_m - b.distance_m)
        .slice(0, 7),
    [o.id, o.unit_id, orders, bucket],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const choose = (u: FleetUnit) => {
    const ok = kind === 'assign' ? central.assign(o.id, u.id) : central.reassign(o.id, u.id);
    if (ok) onClose();
  };

  return (
    <div className="mt-4 rounded-2xl border border-ivancar-yellow/50 bg-surface-raised p-3" data-testid="unit-picker">
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 ref={headingRef} tabIndex={-1} className="text-[14px] font-extrabold outline-none">
          {kind === 'assign' ? 'Elige la unidad' : 'Cambiar la unidad'}
        </h3>
        <button type="button" onClick={onClose} className="h-8 rounded-full px-3 text-[13px] font-semibold text-fg-75 hover:bg-white/10 hover:text-fg">
          Cancelar
        </button>
      </div>
      <p className="px-1 pb-2 text-[12px] text-fg-55">Libres, de la que llega antes a la que llega después.</p>
      {candidates.length === 0 && <p className="px-1 py-3 text-[13px] text-fg-75">No hay unidades libres en este momento.</p>}
      <ul className="flex flex-col gap-1.5">
        {candidates.map((c) => (
          <li key={c.unit.id} className={cn('flex items-center gap-2.5 rounded-xl border border-line py-2 pl-3 pr-2', !c.compatible && 'opacity-75')}>
            <div className="min-w-0 flex-1 text-[13px] leading-tight">
              <p className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 whitespace-nowrap rounded bg-white px-1.5 py-px text-[11.5px] font-black tracking-[0.04em] text-black">{c.unit.vehicle.plate}</span>
                {!c.compatible && <span className="truncate text-[11.5px] text-fg-55">{getService(c.unit.vehicle.service_id).name} · otro tipo</span>}
              </p>
              <p className="mt-1 truncate text-[12.5px]">
                <span className="font-semibold text-fg-80">{c.unit.display_name}</span>
                <span className="text-fg-55"> · {formatDistance(c.distance_m)}</span>
              </p>
            </div>
            <span className="shrink-0 text-right leading-tight">
              <span className="block text-[14px] font-black tabular-nums">{c.eta_min} min</span>
              <span className="block text-[10.5px] text-fg-55">llegada</span>
            </span>
            <button
              type="button"
              onClick={() => choose(c.unit)}
              aria-label={`${kind === 'assign' ? 'Asignar' : 'Reasignar a'} ${c.unit.vehicle.plate}, ${c.unit.display_name}, a ${c.eta_min} minutos`}
              className="h-9 shrink-0 rounded-full bg-ivancar-yellow px-3.5 text-[13px] font-extrabold text-on-yellow transition-colors hover:bg-ivancar-yellow-soft"
              data-testid={`pick-${c.unit.id}`}
            >
              Asignar
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ Unidad */

const UNIT_STATE: Record<UnitState, { label: string; color: string }> = {
  available: { label: 'Disponible', color: '#F6C90E' },
  busy: { label: 'Ocupada', color: '#9A9A9A' },
  assigned: { label: 'En pedido', color: '#8CC8FF' },
};

function UnitDetail({ unitId, className }: { unitId: string; className?: string }) {
  const orders = useDispatch((s) => s.orders);
  const selectUnit = useDispatch((s) => s.selectUnit);
  const selectOrder = useDispatch((s) => s.selectOrder);
  const view = useMemo(() => unitViews(orders).find((v) => v.unit.id === unitId), [orders, unitId]);
  if (!view) return null;
  const u = view.unit;
  const v = u.vehicle;
  const st = UNIT_STATE[view.state];
  return (
    <section aria-label={`Unidad ${v.plate}`} className={cn(panelClass, className)} data-testid="unit-detail">
      <PanelHeader title={v.plate} onClose={() => selectUnit(null)}>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: st.color, background: `${st.color}1F` }}>
          <span aria-hidden className="size-1.5 rounded-full" style={{ background: st.color }} />
          {st.label}
        </span>
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
        <div className="flex items-center gap-3">
          <Avatar unit={u} size={52} />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-bold">{u.full_name}</p>
            <p className="flex items-center gap-1 text-[13px] text-fg-75">
              <IconStar size={14} filled className="text-ivancar-yellow" />
              <span className="font-semibold text-fg">{u.rating.toLocaleString('es-EC', { minimumFractionDigits: 1 })}</span>· {u.trips_count.toLocaleString('es-EC')} viajes
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
          <Meta label="Vehículo">
            {v.make} {v.model}
          </Meta>
          <Meta label="Color · año">
            {v.color} · {v.year}
          </Meta>
          <Meta label="Tipo">{getService(v.service_id).name}</Meta>
          <Meta label="Estado">{view.state === 'busy' ? 'En carrera (fuera de la central)' : st.label}</Meta>
        </dl>
        {view.order && (
          <button
            type="button"
            onClick={() => selectOrder(view.order!.id)}
            className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-line-strong px-4 py-3 text-left text-[14px] transition-colors hover:border-fg-55"
          >
            <span className="min-w-0">
              <span className="block font-bold">Pedido #{orderCode(view.order.id)}</span>
              <span className="block truncate text-[12px] text-fg-65">
                {view.order.ride.pickup_label} → {view.order.ride.dropoff_label}
              </span>
            </span>
            <StatusPill status={view.order.status} />
          </button>
        )}
        <p className="mt-4 text-[12px] text-fg-55">Conductor y unidad de demostración.</p>
      </div>
    </section>
  );
}
