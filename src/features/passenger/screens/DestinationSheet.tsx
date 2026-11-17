import { useMemo, useRef, useState } from 'react';
import { Button, IconClose, IconMap, IconPin, IconSearch, Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import { haversine } from '@/lib/geo';
import { SEARCH_MIN_CHARS, useDirectSearch, type AddressState, type DirectResult } from '@/lib/geocode';
import { places, savedPlaces, suggestPlaces } from '@/mocks/places';
import { useRide } from '@/store/rideStore';
import type { LatLng, Place, PlaceCategory } from '@/types';
import { toLatLng } from '@/types';
import { normalize, useStepFocus } from '../hooks';
import { IconButton, PlaceIcon, SheetTitle } from '../parts';
import { SheetContent } from '../SheetSlots';
import { placeSpot, savedSpot } from './HomeSheet';

interface Category {
  id: string;
  label: string;
  match: (p: Place) => boolean;
}

const CATEGORIES: Category[] = [
  { id: 'transporte', label: 'Aeropuerto y terminal', match: (p) => p.category === 'airport' || p.category === 'bus_terminal' },
  { id: 'malls', label: 'Centros comerciales', match: (p) => p.category === 'mall' },
  { id: 'paseos', label: 'Paseos', match: (p) => p.category === 'landmark' || p.category === 'nature' },
  { id: 'estudio', label: 'Universidad y oficinas', match: (p) => p.category === 'university' || p.category === 'business' },
  { id: 'costa', label: 'Vía a la Costa', match: (p) => p.zone === 'via_costa' },
];

const CATEGORY_WORDS: Record<PlaceCategory, string> = {
  airport: 'aeropuerto avion vuelo',
  bus_terminal: 'terminal bus buses',
  mall: 'centro comercial mall compras',
  landmark: 'paseo turismo parque',
  university: 'universidad',
  residential: 'urbanizacion casa',
  business: 'oficina negocios restaurantes',
  nature: 'naturaleza bosque',
};

const ZONE_WORDS = { samborondon: 'samborondon', guayaquil: 'guayaquil', via_costa: 'via a la costa' } as const;

/** Índice de búsqueda: nombre, nombre corto, sector, referencia, categoría y zona. */
const index = places.map((p) => ({
  place: p,
  text: normalize([p.name, p.short_name, p.sector, p.address_hint, CATEGORY_WORDS[p.category], ZONE_WORDS[p.zone]].join(' ')),
}));
const savedIndex = savedPlaces.map((s) => ({ saved: s, text: normalize([s.label, s.address_hint, s.sector].join(' ')) }));

/** Todas las palabras de la consulta deben aparecer (en cualquier orden). */
function search(q: string) {
  const words = normalize(q).split(' ').filter(Boolean);
  if (!words.length) return { places: [], saved: [] };
  const hit = (t: string) => words.every((w) => t.includes(w));
  return {
    saved: savedIndex.filter((x) => hit(x.text)).map((x) => x.saved),
    places: index
      .filter((x) => hit(x.text))
      .map((x) => x.place)
      .sort((a, b) => b.popularity - a.popularity),
  };
}

/** P2 · Destino: buscador, categorías, lugares guardados y "Elegir en el mapa". */
export function DestinationSheet({
  destAddress,
  destMoving,
  destPoint,
}: {
  destAddress: AddressState | null;
  destMoving: boolean;
  destPoint: LatLng | null;
}) {
  const mapPick = useRide((s) => s.mapPick);
  return mapPick ? <MapPick address={destAddress} moving={destMoving} point={destPoint} /> : <SearchList />;
}

function SearchList() {
  const back = useRide((s) => s.back);
  const setMapPick = useRide((s) => s.setMapPick);
  const choose = useRide((s) => s.chooseDestination);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useStepFocus(inputRef);

  const results = useMemo(() => search(q), [q]);
  const direct = useDirectSearch(q);
  // Resultados reales: se descartan los que ya salen del catálogo local (mismo sitio, <150 m).
  const remote = useMemo(
    () => direct.results.filter((r) => !results.places.some((p) => haversine([r.lat, r.lng], toLatLng(p)) < 150)),
    [direct.results, results.places],
  );
  const suggested = useMemo(() => suggestPlaces(new Date(), 8), []);
  const category = CATEGORIES.find((c) => c.id === cat) ?? null;
  const browsing = !q.trim();
  const list = browsing ? (category ? places.filter(category.match) : suggested) : results.places;
  const localCount = results.places.length + results.saved.length;
  const searching = !browsing && q.trim().length >= SEARCH_MIN_CHARS;
  const empty = !browsing && localCount === 0 && remote.length === 0;
  const pickFirst = () => {
    if (results.places[0]) choose(placeSpot(results.places[0]));
    else if (remote[0]) choose(directSpot(remote[0]));
  };

  return (
    <SheetContent
      stepKey="destination"
      header={
        <div>
          <SheetTitle title="¿A dónde vas?" onBack={back} focus={false} />
          <div className="relative mt-4">
            <label htmlFor="dest-search" className="sr-only">
              Buscar destino
            </label>
            <IconSearch size={20} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-ivancar-yellow" />
            <input
              ref={inputRef}
              id="dest-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') pickFirst();
              }}
              placeholder="Aeropuerto, mall, Malecón…"
              className="h-14 w-full rounded-full border border-line-strong bg-surface-raised pl-14 pr-14 text-[16px] text-fg outline-none transition-colors placeholder:text-fg-55 focus:border-ivancar-yellow [&::-webkit-search-cancel-button]:hidden"
              aria-describedby="dest-count"
            />
            {q && (
              <IconButton
                label="Borrar búsqueda"
                onClick={() => {
                  setQ('');
                  inputRef.current?.focus();
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 border-0 bg-transparent"
              >
                <IconClose size={18} />
              </IconButton>
            )}
          </div>
          <p id="dest-count" className="sr-only" aria-live="polite">
            {browsing
              ? ''
              : empty
                ? direct.loading
                  ? 'Buscando'
                  : direct.failed
                    ? 'No se pudo buscar'
                    : 'Sin resultados'
                : `${localCount + remote.length} resultados${searching && direct.loading ? ', buscando más' : ''}`}
          </p>
        </div>
      }
      footer={
        <Button fullWidth size="lg" variant="secondary" leadingIcon={<IconMap size={20} />} onClick={() => setMapPick(true)} data-testid="pick-on-map">
          Elegir en el mapa
        </Button>
      }
    >
      {browsing && (
        <div role="group" aria-label="Categorías" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 pt-1 [scrollbar-width:none]">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={cat === c.id}
              onClick={() => setCat(cat === c.id ? null : c.id)}
              className={cn(
                'h-11 shrink-0 rounded-full border px-4 text-[14px] font-semibold transition-colors',
                cat === c.id ? 'border-ivancar-yellow bg-ivancar-yellow text-on-yellow' : 'border-line-strong text-fg-80 hover:border-fg-55',
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {empty ? (
        <div className="flex flex-col items-center px-4 pb-8 pt-10 text-center" data-testid="dest-empty">
          <span className="grid size-14 place-items-center rounded-full bg-white/[0.06] text-ivancar-yellow">
            <IconPin size={26} />
          </span>
          {searching && direct.loading ? (
            <>
              <p className="mt-4 text-[17px] font-bold">Buscando “{q.trim()}”…</p>
              <Skeleton className="mt-3 h-3 w-44" />
            </>
          ) : searching && direct.failed ? (
            <>
              <p className="mt-4 text-[17px] font-bold">No pudimos buscar direcciones</p>
              <p className="mt-1 max-w-[280px] text-[14px] text-fg-65">
                {typeof navigator !== 'undefined' && navigator.onLine === false ? 'Sin conexión. ' : 'El buscador no respondió. '}
                Prueba con un lugar de la lista o marca el punto en el mapa.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 text-[17px] font-bold">No encontramos “{q.trim()}”</p>
              <p className="mt-1 max-w-[280px] text-[14px] text-fg-65">
                {q.trim().length < SEARCH_MIN_CHARS
                  ? 'Escribe al menos 3 letras, o marca el punto en el mapa.'
                  : 'Prueba con otro nombre o una calle, como “aeropuerto” o “Av. Francisco de Orellana”, o marca el punto en el mapa.'}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="pb-4">
          {(browsing ? !category : results.saved.length > 0) && (
            <section aria-labelledby="h-tus-lugares" className="mt-4">
              <h3 id="h-tus-lugares" className="label-caps text-fg-55">
                Tus lugares
              </h3>
              <ul className="mt-1">
                {(browsing ? savedPlaces : results.saved).map((s) => (
                  <li key={s.id}>
                    <PlaceRow icon={<PlaceIcon kind={s.kind} />} title={s.label} subtitle={s.address_hint} onClick={() => choose(savedSpot(s))} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="h-lista" className="mt-4">
            <h3 id="h-lista" className="label-caps text-fg-55">
              {browsing ? (category ? category.label : 'Sugeridos ahora') : 'Resultados'}
            </h3>
            <ul className="mt-1" data-testid="dest-results">
              {list.map((p) => (
                <li key={p.id}>
                  <PlaceRow
                    icon={<PlaceIcon category={p.category} />}
                    title={p.name}
                    subtitle={`${p.sector} · ${p.address_hint}`}
                    onClick={() => choose(placeSpot(p))}
                  />
                </li>
              ))}
            </ul>
          </section>
          {!browsing && (remote.length > 0 || (searching && direct.loading)) && (
            <section aria-labelledby="h-reales" className="mt-4">
              <h3 id="h-reales" className="label-caps text-fg-55">
                Direcciones y lugares
                {direct.loading && <span className="ml-2 normal-case tracking-normal text-fg-55">· buscando…</span>}
              </h3>
              <ul className="mt-1" data-testid="dest-remote">
                {remote.map((r) => (
                  <li key={r.id}>
                    <PlaceRow icon={<IconPin size={20} />} title={r.title} subtitle={r.subtitle} onClick={() => choose(directSpot(r))} />
                  </li>
                ))}
                {remote.length === 0 && direct.loading && (
                  <li aria-hidden className="px-1 py-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="mt-1.5 h-3 w-28" />
                  </li>
                )}
              </ul>
            </section>
          )}
          {searching && direct.failed && (
            <p className="mt-3 text-[13px] text-fg-55" data-testid="dest-offline">
              No pudimos buscar más direcciones ahora. Puedes marcar el punto en el mapa.
            </p>
          )}
        </div>
      )}
    </SheetContent>
  );
}

const directSpot = (r: DirectResult) => ({ lat: r.lat, lng: r.lng, label: r.title, sublabel: r.subtitle });

function PlaceRow({ icon, title, subtitle, onClick }: { icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl px-1 py-2 text-left transition-colors hover:bg-white/5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/[0.06] text-ivancar-yellow">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{title}</span>
        <span className="block truncate text-[13px] text-fg-55">{subtitle}</span>
      </span>
    </button>
  );
}

/** Elegir el destino moviendo el mapa. */
function MapPick({ address, moving, point }: { address: AddressState | null; moving: boolean; point: LatLng | null }) {
  const back = useRide((s) => s.back);
  const choose = useRide((s) => s.chooseDestination);
  const ready = !!address && !!point && !moving;
  return (
    <SheetContent
      stepKey="destination-map"
      header={<SheetTitle title="Elige tu destino" subtitle="Mueve el mapa hasta el punto exacto." onBack={back} />}
      footer={
        <Button
          fullWidth
          size="lg"
          disabled={!ready}
          onClick={() => {
            if (point && address) choose({ lat: point[0], lng: point[1], label: address.title, sublabel: address.subtitle });
          }}
          data-testid="confirm-map-destination"
        >
          Confirmar destino
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-raised p-3.5" aria-live="polite">
        <span aria-hidden className="size-[11px] shrink-0 rounded-[3px] bg-white" />
        <span className="min-w-0 flex-1">
          {ready && address ? (
            <>
              <span className="block truncate text-[15px] font-semibold">{address.title}</span>
              <span className="block truncate text-[13px] text-fg-55">{address.subtitle}</span>
            </>
          ) : (
            <>
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-1.5 h-3 w-24" />
            </>
          )}
        </span>
      </div>
    </SheetContent>
  );
}
