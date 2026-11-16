import { useMemo } from 'react';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { Button, IconCalendar, IconCash, IconCard, IconChevronRight, IconInfo, IconMinus, IconNote, IconPlus, IconTicket, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { estimatePickupMinutes, pickUnit } from '@/lib/dispatch';
import { formatDistance, formatDuration } from '@/lib/geo';
import { DEMO_FARE_NOTICE, estimateFare, formatUSD } from '@/lib/pricing';
import { services } from '@/mocks/services';
import { currentFare, HOURS_MAX, HOURS_MIN, useRide } from '@/store/rideStore';
import type { PaymentMethod } from '@/types';
import { InlineNote, PAYMENT_LABEL, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';

const PAY_ICON: Record<PaymentMethod, typeof IconCash> = { cash: IconCash, card: IconCard, voucher: IconTicket };

/** "Ahora" o "Mañana 07:30". */
export function scheduleLabel(iso: string | null): string {
  if (!iso) return 'Ahora';
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const time = d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === today.toDateString()) return `Hoy ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Mañana ${time}`;
  return `${d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

/** P3 · Tipo de servicio, con pago y opciones como fila editable junto a la confirmación. */
export function ServiceSheet() {
  const s = useRide();
  const { pickup, destination, route, serviceId, hours, options } = s;

  const etas = useMemo(() => {
    if (!pickup) return {} as Record<string, number>;
    const ll: [number, number] = [pickup.lat, pickup.lng];
    return Object.fromEntries(services.map((sv) => [sv.id, estimatePickupMinutes(pickUnit(sv.id, ll), ll)]));
  }, [pickup]);

  const selected = services.find((x) => x.id === serviceId)!;
  const fare = route ? currentFare(s) : null;
  const PayIcon = PAY_ICON[options.payment];
  const scheduled = !!options.scheduledFor;

  return (
    <SheetContent
      stepKey="service"
      header={
        <div>
          <SheetTitle
            title="Elige tu servicio"
            onBack={s.back}
            subtitle={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-semibold text-fg-80">{destination?.label}</span>
                {route ? (
                  <span className="tabular-nums" data-testid="route-summary" data-route-source={route.source}>
                    · {formatDistance(route.distance_m)} · {formatDuration(route.duration_s)}
                  </span>
                ) : (
                  <Skeleton className="h-3.5 w-24" />
                )}
              </span>
            }
          />
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-semibold text-fg-75" data-testid="fare-notice">
            <IconInfo size={13} className="text-ivancar-yellow" />
            {DEMO_FARE_NOTICE}
          </p>
        </div>
      }
      footer={
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={s.openOptions}
            className="flex min-h-11 w-full items-center gap-2.5 rounded-full px-1 text-left text-[14px] text-fg-80 transition-colors hover:text-fg"
            aria-label={`Pago y opciones: ${PAYMENT_LABEL[options.payment]}, ${scheduleLabel(options.scheduledFor)}${options.note ? ', con nota' : ''}. Cambiar`}
            data-testid="options-row"
          >
            <PayIcon size={18} className="shrink-0 text-ivancar-yellow" />
            <span className="font-semibold">{PAYMENT_LABEL[options.payment]}</span>
            <span aria-hidden className="text-fg-55">·</span>
            <span className={cn('inline-flex items-center gap-1', scheduled && 'font-semibold text-ivancar-yellow')}>
              {scheduled && <IconCalendar size={14} />}
              {scheduleLabel(options.scheduledFor)}
            </span>
            {options.note && (
              <>
                <span aria-hidden className="text-fg-55">·</span>
                <IconNote size={15} className="shrink-0" />
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-ivancar-yellow">
              Cambiar
              <IconChevronRight size={16} />
            </span>
          </button>
          <Button
            fullWidth
            size="lg"
            state={route ? 'idle' : 'loading'}
            loadingLabel="Calculando ruta"
            onClick={() => s.requestRide()}
            data-testid="cta-request"
            trailingIcon={
              fare ? (
                <span className="ml-1 rounded-full bg-black/10 px-2.5 py-0.5 text-[15px] tabular-nums">{formatUSD(fare.amount)}</span>
              ) : undefined
            }
          >
            {scheduled ? 'Programar' : 'Pedir'} {selected.name}
          </Button>
        </div>
      }
    >
      {route?.source === 'fallback' && (
        <InlineNote icon={<IconInfo size={15} />} className="mb-3">
          Ruta aproximada: el tiempo y la tarifa pueden variar un poco.
        </InlineNote>
      )}

      <fieldset className="min-w-0 pb-4">
        <legend className="sr-only">Tipo de servicio</legend>
        <div className="flex flex-col gap-2">
          {services.map((sv) => {
            const active = sv.id === serviceId;
            const f = route ? estimateFare(sv, route.distance_m, { hours }) : null;
            return (
              <div key={sv.id}>
                <label
                  className={cn(
                    'relative flex min-h-[72px] cursor-pointer items-center gap-3 rounded-[20px] border p-3 pr-4 transition-[border-color,background-color,box-shadow] duration-200',
                    'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ivancar-yellow',
                    active ? 'border-ivancar-yellow bg-ivancar-yellow/[0.07] shadow-glow' : 'border-line hover:border-line-strong',
                  )}
                  data-testid={`service-${sv.id}`}
                  data-selected={active || undefined}
                >
                  <input
                    type="radio"
                    name="service"
                    value={sv.id}
                    checked={active}
                    onChange={() => s.selectService(sv.id)}
                    className="sr-only"
                  />
                  <ServiceIcon service={sv.id} size={56} muted={!active} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-bold">{sv.name}</span>
                    <span className="block truncate text-[13px] text-fg-65">
                      Llega en {etas[sv.id] ?? '—'} min · {sv.capacity_label}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    {f ? (
                      <span className={cn('block text-[17px] font-black tabular-nums', active ? 'text-ivancar-yellow' : 'text-fg')}>
                        {formatUSD(f.amount)}
                      </span>
                    ) : (
                      <Skeleton className="h-5 w-14" />
                    )}
                    {f?.mode === 'hourly' && <span className="block text-[11px] text-fg-55">{f.hours} h</span>}
                  </span>
                </label>

                {active && sv.id === 'por_horas' && (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-2" data-testid="hours-picker">
                    <span className="min-w-0 text-[14px]">
                      <span className="block font-semibold">¿Cuántas horas?</span>
                      <span className="block text-[12px] text-fg-55">
                        {formatUSD(sv.hourly_rate ?? 0)}/h · mín. {HOURS_MIN} h
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label="Menos horas"
                        disabled={hours <= HOURS_MIN}
                        onClick={() => s.setHours(hours - 1)}
                        className="grid size-11 place-items-center rounded-full border border-line-strong disabled:opacity-40"
                      >
                        <IconMinus size={18} />
                      </button>
                      <output className="w-12 text-center text-[18px] font-black tabular-nums" aria-live="polite">
                        {hours} h
                      </output>
                      <button
                        type="button"
                        aria-label="Más horas"
                        disabled={hours >= HOURS_MAX}
                        onClick={() => s.setHours(hours + 1)}
                        className="grid size-11 place-items-center rounded-full border border-line-strong disabled:opacity-40"
                      >
                        <IconPlus size={18} />
                      </button>
                    </span>
                  </div>
                )}
                {active && sv.id === 'encomiendas' && (
                  <InlineNote icon={<IconInfo size={15} />} className="mt-2 px-1">
                    Para sobres, documentos y paquetes de hasta 20 kg. Deja en la nota quién recibe y su teléfono.
                  </InlineNote>
                )}
              </div>
            );
          })}
        </div>
      </fieldset>
    </SheetContent>
  );
}
