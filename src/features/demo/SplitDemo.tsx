import { Link } from 'react-router';
import { DemoBanner } from '@/components/brand/DemoBanner';
import { Logo } from '@/components/brand/Logo';
import { Eyebrow, IconArrowRight } from '@/components/ui';

const appUrl = (route: string) => `${import.meta.env.BASE_URL}#${route}`;

/**
 * Vista de presentación: teléfono (app pasajero) + central lado a lado.
 * Ambas son la misma app en iframes del mismo origen, así que el BroadcastChannel
 * del bloque 2 conecta el pedido del teléfono con la central sin backend.
 */
export default function SplitDemo() {
  return (
    <div className="flex min-h-dvh flex-col bg-ivancar-black">
      <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-4">
          <Logo height={24} />
          <Eyebrow className="hidden sm:inline-flex">Demo en vivo</Eyebrow>
        </div>
        <DemoBanner />
      </header>

      {/* Pantallas grandes: lado a lado */}
      <main className="hidden flex-1 items-center gap-8 p-8 lg:flex">
        <h1 className="sr-only">Demo IVANCAR: app del pasajero y central de despacho</h1>
        <figure className="flex shrink-0 flex-col items-center gap-4">
          <div className="relative h-[min(844px,calc(100dvh-170px))] aspect-[390/844] overflow-hidden rounded-[48px] border-[10px] border-[#1b1b1b] bg-black shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9),0_0_0_1px_rgb(255_255_255/0.08)]">
            <iframe title="App del pasajero" src={appUrl('/')} className="size-full border-0" />
          </div>
          <figcaption className="label-caps text-fg-55">Pasajero</figcaption>
        </figure>

        <figure className="flex h-[min(844px,calc(100dvh-170px))] min-w-0 flex-1 flex-col gap-4">
          <div className="min-h-0 flex-1 overflow-hidden rounded-card border border-line-strong bg-black shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)]">
            <iframe title="Central de despacho" src={appUrl('/central')} className="size-full border-0" />
          </div>
          <figcaption className="label-caps text-center text-fg-55">Central IVANCAR</figcaption>
        </figure>
      </main>

      {/* Móvil y tablet vertical */}
      <main className="flex flex-1 flex-col justify-center gap-6 p-6 lg:hidden">
        <Eyebrow>Demo en vivo</Eyebrow>
        <h1 className="title-display text-[34px]">Ábrelo en una pantalla grande</h1>
        <p className="text-fg-65">
          Esta vista muestra el teléfono y la central lado a lado. En el celular puedes abrir cada una por separado.
        </p>
        <nav className="flex flex-col gap-2" aria-label="Vistas del demo">
          {[
            { to: '/', label: 'App del pasajero' },
            { to: '/central', label: 'Central de despacho' },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="flex min-h-14 items-center justify-between rounded-full border border-line-strong px-6 font-bold transition-colors hover:border-fg-55"
            >
              {l.label}
              <IconArrowRight size={20} className="text-ivancar-yellow" />
            </Link>
          ))}
        </nav>
      </main>
    </div>
  );
}
