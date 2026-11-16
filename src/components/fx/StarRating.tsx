import { motion, useReducedMotion } from 'motion/react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { vibrate } from '@/lib/haptics';
import { cn } from '@/lib/cn';

export const STAR_LABELS = ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente'] as const;

export interface StarRatingProps {
  /** 1..5 o null (sin calificar). */
  value: number | null;
  onChange: (value: number) => void;
  /** id del texto que nombra el grupo (p. ej. la <legend>). Alternativa: `label`. */
  labelledBy?: string;
  /** Nombre accesible del grupo si no hay `labelledBy`. */
  label?: string;
  /** Lado de cada estrella en px. Default 34. */
  size?: number;
  /** Texto descriptivo a la derecha ("Excelente"). Default true. */
  showText?: boolean;
  /** Vibración corta al elegir (Android). Default true. */
  haptic?: boolean;
  className?: string;
}

const STAR = 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z';

/**
 * Cinco estrellas como grupo de radio (role=radiogroup / radio), con tabindex itinerante:
 * Tab entra al grupo, flechas cambian y enfocan, Inicio/Fin van a 1/5.
 * Al elegir, las estrellas se rellenan en cascada desde la primera con un rebote corto.
 *
 * @example
 * <legend id={id}>¿Cómo estuvo tu viaje?</legend>
 * <StarRating value={stars} onChange={setStars} labelledBy={id} />
 */
export function StarRating({ value, onChange, labelledBy, label, size = 34, showText = true, haptic = true, className }: StarRatingProps) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Cada elección incrementa la "ola" para relanzar la cascada aunque el valor no cambie.
  const [wave, setWave] = useState(0);
  const [prev, setPrev] = useState(value ?? 0);

  const choose = (n: number, focus = false) => {
    setPrev(value ?? 0);
    setWave((w) => w + 1);
    onChange(n);
    if (haptic) vibrate('tap');
    if (focus) refs.current[n - 1]?.focus();
  };

  const onKey = (e: KeyboardEvent, n: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(5, n + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(1, n - 1);
    else if (e.key === 'Home') next = 1;
    else if (e.key === 'End') next = 5;
    if (next === null) return;
    e.preventDefault();
    choose(next, true);
  };

  const focusable = value ?? 1;
  const box = size + 14;

  return (
    <div className={cn('flex items-center gap-0.5', className)}>
      <div role="radiogroup" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : (label ?? 'Calificación')} className="flex items-center">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = !!value && n <= value;
          // Cascada: solo las estrellas que se encienden en esta elección esperan su turno.
          const fresh = on && wave > 0 && !reduce && n > prev;
          const delay = fresh ? (n - prev - 1) * 0.06 : 0;
          return (
            <button
              key={n}
              ref={(el) => {
                refs.current[n - 1] = el;
              }}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}: ${STAR_LABELS[n - 1]}`}
              tabIndex={n === focusable ? 0 : -1}
              onClick={() => choose(n)}
              onKeyDown={(e) => onKey(e, n)}
              className="grid place-items-center rounded-full outline-offset-0"
              style={{ width: box, height: box }}
              data-testid={`star-${n}`}
            >
              <motion.svg
                key={on ? `on-${wave}` : 'off'}
                width={size}
                height={size}
                viewBox="0 0 24 24"
                aria-hidden
                focusable={false}
                initial={fresh ? { scale: 0.55 } : on && wave > 0 && !reduce ? { scale: 0.9 } : false}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 600, damping: 14, delay }}
                whileTap={reduce ? undefined : { scale: 0.85 }}
              >
                <path d={STAR} fill="none" stroke={on ? 'var(--color-ivancar-yellow)' : 'var(--color-fg-55)'} strokeWidth={1.8} strokeLinejoin="round" />
                {on && (
                  <motion.path
                    d={STAR}
                    fill="var(--color-ivancar-yellow)"
                    style={{ transformOrigin: '12px 12px', transformBox: 'view-box' }}
                    initial={fresh ? { scale: 0, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1], delay }}
                  />
                )}
              </motion.svg>
            </button>
          );
        })}
      </div>
      {showText && (
        <span className="ml-2 min-w-[5.5em] text-[14px] font-semibold text-fg-75" aria-hidden>
          {value ? STAR_LABELS[value - 1] : ''}
        </span>
      )}
    </div>
  );
}
