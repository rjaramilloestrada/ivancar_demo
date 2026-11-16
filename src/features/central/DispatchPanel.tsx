import './central.css';

import { useEffect, useMemo, useState } from 'react';
import { DemoBanner } from '@/components/brand/DemoBanner';
import { Logo } from '@/components/brand/Logo';
import { Eyebrow, IconAlert, IconCar, IconClock, IconMap } from '@/components/ui';
import { cn } from '@/lib/cn';
import { simTimings } from '@/lib/simConfig';
import { computeAlerts, computeKpis, dispatchEvents, orderCode, useDispatch, type DispatchMode } from '@/store/dispatchStore';
import { useNow } from '../passenger/hooks';
import { central } from './commands';
import { DetailPanel } from './DetailPanel';
import { FleetMap } from './FleetMap';
import { OrdersColumn } from './OrdersList';
import { MODE_LABEL, shortDuration } from './status';
import { useCentralUi } from './uiStore';
import { useDispatchSimulation } from './useDispatchSimulation';

/** Ancho del panel de detalle sobre el mapa (escritorio / tableta) y su margen. */
const DETAIL_W = 360;
const DETAIL_W_TABLET = 320;
const DETAIL_GAP = 16;

/** true si el viewport mide al menos `px` de ancho (se actualiza al cambiar). */
function useMinWidth(px: number) {
  const q = `(min-width: ${px}px)`;
  const [ok, setOk] = useState(() => typeof matchMedia === 'undefined' || matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const on = () => setOk(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return ok;
}

/** Escritorio/tableta (≥ 768 px): lista y mapa lado a lado. Móvil: pestañas. */
const useWide = () => useMinWidth(768);

/**
 * Central de despacho (`#/central`): cola de pedidos en vivo con alertas, mapa de flota,
 * asignación automática o manual, reasignación e indicadores. Una sola pantalla pensada
 * para escritorio y tableta; en el teléfono se reparte en dos pestañas.
 */
export default function DispatchPanel() {
  useDispatchSimulation();
  const wide = useWide();
  const tab = useCentralUi((s) => s.tab);
  const setTab = useCentralUi((s) => s.setTab);
  const hasDetail = useDispatch((s) => !!(s.selectedOrderId || s.selectedUnitId));
  const mode = useDispatch((s) => s.mode);
  const detailW = useMinWidth(1280) ? DETAIL_W : DETAIL_W_TABLET;

  useEffect(() => {
    const prev = document.title;
    document.title = 'Central de despacho · IVANCAR';
    return () => {
      document.title = prev;
    };
  }, []);

  // En móvil, elegir una unidad en el mapa o un pedido lleva a la pestaña del mapa.
  useEffect(
    () =>
      useDispatch.subscribe((s, p) => {
        if (!wide && s.selectedUnitId && s.selectedUnitId !== p.selectedUnitId) setTab('map');
      }),
    [wide, setTab],
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ivancar-black" data-testid="central" data-mode={mode}>
      <h1 className="sr-only">Central de despacho IVANCAR</h1>
      <CentralHeader />
      <div className="-mt-1 px-4 pb-2.5 md:hidden">
        <DemoBanner className="border border-line" />
      </div>
      <KpiBar />

      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,380px)_1fr] gap-4 px-4 pb-4 lg:grid-cols-[400px_1fr] xl:grid-cols-[430px_1fr]">
          <OrdersColumn className="min-h-0" />
          <section aria-label="Mapa de flota" className="relative min-h-0 overflow-hidden rounded-[24px] border border-line">
            <FleetMap insetRight={hasDetail ? detailW + DETAIL_GAP * 2 : 0} />
            <MapLegend />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 flex flex-col p-4" style={{ width: detailW + DETAIL_GAP * 2 }}>
              <DetailPanel className="min-h-0" />
            </div>
          </section>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div role="tablist" aria-label="Vista" className="mx-4 mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-full border border-line-strong p-1">
            {(['orders', 'map'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn('h-10 rounded-full text-[14px] font-bold transition-colors', tab === t ? 'bg-ivancar-yellow text-on-yellow' : 'text-fg-75')}
                data-testid={`tab-${t}`}
              >
                {t === 'orders' ? 'Pedidos' : 'Mapa de flota'}
              </button>
            ))}
          </div>
          {tab === 'orders' ? (
            <div className="flex min-h-0 flex-1 flex-col px-4">
              <OrdersColumn className="min-h-0 flex-1" />
            </div>
          ) : (
            <section aria-label="Mapa de flota" className="relative mx-4 mb-4 min-h-0 flex-1 overflow-hidden rounded-[20px] border border-line">
              <FleetMap insetBottom={hasDetail ? 300 : 0} />
              <MapLegend />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex max-h-[62%] flex-col p-2">
                <DetailPanel className="min-h-0" />
              </div>
            </section>
          )}
        </div>
      )}

      <LiveAnnouncer />
    </div>
  );
}

/* ------------------------------------------------------------------ Cabecera */

function CentralHeader() {
  return (
    <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] md:gap-5 md:px-5">
      <Logo height={22} />
      <span aria-hidden className="hidden h-6 w-px bg-line-strong sm:block" />
      <p className="label-caps hidden whitespace-nowrap text-fg-75 sm:block">Central de despacho</p>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden md:block">
          <DemoBanner className="border border-line" />
        </span>
        <LiveClock />
        <ModeToggle />
      </div>
    </header>
  );
}

