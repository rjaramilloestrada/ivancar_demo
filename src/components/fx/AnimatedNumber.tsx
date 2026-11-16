import './fx.css';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { formatUSD } from '@/lib/pricing';
import { prefersReducedMotion } from './reducedMotion';

/** Formatos listos. Cualquier `(n) => string` sirve también. */
export const numberFormats = {
  /** "$4,75" (mismo formato que `formatUSD`). */
  usd: (n: number) => formatUSD(n),
  /** "4 min" (redondeado, nunca negativo). */
  minutes: (n: number) => `${Math.max(0, Math.round(n))} min`,
  /** "12" / "1.250" (es-EC). */
  integer: (n: number) => Math.round(n).toLocaleString('es-EC'),
} satisfies Record<string, (n: number) => string>;

export type NumberFormat = keyof typeof numberFormats | ((n: number) => string);

export interface AnimatedNumberProps {
  value: number;
  /** Default 'integer'. */
  format?: NumberFormat;
  /** Duración del giro de cada dígito (ms). Default 650. */
  duration?: number;
  /** Texto para lectores de pantalla; por defecto, el valor formateado. */
  label?: string;
  className?: string;
  style?: CSSProperties;
  'data-testid'?: string;
}

const ROWS = 30; // 0-9 repetido tres veces: el giro siempre va en la dirección del cambio
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

/**
 * Los glifos visibles se pintan con contenido generado por CSS (data-ch / ::before), así el
 * texto del elemento (innerText, copiar, tests) es solo el valor final.
 *
 * Número con dígitos que ruedan (odómetro), en la dirección del cambio: sube rodando hacia
 * arriba, baja hacia abajo. Solo `transform` por CSS transition; cero renders por frame.
 * Los lectores de pantalla oyen solo el valor final (texto oculto), nunca los pasos.
 * Con reduced motion cambia sin animar.
 *
 * @example
 * <AnimatedNumber value={fare.amount} format="usd" className="text-[17px] font-black" />
 * <AnimatedNumber value={etaMinutes} format="minutes" />
 */
export function AnimatedNumber({ value, format = 'integer', duration = 650, label, className, style, ...rest }: AnimatedNumberProps) {
  const fmt = typeof format === 'function' ? format : numberFormats[format];
  const text = fmt(value);
  const prev = useRef(value);
  const mounted = useRef(false);
  const dir = value === prev.current ? 0 : value > prev.current ? 1 : -1;

  useLayoutEffect(() => {
    prev.current = value;
    mounted.current = true;
  });

  const chars = text.split('');
  return (
    <span className={cn('iv-num', className)} style={style} data-value={value} data-testid={rest['data-testid']}>
      <span className="sr-only">{label ?? text}</span>
      <span aria-hidden className="iv-num__chars">
        {chars.map((ch, i) => {
          const fromRight = chars.length - i;
          const isDigit = ch >= '0' && ch <= '9';
          return isDigit ? (
            <DigitSlot key={`d${fromRight}`} digit={+ch} dir={dir} duration={duration} delay={(fromRight - 1) * 28} enter={mounted.current} />
          ) : (
            <CharSlot key={`c${fromRight}:${ch}`} ch={ch} enter={mounted.current} />
          );
        })}
      </span>
    </span>
  );
}

const ty = (row: number) => `translate3d(0, ${(-row * 100) / ROWS}%, 0)`;

/** Separadores ("$", ",", " min"): entran con un fundido si aparecen después del montaje. */
function CharSlot({ ch, enter }: { ch: string; enter: boolean }) {
  const [entering] = useState(enter);
  return <span className={cn('iv-num__char', entering && 'iv-num--enter')} data-ch={ch} />;
}

function DigitSlot({ digit, dir, duration, delay, enter }: { digit: number; dir: number; duration: number; delay: number; enter: boolean }) {
  const [entering] = useState(enter);
  const colRef = useRef<HTMLSpanElement>(null);
  const row = useRef(-1);

  useLayoutEffect(() => {
    const el = colRef.current;
    const slot = el?.parentElement;
    if (!el || !slot) return;
    const settle = (d: number) => {
      el.style.transition = 'none';
      row.current = d + 10;
      el.style.transform = ty(row.current);
      slot.classList.remove('iv-num__slot--roll');
    };
    // Primer montaje: posición directa.
    if (row.current < 0) {
      settle(digit);
      return;
    }
    const cur = row.current;
    const curDigit = cur % 10;
    if (curDigit === digit) {
      // Re-render a mitad de un giro hacia este mismo dígito: solo falta asentarlo.
      if (cur < 10 || cur > 19) {
        const t = window.setTimeout(() => settle(digit), duration + delay + 40);
        return () => window.clearTimeout(t);
      }
      return;
    }
    if (prefersReducedMotion() || dir === 0) {
      settle(digit);
      return;
    }
    // Si un giro anterior quedó fuera de la copia central, se normaliza (mismo dígito visible).
    if (cur < 10 || cur > 19) {
      settle(curDigit);
      void el.offsetHeight; // aplica el salto sin transición antes de animar
    }
    const from = row.current;
    const target = dir > 0 ? from + ((digit - curDigit + 10) % 10) : from - ((curDigit - digit + 10) % 10);
    row.current = target;
    slot.classList.add('iv-num__slot--roll');
    el.style.transition = `transform ${duration}ms ${EASE} ${delay}ms`;
    el.style.transform = ty(target);
    const done = () => {
      if (row.current === target) settle(digit);
    };
    const t = window.setTimeout(done, duration + delay + 40);
    return () => window.clearTimeout(t);
  }, [digit, dir, duration, delay]);

  return (
    <span className={cn('iv-num__slot', entering && 'iv-num--enter')}>
      <span className="iv-num__ghost" data-ch={digit} />
      <span ref={colRef} className="iv-num__col" />
    </span>
  );
}
