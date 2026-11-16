import { AnimatePresence, useReducedMotion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AppHeader } from '@/components/brand/AppHeader';
import { DemoBanner } from '@/components/brand/DemoBanner';
import {
  AnimatedNumber,
  ArrivalBanner,
  Confetti,
  EnterHighlight,
  InstallPrompt,
  PageTransition,
  PulseAlert,
  RadarPulse,
  RadarPulseMarker,
  SelectCard,
  SelectGlowGroup,
  Splash,
  Stagger,
  StaggerItem,
  StarRating,
  type ConfettiHandle,
} from '@/components/fx';
import { MapView, PickupMarker } from '@/components/map';
import { ServiceIcon } from '@/components/services/ServiceIcon';
import { Button, Eyebrow, IconCar, type ButtonState } from '@/components/ui';
import { Avatar, Plate, Rating } from '@/features/passenger/parts';
import { canVibrate, hapticPatterns, vibrate, type HapticName } from '@/lib/haptics';
import { resetInstallDismiss, useInstall } from '@/lib/install';
import { fleet } from '@/mocks/drivers';
import { map as mapTokens } from '@/theme/tokens';
import type { ServiceId } from '@/types';

/**
 * #/fx-lab — catálogo de la capa de animación (components/fx). Cada efecto tiene un botón
 * para dispararlo. Interno: no forma parte del flujo del pasajero.
 * `?stress=1` arranca confetti en bucle + radar (para medir fps).
 */
export default function FxLab() {
  const reduce = useReducedMotion();
  const confetti = useRef<ConfettiHandle>(null);
  const stress = typeof location !== 'undefined' && /[?&]stress=1/.test(location.hash);

  useEffect(() => {
    if (!stress) return;
    const fire = () => confetti.current?.fire({ count: 140 });
    fire();
    const t = setInterval(fire, 900);
    return () => clearInterval(t);
  }, [stress]);

  return (
    <div className="min-h-dvh bg-ivancar-black">
      <AppHeader right={<DemoBanner />} />
      <Confetti ref={confetti} />
      <main className="mx-auto flex max-w-3xl flex-col gap-12 px-4 pb-32 pt-8">
        <div className="flex flex-col items-start gap-4">
          <Eyebrow live>Capa IGNIS</Eyebrow>
          <h1 className="title-display text-[40px]">Efectos IVANCAR</h1>
          <p className="max-w-prose text-fg-65">
            Cada animación orienta, confirma o tranquiliza. Solo transform y opacity (o canvas), y todas respetan
            reducir movimiento.
          </p>
          <p className="text-[13px] text-fg-55" data-testid="reduced-flag">
            Reducir movimiento: <strong className="text-fg">{reduce ? 'activado' : 'desactivado'}</strong>
          </p>
        </div>

        <SplashDemo />
        <RadarDemo stress={stress} />
        <NumberDemo />
        <Section id="fx-confetti" title="Confetti · fin del viaje">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => confetti.current?.fire()} data-testid="fire-confetti">
              Lanzar confetti
            </Button>
            <Button variant="secondary" onClick={() => confetti.current?.fire({ origin: { x: 0.5, y: 0.9 }, spread: 50, power: 1100 })}>
              Desde abajo
            </Button>
          </div>
          <Note>Canvas propio, ~1,5 s, tope 140 partículas. Con reducir movimiento no se dispara.</Note>
        </Section>
        <StarsDemo />
        <StaggerDemo />
        <MorphDemo />
        <SelectDemo />
        <ArrivalDemo />
        <InstallDemo />
        <HapticsDemo />
        <PageDemo />
        <CentralDemo />
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4" data-testid={id}>
      <h2 id={id} className="label-caps border-b border-line pb-3 text-fg-55">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-snug text-fg-55">{children}</p>;
}

function SplashDemo() {
  const [n, setN] = useState(0);
  const [show, setShow] = useState(false);
  return (
    <Section id="fx-splash" title="Splash · faro">
      <Button
        onClick={() => {
          setN((x) => x + 1);
          setShow(true);
        }}
        data-testid="fire-splash"
      >
        Ver splash
      </Button>
      <Note>≤ 1,8 s, un toque lo salta, una vez por sesión con useSplashOnce(). Es un overlay: la app carga debajo.</Note>
      {show && <Splash key={n} onDone={() => setShow(false)} />}
    </Section>
  );
}