function LiveClock() {
  const now = useNow(1000);
  return (
    <span className="hidden items-center gap-2 lg:flex">
      <Eyebrow live tone="neutral">
        En vivo
      </Eyebrow>
      <span className="w-[4.6em] text-[13px] font-semibold tabular-nums text-fg-75" aria-label="Hora">
        {new Date(now).toLocaleTimeString('es-EC', { hour12: false })}
      </span>
    </span>
  );
}

function ModeToggle() {
  const mode = useDispatch((s) => s.mode);
  const options: DispatchMode[] = ['auto', 'manual'];
  return (
    <div role="radiogroup" aria-label="Modo de asignación" className="flex items-center gap-1 rounded-full border border-line-strong p-1">
      <span className="hidden pl-2 pr-1 text-[12px] font-semibold text-fg-55 xl:inline">Asignación</span>
      {options.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => central.setMode(m)}
          className={cn(
            'h-8 rounded-full px-3.5 text-[13px] font-bold transition-colors',
            mode === m ? 'bg-ivancar-yellow text-on-yellow' : 'text-fg-75 hover:text-fg',
          )}
          data-testid={`mode-${m}`}
        >
          {MODE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- Indicadores */

function KpiBar() {
  const orders = useDispatch((s) => s.orders);
  const sessionStartedAt = useDispatch((s) => s.sessionStartedAt);
  const now = useNow(1000);
  const k = useMemo(() => computeKpis({ orders, sessionStartedAt }), [orders, sessionStartedAt]);
  const alerts = useMemo(() => computeAlerts(orders, now, simTimings()).length, [orders, now]);
  const tiles = [
    {
      id: 'active',
      label: 'Pedidos activos',
      short: 'Activos',
      value: String(k.active),
      hint: alerts ? `${alerts} con alerta` : 'En cola o en curso',
      icon: alerts ? IconAlert : IconClock,
      warn: alerts > 0,
    },
    { id: 'unassigned', label: 'Sin asignar', short: 'Sin asignar', value: String(k.unassigned), hint: 'Esperando unidad', icon: IconClock, warn: false },
    { id: 'units', label: 'Unidades disponibles', short: 'Unidades libres', value: String(k.unitsAvailable), hint: `de ${k.unitsTotal} en el mapa`, icon: IconCar },
    {
      id: 'avg',
      label: 'Asignación promedio',
      short: 'Asig. promedio',
      value: k.avgAssignMs == null ? '—' : shortDuration(k.avgAssignMs),
      hint: k.assignedCount ? `${k.assignedCount} ${k.assignedCount === 1 ? 'pedido' : 'pedidos'} en la sesión` : 'Aún sin asignaciones',
      icon: IconMap,
    },
  ];
  return (
    <dl className="grid shrink-0 grid-cols-2 gap-2 px-4 pb-3 md:grid-cols-4 md:gap-3 md:px-4 md:pb-4" aria-label="Indicadores de la sesión">
      {tiles.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-center gap-3 rounded-2xl border bg-surface px-4 py-2.5 md:py-3',
            t.warn ? 'border-ivancar-yellow/60' : 'border-line',
          )}
          data-testid={`kpi-${t.id}`}
        >
          <span
            aria-hidden
            className={cn('hidden size-9 shrink-0 place-items-center rounded-full xl:grid', t.warn ? 'bg-ivancar-yellow text-on-yellow' : 'bg-white/[0.06] text-ivancar-yellow')}
          >
            <t.icon size={18} />
          </span>
          <div className="min-w-0">
            <dt className="truncate text-[10.5px] font-bold uppercase tracking-[0.14em] text-fg-55">
              <span className="md:hidden">{t.short}</span>
              <span className="hidden md:inline">{t.label}</span>
            </dt>
            <dd className="flex min-w-0 items-baseline gap-2">
              <span className={cn('whitespace-nowrap text-[22px] font-black leading-tight tabular-nums md:text-[26px]', t.warn && 'text-ivancar-yellow')} data-testid={`kpi-${t.id}-value`}>
                {t.value}
              </span>
              <span className="hidden truncate text-[11.5px] text-fg-55 sm:inline">{t.hint}</span>
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------------- Leyenda */

function MapLegend() {
  const items = [
    { label: 'Disponible', cls: 'bg-ivancar-yellow' },
    { label: 'Ocupada', cls: 'bg-[#74777e]' },
    { label: 'En pedido', cls: 'bg-ivancar-yellow ring-2 ring-ivancar-yellow/50 ring-offset-2 ring-offset-black' },
    { label: 'Sin asignar', cls: 'bg-[#FFB547] ring-2 ring-[#FFB547]/40' },
  ];
  return (
    <ul
      aria-label="Leyenda del mapa"
      className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-line bg-black/85 px-3.5 py-2 text-[12px] text-fg-80"
    >
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden className={cn('size-2.5 rounded-full', i.cls)} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------- Anuncios accesibles */

/** Región `aria-live` discreta: pedidos nuevos desde la app y alertas. */
function LiveAnnouncer() {
  const [msg, setMsg] = useState('');
  useEffect(
    () =>
      dispatchEvents.on((e) => {
        if (e.type === 'order_received' && e.order.source === 'app') {
          setMsg(`Pedido nuevo desde la app, número ${orderCode(e.order.id)}: de ${e.order.ride.pickup_label} a ${e.order.ride.dropoff_label}.`);
        } else if (e.type === 'alert_raised') {
          const o = useDispatch.getState().orders.find((x) => x.id === e.alert.order_id);
          if (o) setMsg(`Alerta: pedido ${orderCode(o.id)} ${e.alert.kind === 'unassigned' ? 'sin unidad asignada' : 'con la unidad detenida'}.`);
        }
      }),
    [],
  );
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="central-live">
      {msg}
    </p>
  );
}
