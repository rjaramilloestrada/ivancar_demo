import { useId, useMemo } from 'react';
import { Button, IconCard, IconCash, IconTicket } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useRide } from '@/store/rideStore';
import type { PaymentMethod } from '@/types';
import { SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';

const METHODS: Array<{ id: PaymentMethod; title: string; detail: string; icon: typeof IconCash }> = [
  { id: 'cash', title: 'Efectivo', detail: 'Pagas al conductor al llegar.', icon: IconCash },
  { id: 'card', title: 'Tarjeta', detail: 'Visa terminada en 4242 · simulada', icon: IconCard },
  { id: 'voucher', title: 'Vale corporativo', detail: 'Cuenta empresa de ejemplo · simulado', icon: IconTicket },
];

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Próxima hora redonda (cuarto de hora) con al menos 30 min de margen. */
function defaultSchedule(): Date {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

/** P4 · Pago y opciones (se abre desde la fila "Cambiar" de P3; no es paso obligatorio). */
export function PaymentSheet() {
  const options = useRide((s) => s.options);
  const setOptions = useRide((s) => s.setOptions);
  const close = useRide((s) => s.closeOptions);
  const ids = { pay: useId(), when: useId(), day: useId(), time: useId(), note: useId() };

  const days = useMemo(() => {
    const out: Array<{ key: string; label: string }> = [];
    const base = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
      const label =
        i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'short' });
      out.push({ key: dayKey(d), label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return out;
  }, []);

  const sched = options.scheduledFor ? new Date(options.scheduledFor) : null;
  const setWhen = (day: string, time: string) => {
    const [y, m, d] = day.split('-').map(Number);
    const [hh, mm] = time.split(':').map(Number);
    let at = new Date(y, m - 1, d, hh || 0, mm || 0);
    // No se programa en el pasado: mínimo 15 minutos desde ahora.
    if (at.getTime() < Date.now() + 15 * 60_000) at = defaultSchedule();
    setOptions({ scheduledFor: at.toISOString() });
  };

  return (
    <SheetContent
      stepKey="payment"
      header={<SheetTitle title="Pago y opciones" onBack={close} />}
      footer={
        <Button fullWidth size="lg" onClick={close} data-testid="options-done">
          Listo
        </Button>
      }
    >
      <fieldset className="min-w-0" aria-describedby={ids.pay}>
        <legend className="label-caps text-fg-55">Forma de pago</legend>
        <div className="mt-2 flex flex-col gap-2">
          {METHODS.map((m) => {
            const active = options.payment === m.id;
            const Icon = m.icon;
            return (
              <label
                key={m.id}
                className={cn(
                  'flex min-h-[64px] cursor-pointer items-center gap-3 rounded-[20px] border px-4 py-3 transition-colors',
                  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ivancar-yellow',
                  active ? 'border-ivancar-yellow bg-ivancar-yellow/[0.07]' : 'border-line hover:border-line-strong',
                )}
              >
                <input
                  type="radio"
                  name="payment"
                  value={m.id}
                  checked={active}
                  onChange={() => setOptions({ payment: m.id })}
                  className="sr-only"
                />
                <Icon size={22} className={active ? 'text-ivancar-yellow' : 'text-fg-65'} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{m.title}</span>
                  <span className="block text-[13px] text-fg-65">{m.detail}</span>
                </span>
                <span
                  aria-hidden
                  className={cn('grid size-5 place-items-center rounded-full border-2', active ? 'border-ivancar-yellow' : 'border-fg-55')}
                >
                  {active && <span className="size-2.5 rounded-full bg-ivancar-yellow" />}
                </span>
              </label>
            );
          })}
        </div>
        <p id={ids.pay} className="mt-2 text-[12px] text-fg-55">
          Tarjeta y vale son de demostración: no se hace ningún cobro.
        </p>
      </fieldset>

      <fieldset className="mt-6 min-w-0">
        <legend className="label-caps text-fg-55">¿Cuándo?</legend>
        <div role="radiogroup" aria-label="Cuándo" className="mt-2 grid grid-cols-2 gap-1 rounded-full border border-line-strong p-1">
          {[
            { id: 'now', label: 'Ahora' },
            { id: 'later', label: 'Programar' },
          ].map((o) => {
            const active = (o.id === 'later') === !!sched;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setOptions({ scheduledFor: o.id === 'now' ? null : defaultSchedule().toISOString() })}
                className={cn(
                  'h-11 rounded-full text-[15px] font-bold transition-colors',
                  active ? 'bg-ivancar-yellow text-on-yellow' : 'text-fg-75 hover:text-fg',
                )}
                data-testid={`when-${o.id}`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        {sched && (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2" data-testid="schedule-fields">
            <div>
              <label htmlFor={ids.day} className="sr-only">
                Día
              </label>
              <select
                id={ids.day}
                value={dayKey(sched)}
                onChange={(e) => setWhen(e.target.value, `${pad(sched.getHours())}:${pad(sched.getMinutes())}`)}
                className="h-12 w-full rounded-2xl border border-line-strong bg-surface-raised px-4 text-[15px] text-fg"
              >
                {days.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={ids.time} className="sr-only">
                Hora
              </label>
              <input
                id={ids.time}
                type="time"
                step={300}
                value={`${pad(sched.getHours())}:${pad(sched.getMinutes())}`}
                onChange={(e) => e.target.value && setWhen(dayKey(sched), e.target.value)}
                className="h-12 w-[9.75rem] rounded-2xl border border-line-strong bg-surface-raised px-3.5 text-[15px] text-fg [color-scheme:dark]"
              />
            </div>
          </div>
        )}
      </fieldset>

      <div className="mt-6 pb-4">
        <label htmlFor={ids.note} className="label-caps text-fg-55">
          Nota al conductor
        </label>
        <textarea
          id={ids.note}
          rows={2}
          maxLength={140}
          value={options.note}
          onChange={(e) => setOptions({ note: e.target.value })}
          placeholder="Ej.: Estoy en la garita principal."
          className="mt-2 block w-full resize-none rounded-2xl border border-line-strong bg-surface-raised px-4 py-3 text-[16px] text-fg outline-none placeholder:text-fg-55 focus:border-ivancar-yellow"
        />
        <p className="mt-1 text-right text-[12px] tabular-nums text-fg-55" aria-live="polite">
          {options.note.length}/140
        </p>
      </div>
    </SheetContent>
  );
}
