import { DemoBanner } from '@/components/brand/DemoBanner';
import { Logo } from '@/components/brand/Logo';
import { MapBackdrop } from '@/components/map/MapBackdrop';
import { Card, Eyebrow, IconAlert, IconCar, IconClock, LoadingRegion, Skeleton } from '@/components/ui';

const kpis = [
  { label: 'Pedidos activos', icon: IconClock },
  { label: 'Unidades libres', icon: IconCar },
  { label: 'Alertas', icon: IconAlert },
];

/**
 * Panel central / operador (placeholder del bloque 1).
 * El bloque 4 lo reemplaza por DispatchPanel (OrdersList, FleetMap, Alerts).
 */
export default function CentralPlaceholder() {
  return (
    <div className="flex min-h-dvh flex-col bg-ivancar-black">
      <header className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-line bg-header px-5 pt-safe backdrop-blur-xl">
        <div className="flex h-16 items-center gap-4">
          <Logo height={24} />
          <span className="hidden h-6 w-px bg-line-strong sm:block" />
          <span className="label-caps hidden text-fg-75 sm:inline">Central de despacho</span>
        </div>
        <div className="flex items-center gap-3">
          <DemoBanner className="hidden md:inline-flex" />
          <Eyebrow live>En vivo</Eyebrow>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 gap-4 p-4 md:p-6 md:grid-cols-[minmax(300px,360px)_1fr]">
        <h1 className="sr-only">Central de despacho IVANCAR</h1>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {kpis.map(({ label, icon: Icon }) => (
              <Card key={label} padding="sm" className="flex flex-col gap-3">
                <Icon size={18} className="text-ivancar-yellow" />
                <Skeleton className="h-7 w-10" />
                <span className="text-xs leading-tight text-fg-55">{label}</span>
              </Card>
            ))}
          </div>

          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="title-display text-lg">Pedidos</h2>
              <Eyebrow tone="neutral">Tiempo real</Eyebrow>
            </div>
            <LoadingRegion label="Esperando pedidos">
              <ul className="flex flex-col">
                {[0, 1, 2, 3].map((i) => (
                  <li key={i} className="flex items-center gap-3 border-b border-line px-5 py-4 last:border-0">
                    <Skeleton shape="circle" className="size-10" />
                    <span className="flex flex-1 flex-col gap-2">
                      <Skeleton className="h-3.5 w-1/2" />
                      <Skeleton className="h-3 w-4/5" />
                    </span>
                    <Skeleton shape="pill" className="h-7 w-16" />
                  </li>
                ))}
              </ul>
            </LoadingRegion>
          </Card>
        </div>

        <Card padding="none" className="relative min-h-[420px] overflow-hidden">
          <MapBackdrop />
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-3 bg-gradient-to-t from-ivancar-black to-transparent p-6 pt-24">
            <Eyebrow>Flota</Eyebrow>
            <p className="title-display text-[28px] md:text-[36px]">Control de tu operación</p>
            <p className="max-w-md text-fg-65">
              Pedidos que entran en vivo, unidades en el mapa y alertas cuando un pedido espera demasiado.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}
