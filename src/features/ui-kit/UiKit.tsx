import { useState, type ReactNode } from 'react';
import { AppHeader } from '@/components/brand/AppHeader';
import { DemoBanner } from '@/components/brand/DemoBanner';
import { MapBackdrop } from '@/components/map/MapBackdrop';
import { BottomSheet, type SheetSnap } from '@/components/sheet/BottomSheet';
import {
  Button,
  ButtonLink,
  Card,
  Eyebrow,
  HeroCard,
  IconArrowRight,
  IconCar,
  IconPhone,
  IconWhatsApp,
  Skeleton,
  SkeletonText,
  useToast,
  type ButtonState,
} from '@/components/ui';
import { asset, telHref, whatsappHref } from '@/lib/links';

/** Catálogo interno de componentes (#/ui) para revisión visual. */
export default function UiKit() {
  return (
    <div className="min-h-dvh bg-ivancar-black">
      <AppHeader right={<DemoBanner />} />
      <main className="mx-auto flex max-w-3xl flex-col gap-14 px-4 pb-24 pt-8">
        <div className="flex flex-col items-start gap-4">
          <Eyebrow>Sistema visual</Eyebrow>
          <h1 className="title-display text-[40px]">Componentes IVANCAR</h1>
          <p className="max-w-prose text-fg-65">
            Base compartida por la app del pasajero, la central y el demo. Tokens medidos en ivancar-ec.com.
          </p>
        </div>
        <Colors />
        <Type />
        <Buttons />
        <Cards />
        <Eyebrows />
        <Skeletons />
        <Toasts />
        <Sheet />
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-5">
      <h2 id={id} className="label-caps border-b border-line pb-3 text-fg-55">
        {title}
      </h2>
      {children}
    </section>
  );
}

const swatches = [
  { name: 'ivancar-yellow', cls: 'bg-ivancar-yellow', hex: '#F6C90E' },
  { name: 'ivancar-black', cls: 'bg-ivancar-black', hex: '#050505' },
  { name: 'surface', cls: 'bg-surface', hex: '#0C0C0C' },
  { name: 'surface-raised', cls: 'bg-surface-raised', hex: '#151515' },
  { name: 'fg', cls: 'bg-fg', hex: '#FFFFFF' },
  { name: 'fg-55', cls: 'bg-fg-55', hex: 'blanco 55 %' },
  { name: 'line-strong', cls: 'bg-line-strong', hex: 'blanco 15 %' },
  { name: 'success / danger', cls: 'bg-[linear-gradient(90deg,var(--color-success)_50%,var(--color-danger)_50%)]', hex: '' },
];

