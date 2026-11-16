import './fx.css';

import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { asset } from '@/lib/links';

const SESSION_KEY = 'ivancar.splash.shown';
const LOGO = 'img/ivancarlogo-440.webp';

/** true si el splash aún no se mostró en esta sesión (pestaña). Nunca lanza. */
export function shouldShowSplash(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markSplashShown(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* almacenamiento bloqueado: se mostraría de nuevo al recargar, sin más */
  }
}

/**
 * Splash una vez por sesión. Se decide en el primer render (sin parpadeo) y se marca como
 * visto al terminar.
 * @example
 * const splash = useSplashOnce();
 * {splash.show && <Splash onDone={splash.done} />}
 */
export function useSplashOnce(): { show: boolean; done: () => void } {
  const [show, setShow] = useState(shouldShowSplash);
  const done = useCallback(() => {
    markSplashShown();
    setShow(false);
  }, []);
  return { show, done };
}

export interface SplashProps {
  /** Al terminar (o al saltarlo). El splash ya no es visible. */
  onDone: () => void;
  /** Ancho del logo en px. Default min(72vw, 300px). */
  logoWidth?: number;
  /** z-index del overlay. Default 2000. */
  zIndex?: number;
}

/* Línea de tiempo (s). Total ≤ 1,8 s incluida la espera máxima por la imagen (0,25 s). */
const T = {
  beamAt: 0.22,
  beamDur: 0.72,
  litAt: 0.34,
  flareAt: 0.6,
  outAt: 1.12,
  outDur: 0.42,
  skipDur: 0.22,
};
const IMG_WAIT_MS = 250;
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Splash de marca: el logo IVANCAR aparece apagado y se "enciende" como un faro (un haz de
 * luz cálida lo barre, el color se prende y un destello horizontal cruza la pantalla); luego
 * el overlay se desvanece revelando la app que ya cargó debajo.
 *
 * - Es un overlay: no retrasa nada. Renderizarlo encima de la app, no en lugar de ella.
 * - Un toque, clic o tecla lo salta (salida de 0,22 s).
 * - Con reduced motion: logo estático y fundido corto (~0,9 s en total).
 * - Decorativo (aria-hidden): el foco y los lectores siguen en la app.
 *
 * @example
 * const splash = useSplashOnce();
 * return <>{splash.show && <Splash onDone={splash.done} />}<PassengerApp /></>;
 */
export function Splash({ onDone, logoWidth, zIndex = 2000 }: SplashProps) {
  const reduce = !!useReducedMotion();
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<'in' | 'out' | 'skip'>('in');
  const finished = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    doneRef.current();
  }, []);

  // Espera breve a que el logo esté decodificado (normalmente ya está en caché).
  useEffect(() => {
    const img = new Image();
    let alive = true;
    const go = () => alive && setReady(true);
    img.onload = go;
    img.onerror = go;
    img.src = asset(LOGO);
    if (img.complete) go();
    const t = setTimeout(go, IMG_WAIT_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  // Salida programada y fin.
  useEffect(() => {
    if (!ready) return;
    if (phase === 'in') {
      const t = setTimeout(() => setPhase('out'), (reduce ? 0.7 : T.outAt) * 1000);
      return () => clearTimeout(t);
    }
    const dur = phase === 'skip' ? T.skipDur : reduce ? 0.2 : T.outDur;
    const t = setTimeout(finish, dur * 1000);
    return () => clearTimeout(t);
  }, [ready, phase, reduce, finish]);

  // Saltar con teclado.
  useEffect(() => {
    const onKey = () => setPhase((p) => (p === 'in' ? 'skip' : p));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const leaving = phase !== 'in';
  const outDur = phase === 'skip' ? T.skipDur : reduce ? 0.2 : T.outDur;
  const width = logoWidth ? `${logoWidth}px` : 'min(72vw, 300px)';
  const logoBox: CSSProperties = { width, aspectRatio: '1412 / 287' };
  const src = asset(LOGO);
  const mask = `url("${src}") center / 100% 100% no-repeat`;
  const play = ready && !reduce;

  return (
    <motion.div
      aria-hidden
      data-fx="splash"
      data-phase={phase}
      className="fixed inset-0 grid cursor-pointer place-items-center overflow-hidden bg-ivancar-black"
      style={{ zIndex }}
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: outDur, ease: [0.4, 0, 0.2, 1] }}
      onPointerDown={() => setPhase((p) => (p === 'in' ? 'skip' : p))}
    >
      {/* Halo cálido detrás del logo (faro encendiéndose) */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgb(246 201 14 / 0.30) 0%, rgb(246 201 14 / 0.10) 32%, rgb(246 201 14 / 0) 66%)' }}
        initial={{ opacity: reduce ? 0.6 : 0, scale: reduce ? 1 : 0.55 }}
        animate={play ? { opacity: [0, 1, 0.55], scale: [0.55, 1.08, 1] } : undefined}
        transition={{ duration: 0.9, delay: T.flareAt - 0.12, ease: EASE_OUT, times: [0, 0.45, 1] }}
      />

      {/* Destello horizontal (haz de faro) */}
      {!reduce && (
        <motion.div
          className="pointer-events-none absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2"
          style={{ background: 'linear-gradient(90deg, transparent, rgb(255 236 160 / 0.9) 35%, #fff 50%, rgb(255 236 160 / 0.9) 65%, transparent)', boxShadow: '0 0 18px 3px rgb(246 201 14 / 0.45)' }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={play ? { scaleX: [0, 1, 1.15], opacity: [0, 0.85, 0] } : undefined}
          transition={{ duration: 0.75, delay: T.flareAt, ease: 'easeOut', times: [0, 0.35, 1] }}
        />
      )}

      <motion.div
        className="relative"
        style={logoBox}
        initial={{ opacity: reduce ? 1 : 0, scale: reduce ? 1 : 0.94 }}
        animate={
          leaving && !reduce
            ? { opacity: 0, scale: 1.1, y: -8, transition: { duration: outDur, ease: [0.4, 0, 1, 1] } }
            : ready
              ? { opacity: 1, scale: 1, transition: { opacity: { duration: 0.25 }, scale: { duration: 1.1, ease: EASE_OUT } } }
              : undefined
        }
      >
        {/* Logo apagado */}
        <img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full select-none"
          style={{ filter: 'grayscale(1) brightness(0.32)' }}
        />
        {/* Logo encendido */}
        <motion.img
          src={src}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full select-none"
          initial={{ opacity: reduce ? 1 : 0 }}
          animate={play ? { opacity: 1 } : undefined}
          transition={{ duration: 0.5, delay: T.litAt, ease: 'easeOut' }}
        />
        {/* Haz de luz recortado a la silueta del logo */}
        {!reduce && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ WebkitMask: mask, mask }}>
            <motion.div
              className="iv-splash__beam"
              initial={{ x: '-120%', skewX: -18 }}
              animate={play ? { x: '260%' } : undefined}
              transition={{ duration: T.beamDur, delay: T.beamAt, ease: [0.45, 0, 0.2, 1] }}
            />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
