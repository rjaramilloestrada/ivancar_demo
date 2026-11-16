import { useEffect, useMemo, useState } from 'react';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { Button, IconArrowRight, IconStar } from '@/components/ui';
import { track } from '@/lib/analytics';
import { formatDistance, formatDuration } from '@/lib/geo';
import { DEMO_FARE_NOTICE, formatUSD } from '@/lib/pricing';
import { relativeDate } from '@/lib/relativeDate';
import { fleetById } from '@/mocks/drivers';
import { tripHistory } from '@/mocks/history';
import { getService } from '@/mocks/services';
import { useRide } from '@/store/rideStore';
import type { TripHistoryItem } from '@/types';
import { useNow } from '../hooks';
import { MiniRouteMap } from '../MiniRouteMap';
import { Avatar, PAYMENT_LABEL, RouteSummary, SheetTitle } from '../parts';
import { Receipt } from '../Receipt';
import { SheetContent } from '../SheetSlots';

const total = (t: TripHistoryItem) => (t.fare_final_usd ?? t.fare_estimate_usd) + (t.tip_usd ?? 0);

/**
 * P9 · Mis viajes. Primero los viajes de esta sesión (o un estado vacío diseñado), luego
 * los de ejemplo del demo. Cada tarjeta lleva un mini mapa SVG de la ruta (sin Leaflet).
 * El detalle muestra el recibo simulado y "Repetir viaje", que precarga ese destino.
 */
export function HistorySheet() {
  const close = useRide((s) => s.closeHistory);
  const session = useRide((s) => s.history);
  const [openId, setOpenId] = useState<string | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const examples = useMemo(() => tripHistory.filter((t) => !session.some((s) => s.id === t.id)), [session]);
  const open = openId ? (session.find((t) => t.id === openId) ?? tripHistory.find((t) => t.id === openId) ?? null) : null;

  if (open) {
    return (
      <TripDetail
        trip={open}
        fromSession={session.some((t) => t.id === open.id)}
        onBack={() => {
          setReturnTo(open.id);
          setOpenId(null);
        }}
      />
    );
  }
  return (
    <TripList
      session={session}
      examples={examples}
      returnTo={returnTo}
      onOpen={(id) => {
        setOpenId(id);
        track('history_trip_open');
      }}
      onClose={close}
    />
  );
}

/* ------------------------------------------------------------------ Lista */