function RadarDemo({ stress }: { stress: boolean }) {
  const [on, setOn] = useState(true);
  const [mapOn, setMapOn] = useState(stress);
  return (
    <Section id="fx-radar" title="Radar · buscando unidad">
      <div className="relative grid h-64 place-items-center overflow-hidden rounded-[24px] border border-line bg-surface">
        <RadarPulse active={on} size={240} core />
        <p className="absolute bottom-3 left-0 right-0 text-center text-[13px] text-fg-65">
          Evaluando <AnimatedNumber value={on ? 7 : 0} className="font-bold text-fg" /> unidades cercanas
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOn((v) => !v)} data-testid="toggle-radar">
          {on ? 'Detener radar' : 'Iniciar radar'}
        </Button>
        <Button variant="secondary" onClick={() => setMapOn((v) => !v)} data-testid="toggle-radar-map">
          {mapOn ? 'Ocultar mapa' : 'Radar en el mapa'}
        </Button>
      </div>
      {mapOn && (
        <div className="relative h-72 overflow-hidden rounded-[24px] border border-line" data-testid="radar-map">
          <MapView center={mapTokens.defaultCenter} zoom={15} vignette={false} aria-label="Mapa con radar">
            {on && <RadarPulseMarker position={mapTokens.defaultCenter} size={260} />}
            <PickupMarker position={mapTokens.defaultCenter} />
          </MapView>
        </div>
      )}
      <Note>DOM: &lt;RadarPulse /&gt;. Mapa: &lt;RadarPulseMarker position=… /&gt; dentro de &lt;MapView&gt;. CSS puro, cero JS por frame.</Note>
    </Section>
  );
}

const PRICES: { id: ServiceId; name: string; amount: number }[] = [
  { id: 'taxi', name: 'Taxi normal', amount: 4.75 },
  { id: 'ejecutivo', name: 'Taxi ejecutivo', amount: 7.2 },
  { id: 'suv', name: 'SUV', amount: 11.4 },
];

function NumberDemo() {
  const [i, setI] = useState(0);
  const [eta, setEta] = useState(6);
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setEta((e) => (e <= 1 ? 9 : e - 1)), 1500);
    return () => clearInterval(t);
  }, [live]);
  return (
    <Section id="fx-number" title="Número animado · precio y ETA">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[20px] border border-line bg-surface-raised p-4">
          <p className="label-caps text-fg-55">{PRICES[i].name}</p>
          <AnimatedNumber value={PRICES[i].amount} format="usd" className="mt-1 text-[34px] font-black text-ivancar-yellow" data-testid="fx-price" />
        </div>
        <div className="rounded-[20px] border border-line bg-surface-raised p-4">
          <p className="label-caps text-fg-55">Llega en</p>
          <AnimatedNumber value={eta} format="minutes" className="mt-1 text-[34px] font-black" data-testid="fx-eta" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setI((x) => (x + 1) % PRICES.length)} data-testid="next-price">
          Cambiar servicio
        </Button>
        <Button variant="secondary" onClick={() => setEta((e) => Math.max(0, e - 1))} data-testid="eta-down">
          −1 min
        </Button>
        <Button variant="secondary" onClick={() => setLive((v) => !v)}>
          {live ? 'Pausar ETA' : 'ETA en vivo'}
        </Button>
      </div>
      <Note>Los dígitos ruedan en la dirección del cambio. Lectores de pantalla: solo el valor final.</Note>
    </Section>
  );
}

function StarsDemo() {
  const id = useId();
  const [stars, setStars] = useState<number | null>(null);
  return (
    <Section id="fx-stars" title="Estrellas · calificación">
      <p id={id} className="text-[16px] font-bold">
        ¿Cómo estuvo tu viaje con Carlos?
      </p>
      <StarRating value={stars} onChange={setStars} labelledBy={id} />
      <Note>Grupo de radio: Tab entra, flechas cambian, Inicio/Fin. Relleno en cascada con rebote.</Note>
    </Section>
  );
}

