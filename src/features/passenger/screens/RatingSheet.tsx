import { useId, useState } from 'react';
import { Button, IconReceipt, IconStar, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDistance, formatDuration } from '@/lib/geo';
import { DEMO_FARE_NOTICE, formatUSD } from '@/lib/pricing';
import { getService } from '@/mocks/services';
import { useRide } from '@/store/rideStore';
import { PAYMENT_LABEL, SheetTitle } from '../parts';
import { Receipt } from '../Receipt';
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
          <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby={ids.tip}>
            {TIPS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={tip === t}
                onClick={() => setTip(t)}
                className={cn(
                  'h-11 rounded-full border text-[15px] font-bold tabular-nums transition-colors',
                  tip === t ? 'border-ivancar-yellow bg-ivancar-yellow text-on-yellow' : 'border-line-strong text-fg-80 hover:border-fg-55',
                )}
              >
                {t === 0 ? 'No' : formatUSD(t)}
              </button>
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
            <Receipt
              id={ids.receipt}
              className="mt-2"
              ride={ride}
              tip={tip}
              unitLabel={unit ? `${unit.vehicle.plate} · ${unit.display_name}` : undefined}
              data-testid="receipt"
            />
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
