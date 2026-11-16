import { useState } from 'react';
import { DemoBanner } from '@/components/brand/DemoBanner';
import { Logo } from '@/components/brand/Logo';
import { ButtonLink, Dialog, IconClock, IconPhone, IconWhatsApp } from '@/components/ui';
import { track } from '@/lib/analytics';
import { telHref, whatsappHref } from '@/lib/links';
import { useRide } from '@/store/rideStore';
import { useOnline } from './hooks';
import { fallbackRequestText } from './share';

/** Alto de la barra flotante + banner de demo (px), sin la zona segura. */
export const TOP_CHROME = 112;

/** Barra flotante: logo, Mis viajes, contacto directo (respaldo) y banner de demo. */
export function TopBar() {
  const step = useRide((s) => s.step);
  const pickup = useRide((s) => s.pickup);
  const openHistory = useRide((s) => s.openHistory);
  const online = useOnline();
  const [contact, setContact] = useState(false);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="rounded-full border border-line bg-header px-4 py-2.5 backdrop-blur-xl">
          <Logo height={20} />
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {step === 'home' && (
            <button
              type="button"
              onClick={() => {
                if (openHistory()) track('history_open');
              }}
              className="flex h-11 items-center gap-2 rounded-full border border-line bg-header px-4 text-[14px] font-semibold backdrop-blur-xl transition-colors hover:border-fg-55"
              data-testid="open-history"
            >
              <IconClock size={18} className="text-ivancar-yellow" />
              Mis viajes
            </button>
          )}
          <button
            type="button"
            aria-label="Contactar a IVANCAR por WhatsApp o llamada"
            title="Contactar a IVANCAR"
            onClick={() => setContact(true)}
            className="grid size-11 place-items-center rounded-full border border-line bg-header backdrop-blur-xl transition-colors hover:border-fg-55"
            data-testid="open-contact"
          >
            <IconPhone size={18} />
          </button>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-[calc(max(14px,env(safe-area-inset-top))+56px)] z-20 flex flex-col items-center gap-2">
        <DemoBanner />
        {!online && (
          <p role="status" className="rounded-full border border-ivancar-yellow/50 bg-header px-3 py-1.5 text-[12px] font-semibold text-ivancar-yellow backdrop-blur-xl">
            Sin conexión · el demo sigue funcionando
          </p>
        )}
      </div>

      <Dialog
        open={contact}
        onClose={() => setContact(false)}
        icon={<IconPhone size={22} />}
        title="¿Prefieres hablar con nosotros?"
        description="Taxi 24/7 por WhatsApp o llamada, como siempre."
        actions={
          <>
            <ButtonLink
              href={whatsappHref(fallbackRequestText(pickup?.label))}
              fullWidth
              size="lg"
              leadingIcon={<IconWhatsApp size={20} />}
              onClick={() => track('whatsapp_fallback_click', { from: 'topbar' })}
              data-testid="contact-whatsapp"
            >
              Solicitar taxi por WhatsApp
            </ButtonLink>
            <ButtonLink
              href={telHref}
              fullWidth
              variant="secondary"
              leadingIcon={<IconPhone size={18} />}
              onClick={() => track('call_click', { from: 'topbar' })}
              data-testid="contact-call"
            >
              Llamar ahora
            </ButtonLink>
          </>
        }
      />
    </>
  );
}
