import { useId, useState } from 'react';
import { StarRating } from '@/components/fx/StarRating';
import { Button, IconReceipt, useToast } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDistance, formatDuration } from '@/lib/geo';
import { DEMO_FARE_NOTICE, formatUSD } from '@/lib/pricing';
import { getService } from '@/mocks/services';
import { useRide } from '@/store/rideStore';
import { PAYMENT_LABEL, SheetTitle } from '../parts';
import { Receipt } from '../Receipt';
import { SheetContent } from '../SheetSlots';

const TIPS = [0, 0.5, 1, 2];

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
              // Con 4 o 5 estrellas, PassengerApp lanza el confetti (rideEvents 'rated').
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
          <StarRating value={stars} onChange={setStars} labelledBy={ids.stars} size={34} className="mt-2 -ml-1.5" />
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
                <input type="radio" name={ids.tip} value={t} checked={tip === t} onChange={() => setTip(t)} className="sr-only" />
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
