import { useMemo } from 'react';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { Button, Eyebrow, useToast } from '@/components/ui';
import { haversine } from '@/lib/geo';
import { formatUSD } from '@/lib/pricing';
import { simTimings } from '@/lib/simConfig';
import { fleet } from '@/mocks/drivers';
import { getService } from '@/mocks/services';
import { rideCode, useRide } from '@/store/rideStore';
import { toLatLng } from '@/types';
import { useNow } from '../hooks';
import { PAYMENT_LABEL, RouteSummary, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';
import { scheduleLabel } from './ServiceSheet';

/** P5 · Buscando unidad (5–8 s como máximo; nunca se queda colgado). */
export function SearchingSheet({ centralOnline }: { centralOnline: boolean }) {
  const toast = useToast();
  const ride = useRide((s) => s.ride)!;
  const startedAt = useRide((s) => s.phaseStartedAt) ?? Date.now();
  const cancel = useRide((s) => s.cancel);
  const centralMode = useRide((s) => s.centralMode);
  const now = useNow(250);

  const T = simTimings();
  const manual = centralMode === 'manual';
  const expected = manual ? T.searchManualTimeoutMs : centralOnline ? T.searchCentralTimeoutMs : T.searchAutoMs;
  const progress = Math.min(0.95, (now - startedAt) / (expected + 600));

  // Unidades disponibles a menos de 6 km (contador; el Bloque 5 lo anima con el radar).
  const nearby = useMemo(
    () => fleet.filter((u) => u.status === 'available' && haversine([ride.pickup_lat, ride.pickup_lng], toLatLng(u)) < 6000).length,
    [ride.pickup_lat, ride.pickup_lng],
  );
  const evaluated = Math.max(1, Math.min(nearby, Math.ceil(progress * nearby * 1.4)));
  const service = getService(ride.service_id);

  return (
    <SheetContent
      stepKey="searching"
      header={
        <div data-searching>
          <SheetTitle
            eyebrow={`Pedido #${rideCode(ride.id)}`}
            title="Buscando tu unidad"
            subtitle={
              <span aria-live="polite">
                Revisando unidades cercanas · <span className="tabular-nums font-semibold text-fg-80" data-testid="units-evaluated">{evaluated}</span> de{' '}
                {nearby}
              </span>
            }
          />
          <div
            className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10"
            role="progressbar"
            aria-label="Buscando unidad"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
          >
            <div className="h-full rounded-full bg-ivancar-yellow transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      }
      footer={
        <Button
          fullWidth
          size="lg"
          variant="secondary"
          onClick={() => {
            if (cancel('passenger')) toast.show({ id: 'cancelled', title: 'Pedido cancelado', description: 'No se asignó ninguna unidad.' });
          }}
          data-testid="cancel-search"
        >
          Cancelar pedido
        </Button>
      }
    >
      <div className="pb-4">
        <div className="rounded-[20px] border border-line p-4">
          <RouteSummary from={ride.pickup_label} to={ride.dropoff_label} />
          <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
            <ServiceIcon service={ride.service_id} size={48} />
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="block font-bold">{service.name}</span>
              <span className="block text-fg-65">
                {PAYMENT_LABEL[ride.payment_method]} · {scheduleLabel(ride.scheduled_for)}
              </span>
            </span>
            <span className="text-right">
              <span className="block text-[17px] font-black tabular-nums">{formatUSD(ride.fare_estimate_usd)}</span>
              <span className="block text-[11px] text-fg-55">Referencial</span>
            </span>
          </div>
        </div>
        {ride.scheduled_for && (
          <p className="mt-3 text-[13px] text-fg-65">
            Tu viaje queda reservado para {scheduleLabel(ride.scheduled_for).toLowerCase()}. En el demo te mostramos la asignación ahora.
          </p>
        )}
        <div className="mt-3 flex justify-center">
          {manual ? (
            <Eyebrow live tone="neutral" className="text-[10px]">
              Un operador de la central está asignando tu unidad
            </Eyebrow>
          ) : centralOnline || centralMode ? (
            <Eyebrow live tone="neutral" className="text-[10px]">
              Central IVANCAR conectada
            </Eyebrow>
          ) : (
            <Eyebrow tone="neutral" className="text-[10px]">
              Asignación automática
            </Eyebrow>
          )}
        </div>
      </div>
    </SheetContent>
  );
}
