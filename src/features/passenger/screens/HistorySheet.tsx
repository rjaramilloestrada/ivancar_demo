import { useMemo } from 'react';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { Button } from '@/components/ui';
import { formatUSD } from '@/lib/pricing';
import { tripHistory } from '@/mocks/history';
import { useRide } from '@/store/rideStore';
import { RouteSummary, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';

/**
 * Mis viajes (P9) · versión provisional del Bloque 3: lista simple con los viajes de esta
 * sesión (store `history`) y los de ejemplo (`mocks/history`).
 * El Bloque 4 la reemplaza por la pantalla completa con mini mapas en SVG.
 */
export function HistorySheet() {
  const close = useRide((s) => s.closeHistory);
  const session = useRide((s) => s.history);
  const trips = useMemo(() => [...session, ...tripHistory.filter((t) => !session.some((s) => s.id === t.id))], [session]);

  return (
    <SheetContent
      stepKey="history"
      header={<SheetTitle title="Mis viajes" subtitle="Tus viajes recientes con IVANCAR." onBack={close} />}
      footer={
        <Button fullWidth size="lg" onClick={close}>
          Pedir un taxi
        </Button>
      }
    >
      <ul className="flex flex-col gap-2 pb-4" data-testid="history-list">
        {trips.map((t) => {
          const d = new Date(t.completed_at ?? t.created_at);
          return (
            <li key={t.id} className="rounded-[20px] border border-line p-4">
              <div className="flex items-center justify-between gap-3 text-[13px] text-fg-65">
                <span className="capitalize">
                  {d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
                  {d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
                <span className="text-[16px] font-black tabular-nums text-fg">{formatUSD((t.fare_final_usd ?? t.fare_estimate_usd) + (t.tip_usd ?? 0))}</span>
              </div>
              <RouteSummary className="mt-3" from={t.pickup_label} to={t.dropoff_label} />
              <div className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-[13px] text-fg-65">
                <ServiceIcon service={t.service_id} size={36} />
                <span className="truncate">
                  {t.driver_display_name} · {t.vehicle_plate}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="pb-4 text-center text-[12px] text-fg-55">Viajes de ejemplo · tarifa referencial de demo.</p>
    </SheetContent>
  );
}
