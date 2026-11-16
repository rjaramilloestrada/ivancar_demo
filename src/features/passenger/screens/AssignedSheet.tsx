import { useState, type ReactNode } from 'react';
import { Button, ButtonLink, Dialog, IconChat, IconClose, IconPhone, IconShare, useToast } from '@/components/ui';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { formatMinutes } from '@/lib/geo';
import { shareWhatsappHref, telHref } from '@/lib/links';
import { phaseProgress, rideCode, useRide } from '@/store/rideStore';
import { useNow } from '../hooks';
import { DriverCard, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';
import { useChat } from '../chat/chatStore';
import { tripShareText } from '../share';

/** Minutos que faltan de una fase, en texto ("4 min"), o null si ya casi llega. */
export function remainingText(totalSeconds: number, progress: number): string | null {
  const left = (totalSeconds * (1 - progress)) / 60;
  if (progress >= 0.985 || left < 0.25) return null;
  return formatMinutes(left);
}

/** P6 · Unidad asignada: conductor, placa, ETA en vivo y acciones. */
export function AssignedSheet() {
  const toast = useToast();
  const ride = useRide((s) => s.ride)!;
  const unit = useRide((s) => s.unit)!;
  const approach = useRide((s) => s.approach)!;
  const assignedBy = useRide((s) => s.assignedBy);
  const phaseStartedAt = useRide((s) => s.phaseStartedAt);
  const phaseDurationMs = useRide((s) => s.phaseDurationMs);
  const cancel = useRide((s) => s.cancel);
  const openChat = useRide((s) => s.setChatOpen);
  const unread = useChat((s) => (s.rideId === ride.id ? s.unread : 0));
  const [confirm, setConfirm] = useState(false);
  const now = useNow(500);

  const p = phaseProgress({ phaseStartedAt, phaseDurationMs }, now);
  const arrived = ride.status === 'arrived' || p >= 1;
  const eta = remainingText(approach.duration_s, p);
  const v = unit.vehicle;

  const shareHref = shareWhatsappHref(
    tripShareText({ unit, from: ride.pickup_label, to: ride.dropoff_label, eta: eta ?? 'llegando', code: rideCode(ride.id) }),
  );

  return (
    <SheetContent
      stepKey={arrived ? 'arrived' : 'assigned'}
      header={
        arrived ? (
          <SheetTitle
            eyebrow="Te está esperando"
            title="Tu IVANCAR llegó"
            size="lg"
            subtitle={
              <>
                Busca la placa <strong className="text-fg">{v.plate}</strong> · {v.make} {v.model} {v.color.toLowerCase()}
              </>
            }
          />
        ) : (
          <SheetTitle
            eyebrow={assignedBy === 'central' ? 'Asignada por la Central IVANCAR' : 'Unidad asignada'}
            title={
              <span aria-live="polite" aria-atomic="true">
                {eta ? (
                  <>
                    Llega en <span className="text-ivancar-yellow tabular-nums" data-testid="eta">{eta}</span>
                  </>
                ) : (
                  'Llegando'
                )}
              </span>
            }
            size="lg"
            subtitle={<>Te recoge en {ride.pickup_label}</>}
          />
        )
      }
      footer={
        <ButtonLink
          href={shareHref}
          fullWidth
          size="lg"
          leadingIcon={<IconShare size={20} />}
          onClick={() => track('share_trip')}
          data-testid="share-trip"
        >
          Compartir viaje
        </ButtonLink>
      }
    >
      <div className="pb-4">
        <DriverCard unit={unit} />

        <div className="mt-3 grid grid-cols-3 gap-2">
          <ActionLink href={telHref} icon={<IconPhone size={20} />} label="Llamar" onClick={() => track('call_click', { from: 'assigned' })} testId="call-driver" />
          <ActionButton icon={<IconChat size={20} />} label="Chat" badge={unread} onClick={() => openChat(true)} testId="chat-driver" />
          <ActionButton icon={<IconClose size={20} />} label="Cancelar" tone="danger" onClick={() => setConfirm(true)} testId="cancel-ride" />
        </div>
        <p className="mt-3 text-center text-[12px] text-fg-55">Conductor y unidad de demostración.</p>
      </div>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        icon={<IconClose size={22} />}
        title="¿Cancelar tu viaje?"
        description={`${unit.display_name} ya va en camino. Si cancelas, liberamos la unidad para otro pasajero.`}
        actions={
          <>
            <Button fullWidth size="lg" autoFocus onClick={() => setConfirm(false)}>
              No, seguir esperando
            </Button>
            <Button
              fullWidth
              variant="ghost"
              className="text-danger! hover:text-danger!"
              onClick={() => {
                setConfirm(false);
                if (cancel('passenger')) toast.show({ id: 'cancelled', title: 'Viaje cancelado', description: 'Cuando quieras, pide de nuevo.' });
              }}
              data-testid="confirm-cancel"
            >
              Sí, cancelar
            </Button>
          </>
        }
      />
    </SheetContent>
  );
}

const actionClass =
  'flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-2xl border border-line-strong text-[13px] font-semibold transition-colors hover:border-fg-55';

function ActionButton({
  icon,
  label,
  onClick,
  tone,
  testId,
  badge = 0,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'danger';
  testId?: string;
  /** Mensajes sin leer (chat). */
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={badge ? `${label}, ${badge} ${badge === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}` : undefined}
      className={cn(actionClass, 'relative', tone === 'danger' && 'text-danger')}
      data-testid={testId}
    >
      {icon}
      {label}
      {badge > 0 && (
        <span aria-hidden className="absolute right-3 top-2 grid min-w-5 place-items-center rounded-full bg-ivancar-yellow px-1 text-[11px] font-black leading-5 text-on-yellow" data-testid="chat-unread">
          {badge}
        </span>
      )}
    </button>
  );
}

function ActionLink({ href, icon, label, onClick, testId }: { href: string; icon: ReactNode; label: string; onClick?: () => void; testId?: string }) {
  return (
    <a href={href} onClick={onClick} className={actionClass} data-testid={testId}>
      {icon}
      {label}
    </a>
  );
}