function StaggerDemo() {
  const [k, setK] = useState(0);
  const unit = fleet[2];
  const v = unit.vehicle;
  return (
    <Section id="fx-stagger" title="Stagger · tarjeta del conductor">
      <Stagger replayKey={k} className="rounded-[20px] border border-line bg-surface-raised p-4" data-testid="stagger-card">
        <div className="flex items-center gap-3">
          <StaggerItem from="left">
            <Avatar unit={unit} size={52} />
          </StaggerItem>
          <div className="min-w-0 flex-1">
            <StaggerItem>
              <p className="truncate text-[17px] font-bold">{unit.display_name}</p>
            </StaggerItem>
            <StaggerItem>
              <Rating value={unit.rating} trips={unit.trips_count} />
            </StaggerItem>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
          <StaggerItem>
            <p className="text-[14px] font-semibold">
              {v.make} {v.model} <span className="font-normal text-fg-65">· {v.color}</span>
            </p>
          </StaggerItem>
          <StaggerItem>
            <Plate plate={v.plate} />
          </StaggerItem>
        </div>
      </Stagger>
      <Button variant="secondary" onClick={() => setK((x) => x + 1)} data-testid="replay-stagger">
        Repetir entrada
      </Button>
    </Section>
  );
}

function MorphDemo() {
  const [state, setState] = useState<ButtonState>('idle');
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const run = () => {
    setState('loading');
    timers.current.push(window.setTimeout(() => setState('success'), 1200), window.setTimeout(() => setState('idle'), 2600));
  };
  return (
    <Section id="fx-morph" title="Botón morph · Pedir taxi">
      <div className="flex justify-center">
        <div className="w-full max-w-sm">
          <Button fullWidth size="lg" morph state={state} onClick={run} loadingLabel="Pidiendo tu taxi" successLabel="Pedido enviado" data-testid="fire-morph">
            Pedir taxi
          </Button>
        </div>
      </div>
      <Note>Ya lo cubre Button (components/ui) con state=idle|loading|success y morph: no se duplicó.</Note>
    </Section>
  );
}

function SelectDemo() {
  const [sel, setSel] = useState<ServiceId>('taxi');
  return (
    <Section id="fx-select" title="Selección · tarjetas de servicio">
      <SelectGlowGroup>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Tipo de servicio">
          {PRICES.map((p) => {
            const active = p.id === sel;
            return (
              <SelectCard
                key={p.id}
                active={active}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => setSel(p.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSel(p.id))}
                className="cursor-pointer border border-line p-3 pr-4 outline-offset-2"
                data-testid={`fx-service-${p.id}`}
              >
                <div className="flex items-center gap-3">
                  <ServiceIcon service={p.id} size={48} muted={!active} />
                  <span className="flex-1 text-[16px] font-bold">{p.name}</span>
                  <span className={active ? 'text-[17px] font-black text-ivancar-yellow' : 'text-[17px] font-black'}>
                    <AnimatedNumber value={p.amount} format="usd" />
                  </span>
                </div>
              </SelectCard>
            );
          })}
        </div>
      </SelectGlowGroup>
      <Note>El brillo se desliza entre tarjetas (layoutId). Escala 1,015 en la activa y 0,98 al tocar.</Note>
    </Section>
  );
}

function ArrivalDemo() {
  const [open, setOpen] = useState(false);
  const v = fleet[0].vehicle;
  return (
    <Section id="fx-arrival" title="Llegada · Tu IVANCAR llegó">
      <Button onClick={() => setOpen(true)} leadingIcon={<IconCar size={20} />} data-testid="fire-arrival">
        Simular llegada
      </Button>
      <Note>Vibra con el patrón "arrival" en Android. Se anuncia con role=status.</Note>
      <ArrivalBanner
        open={open}
        plate={v.plate}
        driver={fleet[0].display_name}
        vehicle={`${v.make} ${v.model} ${v.color.toLowerCase()}`}
        onClose={() => setOpen(false)}
        autoHideMs={6000}
      />
    </Section>
  );
}

