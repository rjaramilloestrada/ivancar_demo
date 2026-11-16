import { useId, useState } from 'react';
import { Button, IconReceipt, IconStar, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDistance, formatDuration } from '@/lib/geo';
import { DEMO_FARE_NOTICE, formatUSD } from '@/lib/pricing';
import { getService } from '@/mocks/services';
import { rideCode, useRide } from '@/store/rideStore';
import { PAYMENT_LABEL, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';

const TIPS = [0, 0.5, 1, 2];
const STAR_TEXT = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'];

/** P8 · Llegada: resumen, calificación, propina, comentario y recibo simulado. */
export function RatingSheet() {
  const toast = useToast();
  const ride = useRide((s) => s.ride)!;
  const unit = useRide((s) => s.unit);
  const finish = useRide((s) => s.finish);
  const [stars, setStars] = useState<number | null>(null);
  const [tip, setTip] = useState(0);
  const [comment, setComment] = useState('');
  const [receipt, setReceipt] = useState(false);
  const ids = { stars: useId(), tip: useId(), comment: useId(), receipt: useId() };

  const fare = ride.fare_final_usd ?? ride.fare_estimate_usd;
  const total = fare + tip;
  const when = new Date(ride.completed_at ?? Date.now());

  return (
    <SheetContent
      stepKey="rating"
      header={<SheetTitle eyebrow="Viaje terminado" title={`Llegaste a ${ride.dropoff_label}`} size="lg" />}
      footer={
        <Button
          fullWidth
          size="lg"
          onClick={() => {
            if (finish({ rating: stars, tip, comment })) {
              // Bloque 5: confetti amarillo al terminar (rideEvents 'rated').
              toast.show({ id: 'thanks', tone: 'success', title: '¡Gracias por viajar con IVANCAR!', description: 'Tu viaje quedó en Mis viajes.' });
            }
          }}
          data-testid="finish"
        >
          {stars ? 'Enviar y terminar' : 'Terminar'}
        </Button>
      }
    >
      <div className="pb-4">
        <dl className="grid grid-cols-2 gap-2" data-testid="trip-summary">
          <Stat label="Distancia" value={formatDistance(ride.distance_m)} />
          <Stat label="Duración" value={formatDuration(ride.duration_s)} />
          <Stat label="Total estimado" value={formatUSD(fare)} note={DEMO_FARE_NOTICE} highlight />
          <Stat label="Pago" value={PAYMENT_LABEL[ride.payment_method]} note={getService(ride.service_id).name} />
        </dl>

        <fieldset className="mt-6 min-w-0">
          <legend id={ids.stars} className="text-[16px] font-bold">
            ¿Cómo estuvo tu viaje{unit ? ` con ${unit.display_name}` : ''}?
          </legend>
          <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-labelledby={ids.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}: ${STAR_TEXT[n]}`}
                onClick={() => setStars(n)}
                className="grid size-12 place-items-center rounded-full transition-transform active:scale-90"
                data-testid={`star-${n}`}
              >
                <IconStar size={32} filled={!!stars && n <= stars} className={stars && n <= stars ? 'text-ivancar-yellow' : 'text-fg-55'} />
              </button>
            ))}
            <span className="ml-2 text-[14px] font-semibold text-fg-75" aria-hidden>
              {stars ? STAR_TEXT[stars] : ''}
            </span>
          </div>
        </fieldset>

        <fieldset className="mt-5 min-w-0">
          <legend id={ids.tip} className="text-[16px] font-bold">
            Propina <span className="font-normal text-fg-55">(opcional)</span>
          </legend>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {TIPS.map((t) => (
              <label
                key={t}
                className={cn(
                  'grid h-11 cursor-pointer place-items-center rounded-full border text-[15px] font-bold tabular-nums transition-colors',
                  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ivancar-yellow',
                  tip === t ? 'border-ivancar-yellow bg-ivancar-yellow text-on-yellow' : 'border-line-strong text-fg-80 hover:border-fg-55',
                )}
              >
                <input
                  type="radio"
                  name={ids.tip}
                  value={t}
                  checked={tip === t}
                  onChange={() => setTip(t)}
                  className="sr-only"
                />
                {t === 0 ? 'No' : formatUSD(t)}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5">
          <label htmlFor={ids.comment} className="text-[16px] font-bold">
            Comentario <span className="font-normal text-fg-55">(opcional)</span>
          </label>
          <textarea
            id={ids.comment}
            rows={2}
            maxLength={280}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="¿Algo que debamos saber?"
            className="mt-2 block w-full resize-none rounded-2xl border border-line-strong bg-surface-raised px-4 py-3 text-[16px] text-fg outline-none placeholder:text-fg-55 focus:border-ivancar-yellow"
          />
        </div>

        <div className="mt-5">
          <button
            type="button"
            aria-expanded={receipt}
            aria-controls={ids.receipt}
            onClick={() => setReceipt((r) => !r)}
            className="flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ivancar-yellow"
            data-testid="toggle-receipt"
          >
            <IconReceipt size={18} />
            {receipt ? 'Ocultar recibo' : 'Ver recibo'}
          </button>
          {receipt && (
            <div id={ids.receipt} className="mt-2 rounded-[20px] border border-dashed border-line-strong p-4 text-[14px]" data-testid="receipt">
              <div className="flex items-baseline justify-between">
                <p className="font-black uppercase tracking-wide">IVANCAR</p>
                <p className="text-[12px] text-fg-55">Pedido #{rideCode(ride.id)}</p>
              </div>
              <p className="text-[12px] text-fg-55">
                {when.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })} ·{' '}
                {when.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </p>
              <dl className="mt-3 flex flex-col gap-1.5">
                <Line label={`${getService(ride.service_id).name} · ${formatDistance(ride.distance_m)}`} value={formatUSD(fare)} />
                <Line label="Propina" value={formatUSD(tip)} />
                <Line label="Total" value={formatUSD(total)} strong />
                <Line label="Forma de pago" value={PAYMENT_LABEL[ride.payment_method]} />
                {unit && <Line label="Unidad" value={`${unit.vehicle.plate} · ${unit.display_name}`} />}
              </dl>
              <p className="mt-3 border-t border-line pt-2 text-[12px] text-fg-55">Recibo simulado del demo · sin validez tributaria · {DEMO_FARE_NOTICE.toLowerCase()}.</p>
            </div>
          )}
        </div>
      </div>
    </SheetContent>
  );
}

function Stat({ label, value, note, highlight }: { label: string; value: string; note?: string; highlight?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-raised px-3.5 py-3">
      <dt className="text-[12px] font-semibold uppercase tracking-[0.1em] text-fg-55">{label}</dt>
      <dd className={cn('mt-0.5 text-[20px] font-black tabular-nums', highlight && 'text-ivancar-yellow')}>{value}</dd>
      {note && <dd className="text-[11px] leading-tight text-fg-55">{note}</dd>}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3', strong && 'border-t border-line pt-1.5 font-bold')}>
      <dt className={strong ? '' : 'text-fg-65'}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
