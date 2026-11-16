import { cn } from '@/lib/cn';
import { formatDistance } from '@/lib/geo';
import { DEMO_FARE_NOTICE, formatUSD } from '@/lib/pricing';
import { getService } from '@/mocks/services';
import { rideCode } from '@/store/rideStore';
import type { Ride } from '@/types';
import { PAYMENT_LABEL } from './parts';

export interface ReceiptProps {
  ride: Pick<Ride, 'id' | 'service_id' | 'distance_m' | 'payment_method' | 'fare_estimate_usd' | 'fare_final_usd' | 'completed_at'>;
  tip: number;
  /** "GSB-4821 · Carlos M." */
  unitLabel?: string;
  id?: string;
  className?: string;
  'data-testid'?: string;
}

/** Recibo simulado del demo (P8 y Mis viajes). Sin validez tributaria, tarifa referencial. */
export function Receipt({ ride, tip, unitLabel, id, className, 'data-testid': testId }: ReceiptProps) {
  const fare = ride.fare_final_usd ?? ride.fare_estimate_usd;
  const when = new Date(ride.completed_at ?? Date.now());
  return (
    <div id={id} className={cn('rounded-[20px] border border-dashed border-line-strong p-4 text-[14px]', className)} data-testid={testId}>
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
        <Line label="Total" value={formatUSD(fare + tip)} strong />
        <Line label="Forma de pago" value={PAYMENT_LABEL[ride.payment_method]} />
        {unitLabel && <Line label="Unidad" value={unitLabel} />}
      </dl>
      <p className="mt-3 border-t border-line pt-2 text-[12px] text-fg-55">Recibo simulado del demo · sin validez tributaria · {DEMO_FARE_NOTICE.toLowerCase()}.</p>
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
