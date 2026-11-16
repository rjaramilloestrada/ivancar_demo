import { useState } from 'react';
import { EnterHighlight } from '@/components/fx/EnterHighlight';
import { PulseAlert } from '@/components/fx/PulseAlert';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { IconAlert, IconPhone } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/geo';
import { formatUSD } from '@/lib/pricing';
import { fleetById } from '@/mocks/drivers';
import { getService } from '@/mocks/services';
import { approachProgress, legProgress, orderCode, useDispatch, type DispatchAlert, type DispatchMode, type DispatchOrder } from '@/store/dispatchStore';
import { PAYMENT_LABEL } from '../passenger/parts';
import { central } from './commands';
import { clock, hhmm, STATUS_META } from './status';
import { useCentralUi } from './uiStore';

/** Un pedido real recién llegado brilla estos ms. */
export const FRESH_MS = 9_000;

export interface OrderCardProps {
  order: DispatchOrder;
  now: number;
  mode: DispatchMode;
  selected: boolean;
  alert?: DispatchAlert;
  onSelect: () => void;
}

/**
 * Tarjeta de pedido de la cola: código, origen (app o simulado), hora y cronómetro,
 * recogida → destino, servicio y pago, estado con color y la unidad. En alerta pulsa en
 * amarillo (PulseAlert, solo opacidad) y ofrece la acción directa. Entra con EnterHighlight
 * (los pedidos reales de la app, con brillo) y se reordena con `layout="position"`.
 */