function TripList({
  session,
  examples,
  returnTo,
  onOpen,
  onClose,
}: {
  session: TripHistoryItem[];
  examples: TripHistoryItem[];
  returnTo: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const now = useNow(30_000);

  // Al volver del detalle, el foco regresa a la tarjeta que se abrió.
  useEffect(() => {
    if (!returnTo) return;
    const t = setTimeout(() => document.querySelector<HTMLElement>(`[data-trip-id="${returnTo}"]`)?.focus({ preventScroll: false }), 80);
    return () => clearTimeout(t);
  }, [returnTo]);

  return (
    <SheetContent
      stepKey="history"
      header={<SheetTitle title="Mis viajes" subtitle="Tus recorridos, totales y recibos." onBack={onClose} focus={!returnTo} />}
      footer={
        <Button fullWidth size="lg" onClick={onClose}>
          Pedir un taxi
        </Button>
      }
    >
      <div className="pb-4">
        <h3 className="label-caps mb-2 text-fg-55">Tus viajes</h3>
        {session.length > 0 ? (
          <ul className="flex flex-col gap-2" data-testid="history-list">
            {session.map((t) => (
              <TripCard key={t.id} trip={t} now={now} onOpen={onOpen} recent />
            ))}
          </ul>
        ) : (
          <EmptyHistory />
        )}

        <h3 className="label-caps mb-2 mt-6 text-fg-55">Viajes de ejemplo</h3>
        <ul className="flex flex-col gap-2" data-testid="history-examples">
          {examples.map((t) => (
            <TripCard key={t.id} trip={t} now={now} onOpen={onOpen} />
          ))}
        </ul>
        <p className="mt-4 text-center text-[12px] text-fg-55">Datos de demostración · {DEMO_FARE_NOTICE.toLowerCase()}.</p>
      </div>
    </SheetContent>
  );
}

function TripCard({ trip: t, now, onOpen, recent }: { trip: TripHistoryItem; now: number; onOpen: (id: string) => void; recent?: boolean }) {
  const service = getService(t.service_id);
  return (
    <li>
      <button
        type="button"
        data-trip-id={t.id}
        onClick={() => onOpen(t.id)}
        className="flex w-full items-stretch gap-3 rounded-[20px] border border-line bg-surface-raised/40 p-2.5 text-left transition-colors hover:border-line-strong"
        aria-label={`Viaje ${relativeDate(t.completed_at ?? t.created_at, now)}, de ${t.pickup_label} a ${t.dropoff_label}, ${formatUSD(total(t))}. Ver detalle`}
      >
        <MiniRouteMap route={t.route} width={84} height={96} />
        <span className="flex min-w-0 flex-1 flex-col justify-between py-0.5 pr-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[12px] font-semibold text-fg-65">
              {recent && <span className="mr-1.5 text-ivancar-yellow">●</span>}
              {relativeDate(t.completed_at ?? t.created_at, now)}
            </span>
            <span className="shrink-0 text-[16px] font-black tabular-nums">{formatUSD(total(t))}</span>
          </span>
          <span className="mt-1 flex min-w-0 flex-col gap-0.5 text-[14px] leading-tight">
            <span className="truncate font-semibold">{t.pickup_label}</span>
            <span className="flex min-w-0 items-center gap-1 text-fg-80">
              <IconArrowRight size={13} className="shrink-0 text-ivancar-yellow" />
              <span className="truncate font-semibold" data-testid="trip-dropoff">
                {t.dropoff_label}
              </span>
            </span>
          </span>
          <span className="mt-1.5 flex items-center gap-1.5 text-[12px] text-fg-65">
            <ServiceIcon service={t.service_id} size={24} />
            <span className="min-w-0 truncate">{t.driver_display_name}</span>
            <span className="shrink-0 font-semibold text-fg-80">· {t.vehicle_plate}</span>
          </span>
          <span className="truncate text-[10.5px] text-fg-55">
            {service.name} · {DEMO_FARE_NOTICE}
          </span>
        </span>
      </button>
    </li>
  );
}

function EmptyHistory() {
  return (
    <div className="flex items-center gap-4 rounded-[20px] border border-dashed border-line-strong p-4" data-testid="history-empty">
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true" className="shrink-0">
        <rect width="72" height="72" rx="18" fill="#141415" />
        <path d="M18 52c8-2 6-16 18-18s14-14 18-18" fill="none" stroke="#F6C90E" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6" />
        <circle cx="18" cy="52" r="4.5" fill="#050505" stroke="#F6C90E" strokeWidth="2.4" />
        <rect x="50" y="12" width="9" height="9" rx="2" fill="#fff" />
      </svg>
      <div className="min-w-0">
        <p className="text-[16px] font-bold">Aún no tienes viajes</p>
        <p className="mt-1 text-[13px] leading-snug text-fg-65">Cuando termines tu primer viaje verás aquí la ruta, el total y el recibo.</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Detalle */

function TripDetail({ trip: t, fromSession, onBack }: { trip: TripHistoryItem; fromSession: boolean; onBack: () => void }) {
  const repeat = useRide((s) => s.repeatTrip);
  const unit = t.driver_id ? fleetById[t.driver_id] : null;
  const service = getService(t.service_id);
  const when = new Date(t.completed_at ?? t.created_at);

  return (
    <SheetContent
      stepKey={`history-${t.id}`}
      header={
        <SheetTitle
          eyebrow={relativeDate(when)}
          title={`A ${t.dropoff_label}`}
          subtitle={
            <>
              {service.name} · {PAYMENT_LABEL[t.payment_method]}
              {fromSession ? ' · Viaje de esta sesión' : ' · Viaje de ejemplo'}
            </>
          }
          onBack={onBack}
        />
      }
      footer={
        <Button
          fullWidth
          size="lg"
          onClick={() => {
            if (repeat(t)) track('history_repeat', { service: t.service_id });
          }}
          data-testid="repeat-trip"
        >
          Repetir viaje
        </Button>
      }
    >
      <div className="pb-4" data-testid="trip-detail">
        <MiniRouteMap route={t.route} width={342} height={150} className="h-auto w-full" />
        <div className="mt-3 rounded-[20px] border border-line p-4">
          <RouteSummary from={t.pickup_label} to={t.dropoff_label} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Distancia" value={formatDistance(t.distance_m)} />
          <Stat label="Duración" value={formatDuration(t.duration_s)} />
          <Stat
            label="Tu nota"
            value={
              t.rating ? (
                <span className="inline-flex items-center gap-1">
                  {t.rating}
                  <IconStar size={15} filled className="text-ivancar-yellow" />
                </span>
              ) : (
                '—'
              )
            }
          />
        </dl>
        {unit && (
          <div className="mt-3 flex items-center gap-3 rounded-[20px] border border-line p-3">
            <Avatar unit={unit} size={40} />
            <p className="min-w-0 flex-1 text-[14px] leading-tight">
              <span className="block truncate font-bold">{t.driver_display_name}</span>
              <span className="block truncate text-[12.5px] text-fg-65">
                {unit.vehicle.make} {unit.vehicle.model} · {unit.vehicle.color}
              </span>
            </p>
            <span className="rounded-md bg-white px-2 py-1 text-[13px] font-black tracking-[0.05em] text-black">{t.vehicle_plate}</span>
          </div>
        )}
        <Receipt className="mt-3" ride={t} tip={t.tip_usd ?? 0} unitLabel={`${t.vehicle_plate} · ${t.driver_display_name}`} data-testid="history-receipt" />
      </div>
    </SheetContent>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface-raised px-2 py-2.5">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-55">{label}</dt>
      <dd className="mt-0.5 text-[16px] font-black tabular-nums">{value}</dd>
    </div>
  );
}
