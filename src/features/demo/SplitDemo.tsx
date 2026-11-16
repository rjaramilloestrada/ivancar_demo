import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { DemoBanner } from '@/components/brand/DemoBanner';
import { Logo } from '@/components/brand/Logo';
import { Eyebrow, IconArrowRight, useToast } from '@/components/ui';
import { simSpeed } from '@/lib/simConfig';

const appUrl = (route: string) => `${import.meta.env.BASE_URL}#${route}`;

/** Lo que guarda cada lado en sessionStorage (compartido con los iframes del mismo origen). */
const DEMO_KEYS = ['ivancar-ride', 'ivancar-dispatch', 'ivancar-chat'];

/** Pantalla del teléfono (CSS px) y marco. */
const SCREEN_W = 390;
const SCREEN_H = 844;
const STATUS_H = 44;
const BEZEL = 12;
const PHONE_W = SCREEN_W + BEZEL * 2;
const PHONE_H = SCREEN_H + BEZEL * 2;
/** La central se dibuja al menos a este ancho y se escala para caber (se ve como en escritorio). */
const CENTRAL_MIN_W = 1100;
const GAP = 32;
const CAPTION_H = 30;

/**
 * Vista de presentación (`#/demo`): el teléfono con la app del pasajero y la central de
 * despacho, lado a lado, listas para presentar o grabar. Ambas son la misma app en
 * iframes del mismo origen: el BroadcastChannel conecta el pedido del teléfono con la
 * central sin backend. `?sim=N` se pasa a los dos lados. "Reiniciar" limpia ambos.
 */
export default function SplitDemo() {
  const toast = useToast();
  const stageRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [gen, setGen] = useState(0);
  const [resetting, setResetting] = useState(false);
  const sim = simSpeed();
  const q = sim > 1 ? `?sim=${sim}` : '';

  useEffect(() => {
    const prev = document.title;
    document.title = 'Demo en vivo · IVANCAR';
    return () => {
      document.title = prev;
    };
  }, []);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reinicio: se desmontan los iframes (sus timers mueren), se borra lo guardado y vuelven.
  useEffect(() => {
    if (!resetting) return;
    for (const k of DEMO_KEYS) {
      try {
        sessionStorage.removeItem(k);
      } catch {
        /* sin almacenamiento: nada que borrar */
      }
    }
    const t = setTimeout(() => {
      setGen((g) => g + 1);
      setResetting(false);
      toast.show({ id: 'demo-reset', tone: 'success', title: 'Demo reiniciada', description: 'Teléfono y central empiezan de cero.' });
    }, 120);
    return () => clearTimeout(t);
  }, [resetting, toast]);

  const availH = Math.max(0, box.h - CAPTION_H);
  const phoneScale = Math.min(1, availH / PHONE_H);
  const phoneW = PHONE_W * phoneScale;
  const centralW = Math.max(0, box.w - phoneW - GAP);
  const centralScale = Math.min(1, centralW / CENTRAL_MIN_W);
  const ready = box.w > 0 && !resetting;

  return (
    <div className="flex h-dvh min-h-[560px] flex-col overflow-hidden bg-ivancar-black" data-testid="split-demo">
      <header className="flex shrink-0 items-center gap-4 border-b border-line px-6 py-3.5">
        <Logo height={22} />
        <Eyebrow live className="hidden whitespace-nowrap sm:inline-flex">
          Demo en vivo
        </Eyebrow>
        <h1 className="hidden truncate text-[15px] font-semibold text-fg-80 min-[1400px]:block">Pide en el teléfono y mira el pedido llegar a la central.</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden whitespace-nowrap xl:block">
            <DemoBanner className="border border-line" />
          </span>
          <a
            href={appUrl('/')}
            target="_blank"
            rel="noopener"
            className="hidden h-10 items-center whitespace-nowrap rounded-full border border-line-strong px-4 text-[13px] font-semibold text-fg-80 transition-colors hover:border-fg-55 lg:flex"
          >
            Abrir pasajero
          </a>
          <a
            href={appUrl('/central')}
            target="_blank"
            rel="noopener"
            className="hidden h-10 items-center whitespace-nowrap rounded-full border border-line-strong px-4 text-[13px] font-semibold text-fg-80 transition-colors hover:border-fg-55 lg:flex"
          >
            Abrir central
          </a>
          <button
            type="button"
            onClick={() => setResetting(true)}
            disabled={resetting}
            className="hidden h-10 items-center whitespace-nowrap rounded-full bg-ivancar-yellow px-4 text-[13px] font-extrabold text-on-yellow transition-colors hover:bg-ivancar-yellow-soft disabled:opacity-60 lg:flex"
            data-testid="demo-reset"
          >
            Reiniciar demo
          </button>
        </div>
      </header>

      {/* Pantallas grandes: lado a lado */}
      <main ref={stageRef} className="relative hidden min-h-0 flex-1 p-6 lg:block">
        {ready && (
          <div className="flex h-full items-start" style={{ gap: GAP }}>
            <figure className="m-0 flex shrink-0 flex-col items-center" style={{ width: phoneW }}>
              <div style={{ width: phoneW, height: PHONE_H * phoneScale }}>
                <PhoneFrame scale={phoneScale}>
                  <iframe
                    key={`p${gen}`}
                    title="App del pasajero"
                    src={appUrl(`/${q}`)}
                    allow="geolocation"
                    className="block border-0"
                    style={{ width: SCREEN_W, height: SCREEN_H - STATUS_H }}
                    data-testid="demo-passenger"
                  />
                </PhoneFrame>
              </div>
              <figcaption className="label-caps flex h-[30px] items-end text-fg-55">Pasajero</figcaption>
            </figure>

            <figure className="m-0 flex min-w-0 flex-1 flex-col items-center">
              <div
                className="overflow-hidden rounded-[20px] border border-line-strong bg-black shadow-[0_30px_80px_-20px_rgb(0_0_0/0.9)]"
                style={{ width: centralW, height: availH }}
              >
                <iframe
                  key={`c${gen}`}
                  title="Central de despacho"
                  src={appUrl(`/central${q}`)}
                  className="block origin-top-left border-0"
                  style={{ width: centralW / centralScale, height: availH / centralScale, transform: `scale(${centralScale})` }}
                  data-testid="demo-central"
                />
              </div>
              <figcaption className="label-caps flex h-[30px] items-end text-fg-55">Central IVANCAR</figcaption>
            </figure>
          </div>
        )}
      </main>

      {/* Móvil y tablet vertical */}
      <main className="flex flex-1 flex-col justify-center gap-6 overflow-y-auto p-6 lg:hidden">
        <h1 className="title-display text-[34px]">Ábrelo en una pantalla grande</h1>
        <p className="text-fg-65">
          Esta vista muestra el teléfono y la central lado a lado. En este dispositivo puedes abrir cada una por separado: si las abres en dos pestañas
          del mismo navegador, también se conectan.
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
        <DemoBanner className="self-start border border-line" />
      </main>
    </div>
  );
}