function Colors() {
  return (
    <Section id="colores" title="Color">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {swatches.map((s) => (
          <div key={s.name} className="flex flex-col gap-2">
            <span className={`h-16 rounded-2xl border border-line ${s.cls}`} />
            <span className="text-sm font-semibold">{s.name}</span>
            <span className="text-xs text-fg-55">{s.hex}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Type() {
  return (
    <Section id="tipo" title="Tipografía · Inter">
      <p className="title-display text-[40px]">Taxi 24/7</p>
      <p className="title-display text-[32px] italic">
        Tu <span className="text-ivancar-yellow">IVANCAR</span> llegó
      </p>
      <p className="text-[16px] text-fg-80">
        Cuerpo Inter 400 a 16 px. Frases cortas, directas, sin tecnicismos. Pide tu taxi en segundos y sigue tu unidad
        en vivo.
      </p>
      <p className="label-caps text-ivancar-yellow">Etiqueta en mayúsculas con tracking amplio</p>
    </Section>
  );
}

function Buttons() {
  const [state, setState] = useState<ButtonState>('idle');
  const [morphState, setMorphState] = useState<ButtonState>('idle');

  const run = (set: (s: ButtonState) => void) => {
    set('loading');
    window.setTimeout(() => set('success'), 1400);
    window.setTimeout(() => set('idle'), 2900);
  };

  return (
    <Section id="botones" title="Botones">
      <div className="flex flex-wrap items-center gap-3">
        <Button>Primario</Button>
        <Button variant="secondary">Secundario</Button>
        <Button variant="ghost">Ghost</Button>
        <Button disabled>Deshabilitado</Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" trailingIcon={<IconArrowRight size={20} />}>
          Pedir taxi
        </Button>
        <ButtonLink href={whatsappHref()} variant="secondary" leadingIcon={<IconWhatsApp size={20} className="text-[#25D366]" />}>
          Solicitar taxi por WhatsApp
        </ButtonLink>
        <ButtonLink href={telHref} variant="ghost" leadingIcon={<IconPhone size={18} />}>
          Llamar ahora
        </ButtonLink>
      </div>
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-fg-65">Estados: idle → loading → success (con y sin morph).</p>
        <Button
          fullWidth
          size="lg"
          state={state}
          loadingLabel="Buscando unidad"
          successLabel="Unidad asignada"
          onClick={() => run(setState)}
          data-testid="btn-states"
        >
          Probar estados
        </Button>
        <div className="flex justify-center">
          <Button
            size="lg"
            morph
            state={morphState}
            loadingLabel="Pidiendo taxi"
            successLabel="Taxi pedido"
            onClick={() => run(setMorphState)}
            trailingIcon={<IconArrowRight size={20} />}
            data-testid="btn-morph"
          >
            Pedir taxi
          </Button>
        </div>
      </Card>
    </Section>
  );
}

const services = ['Taxi normal', 'Taxi ejecutivo', 'SUV y camionetas'];

function Cards() {
  const [selected, setSelected] = useState(0);
  return (
    <Section id="tarjetas" title="Tarjetas">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="font-bold">Surface</p>
          <p className="text-sm text-fg-55">#0C0C0C, borde 10 %</p>
        </Card>
        <Card variant="raised">
          <p className="font-bold">Raised</p>
          <p className="text-sm text-fg-55">#151515</p>
        </Card>
        <Card variant="outline">
          <p className="font-bold">Outline</p>
          <p className="text-sm text-fg-55">Borde 15 %</p>
        </Card>
      </div>
      <div role="radiogroup" aria-label="Tipo de servicio" className="grid gap-3 sm:grid-cols-3">
        {services.map((s, i) => (
          <Card
            key={s}
            interactive
            selected={selected === i}
            role="radio"
            aria-checked={selected === i}
            tabIndex={0}
            onClick={() => setSelected(i)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected(i))}
            className="flex items-center gap-3"
          >
            <span className="grid size-10 place-items-center rounded-full bg-white/5 text-ivancar-yellow">
              <IconCar />
            </span>
            <span className="font-bold">{s}</span>
          </Card>
        ))}
      </div>
      <HeroCard
        image={asset('img/hero-1200.webp')}
        imageSrcSet={`${asset('img/hero-640.webp')} 640w, ${asset('img/hero-1200.webp')} 1200w`}
        imageSizes="(min-width: 768px) 720px, 100vw"
        imageAlt="Servicio ejecutivo de IVANCAR junto a un vehiculo"
        className="h-[360px]"
      >
        <Eyebrow>Taxi 24/7</Eyebrow>
        <p className="title-display mt-3 text-[34px]">Tu taxi, cuando lo necesitas</p>
        <div className="mt-5">
          <Button>Pedir taxi</Button>
        </div>
      </HeroCard>
    </Section>
  );
}

function Eyebrows() {
  return (
    <Section id="eyebrows" title="Eyebrow">
      <div className="flex flex-wrap gap-3">
        <Eyebrow>Taxi 24/7</Eyebrow>
        <Eyebrow live>En vivo</Eyebrow>
        <Eyebrow tone="neutral">Tarifa referencial de demo</Eyebrow>
      </div>
    </Section>
  );
}

function Skeletons() {
  return (
    <Section id="skeletons" title="Skeleton">
      <Card className="flex items-center gap-4">
        <Skeleton shape="circle" className="size-14" />
        <SkeletonText lines={3} className="flex-1" />
      </Card>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton shape="card" className="h-24" />
        <Skeleton shape="card" className="h-24" />
        <Skeleton shape="card" className="h-24" />
      </div>
    </Section>
  );
}

function Toasts() {
  const toast = useToast();
  return (
    <Section id="toasts" title="Toast">
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => toast.show({ title: 'Ubicación actualizada', description: 'Samborondón, junto a Plaza Lagos.' })}>
          Info
        </Button>
        <Button variant="secondary" onClick={() => toast.show({ tone: 'success', title: 'Tu IVANCAR llegó', description: 'Placa GSA-0000 · Te espera afuera.' })}>
          Éxito
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            toast.show({
              tone: 'warning',
              title: 'Pedido sin asignar',
              description: 'Lleva 2 min esperando unidad.',
              action: { label: 'Reasignar', onClick: () => toast.show({ tone: 'success', title: 'Reasignado' }) },
            })
          }
        >
          Alerta
        </Button>
        <Button variant="secondary" onClick={() => toast.show({ tone: 'error', title: 'Sin conexión', description: 'Revisa tu internet e inténtalo otra vez.' })}>
          Error
        </Button>
      </div>
    </Section>
  );
}

function Sheet() {
  const [snap, setSnap] = useState<SheetSnap>('half');
  return (
    <Section id="sheet" title="Bottom sheet">
      <div className="flex flex-wrap items-center gap-2">
        {(['peek', 'half', 'full'] as SheetSnap[]).map((s) => (
          <Button key={s} variant={snap === s ? 'primary' : 'secondary'} onClick={() => setSnap(s)}>
            {s}
          </Button>
        ))}
        <span className="ml-auto text-sm text-fg-55">
          Snap actual: <strong data-testid="sheet-snap" className="text-fg">{snap}</strong>
        </span>
      </div>
      <div
        data-testid="sheet-frame"
        className="relative mx-auto h-[640px] w-full max-w-[390px] overflow-hidden rounded-[40px] border border-line-strong"
      >
        <MapBackdrop />
        <BottomSheet
          aria-label="Ejemplo de bottom sheet"
          snap={snap}
          onSnapChange={setSnap}
          header={
            <div>
              <Eyebrow live>Unidad asignada</Eyebrow>
              <p className="title-display mt-3 text-[28px]">Llega en 4 min</p>
            </div>
          }
          footer={
            <Button fullWidth size="lg">
              Compartir viaje
            </Button>
          }
        >
          <div className="flex flex-col gap-3 pb-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Card key={i} variant="raised" padding="sm" className="flex items-center gap-3">
                <Skeleton shape="circle" className="size-10" />
                <SkeletonText lines={2} className="flex-1" />
              </Card>
            ))}
          </div>
        </BottomSheet>
      </div>
    </Section>
  );
}