function InstallDemo() {
  const install = useInstall();
  const [preview, setPreview] = useState<'android' | 'ios' | null>(null);
  return (
    <Section id="fx-install" title="Instalar PWA · prompt propio">
      <dl className="grid grid-cols-2 gap-2 text-[13px]" data-testid="install-state">
        <Kv k="canShow" v={String(install.canShow)} />
        <Kv k="platform" v={String(install.platform)} />
        <Kv k="installed" v={String(install.installed)} />
        <Kv k="dismissed" v={String(install.dismissed)} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setPreview('android')} data-testid="fire-install-android">
          Vista Android
        </Button>
        <Button variant="secondary" onClick={() => setPreview('ios')} data-testid="fire-install-ios">
          Vista iOS
        </Button>
        <Button variant="ghost" onClick={resetInstallDismiss}>
          Olvidar descarte
        </Button>
      </div>
      <Note>Quien integra decide el momento: open={'{install.canShow && algoDeValor}'}. Nunca aparece instalada.</Note>
      <InstallPrompt open={!!preview} previewPlatform={preview ?? undefined} onClose={() => setPreview(null)} />
    </Section>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2">
      <dt className="text-fg-55">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function HapticsDemo() {
  const [last, setLast] = useState('—');
  return (
    <Section id="fx-haptics" title="Háptica · Vibration API">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(hapticPatterns) as HapticName[]).map((name) => (
          <Button key={name} variant="secondary" onClick={() => setLast(`${name}: ${vibrate(name) ? 'vibró' : 'no disponible'}`)} data-testid={`haptic-${name}`}>
            {name}
          </Button>
        ))}
      </div>
      <Note>
        API disponible: {canVibrate() ? 'sí' : 'no'} · último: <span data-testid="haptic-last">{last}</span>. Sin vibración con reducir movimiento.
      </Note>
    </Section>
  );
}

const STEPS = [
  { key: 'service', title: 'Elige tu servicio', body: 'Taxi normal · llega en 4 min' },
  { key: 'searching', title: 'Buscando tu IVANCAR', body: 'Evaluando 7 unidades cercanas' },
  { key: 'assigned', title: 'Llega en 4 min', body: 'Carlos · Hyundai Accent · GSB-4821' },
];

function PageDemo() {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const s = STEPS[i];
  return (
    <Section id="fx-page" title="Transición de paso · contenido del sheet">
      <div className="relative min-h-[120px] overflow-hidden rounded-t-[28px] border border-b-0 border-line bg-surface p-5" data-testid="page-box">
        <span aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/20" />
        <PageTransition stepKey={s.key} direction={dir} animateOnMount={false}>
          <h3 className="title-display text-[26px]">{s.title}</h3>
          <p className="mt-1 text-fg-65">{s.body}</p>
        </PageTransition>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            setDir(-1);
            setI((x) => (x + STEPS.length - 1) % STEPS.length);
          }}
        >
          Atrás
        </Button>
        <Button
          onClick={() => {
            setDir(1);
            setI((x) => (x + 1) % STEPS.length);
          }}
          data-testid="next-step"
        >
          Siguiente paso
        </Button>
      </div>
    </Section>
  );
}

interface Order {
  id: number;
  label: string;
  isNew: boolean;
}

function CentralDemo() {
  const [orders, setOrders] = useState<Order[]>([
    { id: 2, label: 'Plaza Lagos → Aeropuerto', isNew: false },
    { id: 1, label: 'Mall del Sol → Urdesa', isNew: false },
  ]);
  const [alert, setAlert] = useState(true);
  const next = useRef(3);
  const add = () => {
    const id = next.current++;
    setOrders((o) => [{ id, label: `Pedido #${id} · Samborondón → Centro`, isNew: true }, ...o].slice(0, 5));
  };
  return (
    <Section id="fx-central" title="Central · pedidos y alertas">
      <div className="flex flex-wrap gap-2">
        <Button onClick={add} data-testid="fire-order">
          Nuevo pedido
        </Button>
        <Button variant="secondary" onClick={() => setAlert((a) => !a)} data-testid="toggle-alert">
          {alert ? 'Quitar alerta' : 'Poner alerta'}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {orders.map((o, idx) => (
            <EnterHighlight key={o.id} highlight={o.isNew}>
              <PulseAlert active={alert && idx === orders.length - 1} data-testid={idx === orders.length - 1 ? 'alert-card' : undefined}>
                <div className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-surface-raised px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold">{o.label}</span>
                    <span className="block text-[12px] text-fg-55">
                      {alert && idx === orders.length - 1 ? (
                        <span className="font-semibold text-ivancar-yellow">Sin asignar hace 2 min</span>
                      ) : (
                        'Buscando unidad'
                      )}
                    </span>
                  </span>
                  <span className="label-caps shrink-0 rounded-full border border-line-strong px-2 py-1 text-fg-75">#{o.id}</span>
                </div>
              </PulseAlert>
            </EnterHighlight>
          ))}
        </AnimatePresence>
      </div>
      <Note>EnterHighlight: entrada con resorte + brillo una vez. PulseAlert: halo que pulsa (solo opacity) con el motivo en texto.</Note>
    </Section>
  );
}
