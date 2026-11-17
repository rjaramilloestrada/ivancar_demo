import { useMemo } from 'react';
import { Button, ButtonLink, Eyebrow, IconChevronRight, IconInfo, IconPhone, IconSearch, IconWhatsApp, Skeleton } from '@/components/ui';
import { track } from '@/lib/analytics';
import { formatDistance, haversine } from '@/lib/geo';
import type { AddressState } from '@/lib/geocode';
import { ROAD_FACTOR } from '@/lib/routing';
import { greeting } from '@/lib/greeting';
import { telHref, whatsappHref } from '@/lib/links';
import { savedPlaces, suggestPlaces } from '@/mocks/places';
import { useRide, type Spot } from '@/store/rideStore';
import type { Place, SavedPlace } from '@/types';
import { PlaceIcon, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';
import { fallbackRequestText } from '../share';

export type GeoStatus = 'pending' | 'granted' | 'denied' | 'unavailable' | 'outside';

export const placeSpot = (p: Place): Spot => ({
  lat: p.lat,
  lng: p.lng,
  label: p.short_name,
  sublabel: `${p.sector} · ${p.address_hint}`,
  place_id: p.id,
});

export const savedSpot = (s: SavedPlace): Spot => ({
  lat: s.lat,
  lng: s.lng,
  label: s.label,
  sublabel: s.address_hint,
  place_id: s.id,
});

/** P1 · Inicio: saludo, recogida en vivo y destinos de un toque. */
export function HomeSheet({
  address,
  moving,
  geo,
  onRetryGeo,
}: {
  address: AddressState | null;
  moving: boolean;
  geo: GeoStatus;
  /** Reintenta la geolocalización. Si no se pasa, no se ofrece la acción. */
  onRetryGeo?: () => void;
}) {
  const pickup = useRide((s) => s.pickup);
  const openDestination = useRide((s) => s.openDestination);
  const chooseDestination = useRide((s) => s.chooseDestination);
  // Bloque 5: sugerencias animadas según hora y día (suggestPlaces ya ordena por contexto).
  const suggestions = useMemo(() => suggestPlaces(new Date(), 4), []);

  const ready = !!pickup && !moving;
  const pick = (spot: Spot) => {
    if (ready) chooseDestination(spot);
  };
  // Distancia por calle aproximada: la línea recta se escala con el factor vial de las rutas de respaldo.
  const dist = (p: { lat: number; lng: number }) =>
    pickup ? `≈ ${formatDistance(haversine([pickup.lat, pickup.lng], [p.lat, p.lng]) * ROAD_FACTOR)}` : '';

  return (
    <SheetContent
      stepKey="home"
      header={
        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg-65">{greeting()},</p>
            <Eyebrow live className="py-1">
              Taxi 24/7
            </Eyebrow>
          </div>
          <SheetTitle title="¿A dónde vamos?" size="lg" className="mt-1" />
          <div className="mt-3 flex items-center gap-3 rounded-2xl border border-line bg-surface-raised px-3.5 py-2.5" aria-live="polite">
            <span aria-hidden className="size-[11px] shrink-0 rounded-full border-2 border-ivancar-yellow" />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-fg-55">Te recogemos en</span>
              {address && !moving ? (
                <span className="block truncate text-[15px] font-semibold" data-testid="pickup-label">
                  {address.title}
                </span>
              ) : (
                <Skeleton className="mt-1 h-4 w-40" />
              )}
              {(geo === 'denied' || geo === 'unavailable') && (
                <span className="mt-0.5 flex min-h-6 items-center gap-1 text-[12px] text-fg-55" data-testid="geo-approx">
                  <IconInfo size={12} className="shrink-0 text-ivancar-yellow" />
                  <span className="truncate">Ubicación aproximada ·{onRetryGeo ? '' : ' mueve el mapa'}</span>
                  {onRetryGeo && (
                    // En la misma línea: no empuja los destinos sugeridos hacia abajo.
                    <button
                      type="button"
                      onClick={onRetryGeo}
                      className="-my-1 inline-flex min-h-6 shrink-0 items-center px-0.5 font-semibold text-ivancar-yellow underline-offset-2 hover:underline"
                      data-testid="retry-geo"
                    >
                      Usar mi ubicación
                    </button>
                  )}
                </span>
              )}
            </span>
          </div>
        </div>
      }
      footer={
        <Button fullWidth size="lg" leadingIcon={<IconSearch size={20} />} onClick={openDestination} data-testid="cta-destination">
          ¿A dónde vas?
        </Button>
      }
    >
      <section aria-labelledby="h-guardados" className="pt-1">
        <h3 id="h-guardados" className="sr-only">
          Tus lugares
        </h3>
        <div className="flex gap-2">
          {savedPlaces.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={!ready}
              onClick={() => pick(savedSpot(s))}
              className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-line-strong bg-surface-raised px-4 text-left text-[15px] font-semibold transition-colors hover:border-fg-55 disabled:opacity-60"
              data-testid="saved-place"
            >
              <span className="text-ivancar-yellow">
                <PlaceIcon kind={s.kind} />
              </span>
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="h-sugeridos" className="mt-5">
        <h3 id="h-sugeridos" className="label-caps text-fg-55">
          Sugeridos ahora
        </h3>
        <ul className="mt-2 flex flex-col">
          {suggestions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!ready}
                onClick={() => pick(placeSpot(p))}
                className="group flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-1 py-2 text-left transition-colors hover:bg-white/5 disabled:opacity-60"
                data-testid="suggested-place"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-ivancar-yellow">
                  <PlaceIcon category={p.category} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{p.short_name}</span>
                  <span className="block truncate text-[13px] text-fg-55">{p.sector}</span>
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-fg-55">{dist(p)}</span>
                <IconChevronRight size={18} className="shrink-0 text-fg-55 transition-transform group-hover:translate-x-0.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-canales" className="mt-6 pb-4">
        <h3 id="h-canales" className="label-caps text-fg-55">
          ¿Prefieres hablar con nosotros?
        </h3>
        <div className="mt-3 flex flex-col gap-2">
          <ButtonLink
            href={whatsappHref(fallbackRequestText(pickup?.label))}
            variant="secondary"
            fullWidth
            leadingIcon={<IconWhatsApp size={20} className="text-[#25D366]" />}
            onClick={() => track('whatsapp_fallback_click', { from: 'home' })}
            data-testid="fallback-whatsapp"
          >
            Solicitar taxi por WhatsApp
          </ButtonLink>
          <ButtonLink
            href={telHref}
            variant="ghost"
            fullWidth
            leadingIcon={<IconPhone size={18} />}
            onClick={() => track('call_click', { from: 'home' })}
            data-testid="fallback-call"
          >
            Llamar ahora
          </ButtonLink>
        </div>
      </section>
    </SheetContent>
  );
}