/** Marco de teléfono creíble: bisel, barra de estado con isla, indicador de inicio. */
function PhoneFrame({ scale, children }: { scale: number; children: React.ReactNode }) {
  return (
    <div
      className="relative origin-top-left rounded-[58px] bg-gradient-to-b from-[#2a2a2c] to-[#161617] p-[2px] shadow-[0_40px_90px_-24px_rgb(0_0_0/0.95),0_0_0_1px_rgb(255_255_255/0.06)]"
      style={{ width: PHONE_W, height: PHONE_H, transform: `scale(${scale})` }}
    >
      {/* Botones laterales */}
      <span aria-hidden className="absolute -left-[3px] top-[150px] h-[34px] w-[3px] rounded-l bg-[#2a2a2c]" />
      <span aria-hidden className="absolute -left-[3px] top-[205px] h-[62px] w-[3px] rounded-l bg-[#2a2a2c]" />
      <span aria-hidden className="absolute -left-[3px] top-[280px] h-[62px] w-[3px] rounded-l bg-[#2a2a2c]" />
      <span aria-hidden className="absolute -right-[3px] top-[230px] h-[96px] w-[3px] rounded-r bg-[#2a2a2c]" />
      <div className="size-full rounded-[56px] bg-black p-[10px]">
        <div className="relative size-full overflow-hidden rounded-[46px] bg-ivancar-black">
          <StatusBar />
          {children}
          <span aria-hidden className="pointer-events-none absolute bottom-[7px] left-1/2 h-[5px] w-[134px] -translate-x-1/2 rounded-full bg-white/70" />
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <div aria-hidden className="relative flex items-center justify-between bg-ivancar-black px-8 text-[15px] font-semibold text-white" style={{ height: STATUS_H }}>
      <span className="tabular-nums">{now.toLocaleTimeString('es-EC', { hour: 'numeric', minute: '2-digit', hour12: false })}</span>
      <span className="absolute left-1/2 top-[10px] h-[30px] w-[110px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/5" />
      <span className="flex items-center gap-1.5">
        <svg width="18" height="11" viewBox="0 0 18 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="5" y="5" width="3" height="6" rx="1" />
          <rect x="10" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="15" y="0" width="3" height="11" rx="1" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor">
          <path d="M8 2.2c2.2 0 4.2.9 5.7 2.3l1.1-1.1A9.6 9.6 0 0 0 8 .6 9.6 9.6 0 0 0 1.2 3.4l1.1 1.1A8 8 0 0 1 8 2.2zm0 3.2c1.3 0 2.5.5 3.4 1.3l1.1-1.1A6.4 6.4 0 0 0 8 3.8c-1.7 0-3.3.7-4.5 1.8l1.1 1.1c.9-.8 2.1-1.3 3.4-1.3zm0 3.2c-.5 0-.9.2-1.2.5L8 10.3l1.2-1.2c-.3-.3-.7-.5-1.2-.5z" />
        </svg>
        <span className="relative ml-0.5 inline-block h-[12px] w-[25px] rounded-[4px] border border-white/50 p-[1.5px]">
          <span className="block h-full w-[78%] rounded-[2px] bg-white" />
        </span>
      </span>
    </div>
  );
}
