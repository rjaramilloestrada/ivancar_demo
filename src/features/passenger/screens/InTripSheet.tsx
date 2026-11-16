import { useState } from 'react';
import { Button, ButtonLink, Dialog, IconShield, IconWhatsApp, useToast } from '@/components/ui';
import { track } from '@/lib/analytics';
import { formatDistance, pointAlong } from '@/lib/geo';
import { shareWhatsappHref } from '@/lib/links';
import { phaseProgress, useRide } from '@/store/rideStore';
import { useNow } from '../hooks';
import { DriverCard, RouteSummary, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';
import { locationShareText } from '../share';
import { remainingText } from './AssignedSheet';

/** P7 · En viaje: tiempo y distancia restantes, compartir ubicación y emergencia. */
export function InTripSheet() {
  const toast = useToast();
  const ride = useRide((s) => s.ride)!;
  const unit = useRide((s) => s.unit)!;
  const route = useRide((s) => s.route)!;
  const phaseStartedAt = useRide((s) => s.phaseStartedAt);
  const phaseDurationMs = useRide((s) => s.phaseDurationMs);
  const [sos, setSos] = useState(false);
  const now = useNow(500);

  const p = phaseProgress({ phaseStartedAt, phaseDurationMs }, now);
  const eta = remainingText(route.duration_s, p);
  const left = formatDistance(route.distance_m * (1 - p));
  const here = pointAlong(route.path, p).point;

  const shareHref = shareWhatsappHref(locationShareText({ unit, at: here, to: ride.dropoff_label, eta: eta ?? '1 min' }));

  return (
    <SheetContent
      stepKey="inTrip"
      header={
        <div>
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="label-caps text-ivancar-yellow">En viaje</p>
            <button
              type="button"
              onClick={() => {
                setSos(true);
                track('emergency_open');
              }}
              className="-my-1.5 flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-danger/60 bg-danger/10 px-3.5 text-[13px] font-bold text-danger transition-colors hover:bg-danger/20"
              data-testid="emergency"
            >
              <IconShield size={17} />
              Emergencia
            </button>
          </div>
          <SheetTitle
            size="lg"
            title={
              <span aria-live="polite" aria-atomic="true">
                {eta ? (
                  <>
                    Llegas en <span className="text-ivancar-yellow tabular-nums" data-testid="trip-eta">{eta}</span>
                  </>
                ) : (
                  'Llegando'
                )}
              </span>
            }
            subtitle={
              <>
                <span className="tabular-nums" data-testid="trip-left">{left}</span> restantes · a {ride.dropoff_label}
              </>
            }
          />
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Avance del viaje" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
            <div className="h-full rounded-full bg-ivancar-yellow transition-[width] duration-500 ease-linear" style={{ width: `${p * 100}%` }} />
          </div>
        </div>
      }
      footer={
        <ButtonLink
          href={shareHref}
          fullWidth
          size="lg"
          leadingIcon={<IconWhatsApp size={20} />}
          onClick={() => track('share_location')}
          data-testid="share-location"
        >
          Compartir mi ubicación
        </ButtonLink>
      }
    >
      <div className="pb-4">
        <DriverCard unit={unit} />
        <div className="mt-3 rounded-[20px] border border-line p-4">
          <RouteSummary from={ride.pickup_label} to={ride.dropoff_label} />
        </div>
      </div>

      <Dialog
        open={sos}
        onClose={() => setSos(false)}
        tone="danger"
        icon={<IconShield size={22} />}
        title="Botón de emergencia"
        description={
          <>
            <p>
              <strong className="text-fg">Esto es una simulación del demo.</strong> En la app real, avisaría al instante a la Central IVANCAR y a tus
              contactos de confianza, con tu ubicación en vivo y los datos de la unidad.
            </p>
            <p className="mt-2">Si estás en peligro, llama al ECU 911 desde tu teléfono.</p>
          </>
        }
        actions={
          <>
            <Button fullWidth size="lg" autoFocus onClick={() => setSos(false)}>
              Cerrar
            </Button>
            <Button
              fullWidth
              variant="ghost"
              className="text-danger! hover:text-danger!"
              onClick={() => {
                setSos(false);
                toast.show({ id: 'sos', tone: 'warning', title: 'Alerta simulada', description: 'En la app real, la central te contactaría de inmediato.' });
              }}
              data-testid="emergency-confirm"
            >
              Probar alerta (simulada)
            </Button>
          </>
        }
      />
    </SheetContent>
  );
}
