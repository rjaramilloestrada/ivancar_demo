import './fx.css';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springs } from '@/theme/tokens';

export interface EnterHighlightProps {
  /** Destacar al montar (pedido nuevo). false = entrada normal sin brillo. Default true. */
  highlight?: boolean;
  /** Cuánto dura el borde amarillo antes de apagarse (ms). Default 1600. */
  holdMs?: number;
  /** Radio de borde (px). Default 20. */
  radius?: number;
  /** Retraso de entrada (s). */
  delay?: number;
  /** Dirección de entrada. Default 'top' (lista con lo más nuevo arriba). */
  from?: 'top' | 'left';
  className?: string;
  children: ReactNode;
}

/**
 * Entrada destacada de una tarjeta nueva: cae con un resorte, un brillo cruza la tarjeta
 * una vez y el borde amarillo se apaga solo. Usar `layout` en la lista contenedora si las
 * demás tarjetas deben desplazarse suavemente. Con reduced motion: fundido y borde fijo breve.
 *
 * @example
 * <AnimatePresence initial={false}>
 *   {orders.map((o) => <EnterHighlight key={o.id} highlight={o.isNew}><OrderCard order={o} /></EnterHighlight>)}
 * </AnimatePresence>
 */
export function EnterHighlight({ highlight = true, holdMs = 1600, radius = 20, delay = 0, from = 'top', className, children }: EnterHighlightProps) {
  const reduce = useReducedMotion();
  const [lit, setLit] = useState(highlight);
  useEffect(() => {
    if (!lit) return;
    const t = setTimeout(() => setLit(false), holdMs);
    return () => clearTimeout(t);
  }, [lit, holdMs]);

  const off = reduce ? {} : from === 'top' ? { y: -16, scale: 0.97 } : { x: -20, scale: 0.98 };
  return (
    <motion.div
      layout={reduce ? false : 'position'}
      initial={{ opacity: 0, ...off }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: reduce ? 1 : 0.97, transition: { duration: 0.16 } }}
      transition={reduce ? { duration: 0.15, delay } : { ...springs.gentle, delay }}
      className={cn('relative', className)}
      style={{ borderRadius: radius }}
      data-fx="enter-highlight"
      data-lit={lit || undefined}
    >
      {children}
      {highlight && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ borderRadius: radius, boxShadow: 'inset 0 0 0 1.5px var(--color-ivancar-yellow), 0 8px 30px -10px rgb(246 201 14 / 0.55)' }}
          initial={{ opacity: 1 }}
          animate={{ opacity: lit ? 1 : 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}
      {highlight && !reduce && <span aria-hidden className="iv-sheen" style={{ borderRadius: radius }} />}
    </motion.div>
  );
}
