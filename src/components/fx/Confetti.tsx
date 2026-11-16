import { useCallback, useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import { colors } from '@/theme/tokens';
import { prefersReducedMotion } from './reducedMotion';

export interface ConfettiFireOptions {
  /** Origen en fracción del viewport (0..1). Default { x: 0.5, y: 0.62 }. */
  origin?: { x: number; y: number };
  /** Partículas de esta ráfaga (se recorta a `maxParticles`). Default 90. */
  count?: number;
  /** Apertura del cono en grados. Default 70. */
  spread?: number;
  /** Velocidad inicial (px/s). Default 900. */
  power?: number;
}

export interface ConfettiHandle {
  /** Dispara una ráfaga (~1,5 s). No hace nada con reduced motion. Devuelve si disparó. */
  fire(opts?: ConfettiFireOptions): boolean;
  /** Limpia el lienzo y detiene la animación. */
  clear(): void;
}

export interface ConfettiProps {
  /** Tope de partículas vivas (sumando ráfagas). Default 140. */
  maxParticles?: number;
  /** Duración de cada partícula en ms. Default 1500. */
  durationMs?: number;
  /** z-index del lienzo (fijo, a pantalla completa, sin capturar toques). Default 1200. */
  zIndex?: number;
  ref?: Ref<ConfettiHandle>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  /** fase del "volteo" (escala Y oscilante) */
  flip: number;
  vflip: number;
  w: number;
  h: number;
  color: string;
  round: boolean;
  born: number;
}

/** Amarillo dominante, algo de amarillo suave y blanco: sutil, de marca. */
const PALETTE = [colors.yellow, colors.yellow, colors.yellow, colors.yellowSoft, colors.yellowSoft, '#FFFFFF', '#FFF4C2'];
const GRAVITY = 1500; // px/s²
const DRAG = 1.9; // 1/s

/**
 * Confetti amarillo en un canvas propio (sin librería). Lienzo fijo a pantalla completa,
 * `pointer-events: none`, que solo corre rAF mientras hay partículas vivas.
 * Con reduced motion `fire()` no hace nada.
 *
 * @example
 * const confetti = useRef<ConfettiHandle>(null);
 * <Confetti ref={confetti} />
 * confetti.current?.fire({ origin: { x: 0.5, y: 0.7 } });
 */
export function Confetti({ maxParticles = 140, durationMs = 1500, zIndex = 1200, ref }: ConfettiProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parts = useRef<Particle[]>([]);
  const raf = useRef(0);
  const last = useRef(0);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  /** Zona pintada en el frame anterior (px CSS): solo se borra eso, no el lienzo entero. */
  const dirty = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    last.current = 0;
  }, []);

  const clear = useCallback(() => {
    stop();
    parts.current = [];
    const c = canvasRef.current;
    if (c) {
      const ctx = c.getContext('2d');
      ctx?.setTransform(1, 0, 0, 1, 0, 0);
      ctx?.clearRect(0, 0, c.width, c.height);
      c.style.visibility = 'hidden';
    }
    dirty.current = null;
  }, [stop]);

  const frame = useCallback(
    (now: number) => {
      const c = canvasRef.current;
      const ctx = c?.getContext('2d');
      if (!c || !ctx) return stop();
      const dt = Math.min(0.05, last.current ? (now - last.current) / 1000 : 1 / 60);
      last.current = now;
      const { w, h, dpr } = size.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const d = dirty.current;
      if (d) ctx.clearRect(d.x0, d.y0, d.x1 - d.x0, d.y1 - d.y0);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      const k = Math.exp(-DRAG * dt);
      const alive: Particle[] = [];
      for (const p of parts.current) {
        const age = (now - p.born) / durationMs;
        if (age >= 1 || p.y > h + 40) continue;
        p.vx *= k;
        p.vy = p.vy * k + GRAVITY * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        p.flip += p.vflip * dt;
        // Fundido en el último 35 % de vida.
        ctx.globalAlpha = age < 0.65 ? 1 : 1 - (age - 0.65) / 0.35;
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const sy = Math.cos(p.flip);
          const cos = Math.cos(p.rot);
          const sin = Math.sin(p.rot);
          ctx.setTransform(dpr * cos, dpr * sin, -dpr * sin * sy, dpr * cos * sy, dpr * p.x, dpr * p.y);
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        alive.push(p);
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
      ctx.globalAlpha = 1;
      dirty.current = alive.length ? { x0: Math.max(0, x0 - 12), y0: Math.max(0, y0 - 12), x1: Math.min(w, x1 + 12), y1: Math.min(h, y1 + 12) } : null;
      parts.current = alive;
      if (alive.length && !document.hidden) raf.current = requestAnimationFrame(frame);
      else clear();
    },
    [durationMs, stop, clear],
  );

  const fire = useCallback(
    (opts: ConfettiFireOptions = {}) => {
      const c = canvasRef.current;
      if (!c || prefersReducedMotion() || document.hidden) return false;
      const { origin = { x: 0.5, y: 0.62 }, count = 90, spread = 70, power = 900 } = opts;
      const w = window.innerWidth;
      const h = window.innerHeight;
      // 1,5x basta para piezas de 5-10 px y ahorra ~45 % de píxeles frente a 2x.
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      if (size.current.w !== w || size.current.h !== h || size.current.dpr !== dpr) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        size.current = { w, h, dpr };
      }
      c.style.visibility = 'visible';
      const room = Math.max(0, maxParticles - parts.current.length);
      const n = Math.min(count, room);
      const now = performance.now();
      const ox = origin.x * w;
      const oy = origin.y * h;
      const half = ((spread / 2) * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * half;
        const speed = power * (0.45 + Math.random() * 0.6);
        const round = Math.random() < 0.18;
        const s = 5 + Math.random() * 5;
        parts.current.push({
          x: ox + (Math.random() - 0.5) * 24,
          y: oy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 14,
          flip: Math.random() * Math.PI,
          vflip: 6 + Math.random() * 10,
          w: round ? s * 0.7 : s,
          h: round ? s * 0.7 : s * 0.45,
          color: PALETTE[(Math.random() * PALETTE.length) | 0],
          round,
          // Escalonado leve: la ráfaga no sale toda en el mismo frame.
          born: now - Math.random() * 60,
        });
      }
      if (!raf.current) raf.current = requestAnimationFrame(frame);
      return n > 0;
    },
    [maxParticles, frame],
  );

  useImperativeHandle(ref, () => ({ fire, clear }), [fire, clear]);
  useEffect(() => clear, [clear]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      data-fx="confetti"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex, visibility: 'hidden' }}
    />
  );
}

/**
 * Variante en hook: devuelve el elemento a renderizar y `fire`.
 * @example
 * const { confetti, fire } = useConfetti();
 * return <>{confetti}<Button onClick={() => fire()}>…</Button></>;
 */
export function useConfetti(props: Omit<ConfettiProps, 'ref'> = {}) {
  const ref = useRef<ConfettiHandle>(null);
  const fire = useCallback((o?: ConfettiFireOptions) => ref.current?.fire(o) ?? false, []);
  return { confetti: <Confetti ref={ref} {...props} />, fire, clear: () => ref.current?.clear() };
}
