import { motion } from 'motion/react';
import { useState } from 'react';
import { DemoBanner } from '@/components/brand/DemoBanner';
import { Logo } from '@/components/brand/Logo';
import { MapBackdrop } from '@/components/map/MapBackdrop';
import { BottomSheet, type SheetSnap } from '@/components/sheet/BottomSheet';
import {
  Button,
  ButtonLink,
  Eyebrow,
  IconArrowRight,
  IconPhone,
  IconPin,
  IconSearch,
  IconWhatsApp,
  Skeleton,
  useToast,
} from '@/components/ui';
import { greeting } from '@/lib/greeting';
import { telHref, whatsappHref } from '@/lib/links';

/**
 * Vista pasajero (placeholder del bloque 1).
 * El bloque 2 reemplaza MapBackdrop por MapView y el bloque 3 monta aquí el flujo P1–P8.
 */
export default function PassengerHome() {
  const toast = useToast();
  const [snap, setSnap] = useState<SheetSnap>('half');

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ivancar-black">
      <MapBackdrop />

      {/* Pin de recogida */}
      <div className="pointer-events-none absolute inset-x-0 top-[34%] flex -translate-y-1/2 flex-col items-center">
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.25 }}
          className="grid size-12 place-items-center rounded-full bg-ivancar-yellow text-on-yellow shadow-glow"
        >
          <IconPin size={24} />
        </motion.div>
        <span className="mt-1 h-2 w-4 rounded-[50%] bg-black/70 blur-[2px]" />
      </div>

      {/* Barra superior flotante */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pt-[max(14px,env(safe-area-inset-top))]">
        <div className="rounded-full border border-line bg-header px-4 py-2.5 backdrop-blur-xl">
          <Logo height={20} />
        </div>
        <Eyebrow live className="bg-header backdrop-blur-xl">
          Taxi 24/7
        </Eyebrow>
      </div>
      <div className="absolute inset-x-0 top-[calc(max(14px,env(safe-area-inset-top))+56px)] z-20 flex justify-center">
        <DemoBanner />
      </div>

      <BottomSheet
        aria-label="Pedir taxi"
        snap={snap}
        onSnapChange={setSnap}
        header={
          <div>
            <p className="text-sm font-medium text-fg-65">{greeting()},</p>
            <h1 className="title-display mt-1 text-[32px]">¿A dónde vamos?</h1>
            <button
              type="button"
              onClick={() => setSnap('full')}
              className="mt-4 flex h-14 w-full items-center gap-3 rounded-full border border-line-strong bg-surface-raised px-5 text-left text-fg-55 transition-colors hover:border-fg-55"
            >
              <IconSearch size={20} className="text-ivancar-yellow" />
              <span className="flex-1 text-[16px]">¿A dónde vas?</span>
            </button>
          </div>
        }
        footer={
          <Button
            fullWidth
            size="lg"
            trailingIcon={<IconArrowRight size={20} />}
            onClick={() =>
              toast.show({
                title: 'Muy pronto',
                description: 'El pedido con mapa llega en la siguiente versión del demo.',
              })
            }
          >
            Pedir taxi
          </Button>
        }
      >
        <section aria-labelledby="frecuentes" className="pt-2">
          <h2 id="frecuentes" className="label-caps text-fg-55">
            Lugares frecuentes
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 rounded-2xl border border-line p-3">
                <Skeleton shape="circle" className="size-10" />
                <span className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="otros-canales" className="mt-6 pb-4">
          <h2 id="otros-canales" className="label-caps text-fg-55">
            ¿Prefieres hablar con nosotros?
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            <ButtonLink
              href={whatsappHref('Hola IVANCAR, quiero solicitar un taxi.')}
              variant="secondary"
              fullWidth
              leadingIcon={<IconWhatsApp size={20} className="text-[#25D366]" />}
            >
              Solicitar taxi por WhatsApp
            </ButtonLink>
            <ButtonLink href={telHref} variant="ghost" fullWidth leadingIcon={<IconPhone size={18} />}>
              Llamar ahora
            </ButtonLink>
          </div>
        </section>
      </BottomSheet>
    </main>
  );
}