export function OrderCard({ order: o, now, mode, selected, alert, onSelect }: OrderCardProps) {
  const openPicker = useCentralUi((s) => s.openPicker);
  const pickerOpen = useCentralUi((s) => s.picker?.orderId === o.id);
  const meta = STATUS_META[o.status];
  const code = orderCode(o.id);
  const fresh = o.source === 'app' && now - o.received_at < FRESH_MS;
  const unit = o.unit_id ? fleetById[o.unit_id] : null;
  const service = getService(o.ride.service_id);
  const waiting = o.status === 'requested';
  const waitMs = waiting ? now - o.received_at : o.assigned_at ? o.assigned_at - o.received_at : null;

  // El pedido real del pasajero (App) entra con brillo; se decide al montar, para que no
  // vuelva a destellar al pasar a la zona de alertas o al cambiar de filtro.
  const [highlight] = useState(fresh);

  return (
    <li className="list-none">
      <EnterHighlight highlight={highlight} radius={16} holdMs={2200}>
        <PulseAlert active={!!alert} radius={16}>
          <div
            data-order-card
            data-order-id={o.id}
            data-status={o.status}
            data-source={o.source}
            data-alert={alert ? 'true' : 'false'}
            data-fresh={fresh ? 'true' : 'false'}
            data-testid="order-card"
            className={cn(
              'relative rounded-2xl border bg-surface transition-[border-color,background-color,box-shadow] duration-300',
              selected ? 'border-fg-55 bg-surface-raised' : 'border-line hover:border-line-strong',
              (o.status === 'completed' || o.status === 'cancelled') && !selected && 'opacity-75',
            )}
          >
            {/* Toda la tarjeta selecciona; los botones de acción van por encima. */}
            <button
              type="button"
              data-order-button
              aria-pressed={selected}
              aria-label={`Pedido ${code}, ${meta.label.toLowerCase()}, de ${o.ride.pickup_label} a ${o.ride.dropoff_label}${alert ? ', con alerta' : ''}`}
              onClick={onSelect}
              className="absolute inset-0 rounded-2xl focus-visible:outline-offset-2"
            />
            <span aria-hidden className="absolute inset-y-3 left-0 w-[3px] rounded-r-full" style={{ background: meta.color }} />

            <div className="pointer-events-none relative px-4 pb-3 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-black tracking-[0.04em] tabular-nums">#{code}</span>
                {o.source === 'app' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ivancar-yellow px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-on-yellow">
                    <IconPhone size={11} />
                    {fresh ? 'Nuevo · App' : 'App'}
                  </span>
                ) : (
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-fg-55">Simulado</span>
                )}
                <span className="ml-auto flex items-center gap-2 text-[12px] tabular-nums text-fg-65">
                  <span>{hhmm(o.received_at)}</span>
                  {waitMs != null && (
                    <span
                      className={cn(
                        'rounded-md px-1.5 py-0.5 font-bold',
                        waiting ? (alert ? 'bg-ivancar-yellow text-on-yellow' : 'bg-white/10 text-fg') : 'text-fg-55',
                      )}
                      title={waiting ? 'Tiempo esperando unidad' : 'Tiempo hasta asignar'}
                      data-testid="order-wait"
                    >
                      {waiting ? '' : 'asig. '}
                      {clock(waitMs)}
                    </span>
                  )}
                </span>
              </div>

              <div className="mt-2 grid grid-cols-[10px_1fr] items-center gap-x-2 gap-y-1 text-[14px]">
                <span aria-hidden className="size-2 rounded-full border-2 border-ivancar-yellow" />
                <span className="truncate font-semibold">{o.ride.pickup_label}</span>
                <span aria-hidden className="size-2 rounded-[2px] bg-white" />
                <span className="truncate text-fg-80">{o.ride.dropoff_label}</span>
              </div>

              <div className="mt-2 flex items-center gap-2 text-[12px] text-fg-65">
                <ServiceIcon service={o.ride.service_id} size={26} />
                <span className="truncate">
                  {service.name} · {PAYMENT_LABEL[o.ride.payment_method]} · <span className="tabular-nums">{formatUSD(o.ride.fare_estimate_usd)}</span>
                </span>
              </div>

              <div className="mt-2.5 flex min-h-8 items-center gap-2 border-t border-line pt-2.5">
                <StatusPill status={o.status} />
                <UnitLine order={o} now={now} unitPlate={unit?.vehicle.plate} unitName={unit?.display_name} mode={mode} />
              </div>

              {alert && (
                <div className="pointer-events-auto mt-2.5 flex items-center gap-2 rounded-xl bg-ivancar-yellow/12 px-3 py-2">
                  <IconAlert size={16} className="shrink-0 text-ivancar-yellow" />
                  <p className="min-w-0 flex-1 text-[12.5px] font-semibold leading-snug text-fg">
                    {alert.kind === 'unassigned'
                      ? `Sin unidad hace ${clock(now - alert.problem_since)}`
                      : `${unit?.vehicle.plate ?? 'La unidad'} no avanza hace ${clock(now - alert.problem_since)}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => central.resolve(o.id)}
                    className="relative h-9 shrink-0 rounded-full bg-ivancar-yellow px-3.5 text-[13px] font-extrabold text-on-yellow transition-colors hover:bg-ivancar-yellow-soft"
                    data-testid="alert-action"
                  >
                    {alert.kind === 'unassigned' ? 'Asignar ya' : 'Reasignar ya'}
                  </button>
                </div>
              )}

              {!alert && o.status === 'requested' && mode === 'manual' && !(selected && pickerOpen) && (
                <button
                  type="button"
                  onClick={() => {
                    useDispatch.getState().selectOrder(o.id);
                    openPicker(o.id, 'assign');
                  }}
                  className="pointer-events-auto relative mt-2.5 h-9 w-full rounded-full border border-ivancar-yellow/70 text-[13px] font-bold text-ivancar-yellow transition-colors hover:bg-ivancar-yellow/10"
                  data-testid="card-assign"
                >
                  Elegir unidad
                </button>
              )}
            </div>
          </div>
        </PulseAlert>
      </EnterHighlight>
    </li>
  );
}

export function StatusPill({ status, className }: { status: DispatchOrder['status']; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-bold uppercase leading-none tracking-[0.06em]',
        className,
      )}
      style={{ color: meta.color, background: `${meta.color}1F` }}
      data-testid="order-status"
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

function UnitLine({
  order: o,
  now,
  unitPlate,
  unitName,
  mode,
}: {
  order: DispatchOrder;
  now: number;
  unitPlate?: string;
  unitName?: string;
  mode: DispatchMode;
}) {
  if (o.status === 'requested') {
    if (mode === 'auto' && o.auto_at) {
      const total = Math.max(1, o.auto_at - o.received_at);
      const p = Math.min(1, Math.max(0, (now - o.received_at) / total));
      return (
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-fg-75">
          <span className="truncate">Buscando la unidad más cercana</span>
          <span aria-hidden className="ml-auto h-1 w-14 shrink-0 overflow-hidden rounded-full bg-white/10">
            <span className="block h-full rounded-full bg-ivancar-yellow transition-[width] duration-1000 ease-linear" style={{ width: `${p * 100}%` }} />
          </span>
        </span>
      );
    }
    return <span className="truncate text-[12px] text-fg-65">{mode === 'manual' ? 'Esperando al operador' : 'Sin unidades libres'}</span>;
  }
  if (o.status === 'cancelled') {
    return <span className="truncate text-[12px] text-fg-55">{o.cancelled_by === 'central' ? 'Por la central' : 'Por el pasajero'}</span>;
  }
  let detail = '';
  if ((o.status === 'assigned' || o.status === 'en_route') && o.approach) {
    const left = o.approach.duration_s * (1 - approachProgress(o, now));
    detail = o.stalled_at ? 'detenida' : left > 15 ? `llega en ${formatMinutes(left / 60)}` : 'llegando';
  } else if (o.status === 'arrived') detail = 'esperando al pasajero';
  else if (o.status === 'in_trip' && o.trip) {
    const left = o.trip.duration_s * (1 - legProgress(o.trip, now));
    detail = left > 15 ? `destino en ${formatMinutes(left / 60)}` : 'llegando a destino';
  } else if (o.status === 'completed') detail = hhmm(o.status_at);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
      {unitPlate && (
        <span className="shrink-0 rounded bg-white px-1.5 py-px text-[11px] font-black tracking-[0.04em] text-black" data-testid="order-plate">
          {unitPlate}
        </span>
      )}
      <span className="truncate text-fg-75">
        {unitName}
        {detail && <span className="text-fg-55"> · {detail}</span>}
      </span>
    </span>
  );
}
