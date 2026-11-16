import { motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';

type Tag = 'div' | 'ul' | 'ol' | 'li' | 'section' | 'span' | 'dl';

export interface StaggerProps {
  /** Segundos entre hijos. Default 0.07. */
  step?: number;
  /** Retraso antes del primer hijo (s). Default 0.05. */
  delay?: number;
  /** Etiqueta HTML. Default 'div'. */
  as?: Tag;
  /** Cambiarla relanza la secuencia (p. ej. id del conductor). */
  replayKey?: string | number;
  className?: string;
  children: ReactNode;
  'data-testid'?: string;
}

export interface StaggerItemProps {
  /** Desplazamiento inicial en px. Default 12. */
  offset?: number;
  /** Dirección del desplazamiento. Default 'up'. */
  from?: 'up' | 'left';
  as?: Tag;
  className?: string;
  children: ReactNode;
}

const container = (step: number, delay: number): Variants => ({
  hidden: {},
  shown: { transition: { staggerChildren: step, delayChildren: delay } },
});

/**
 * Entrada escalonada: cada `StaggerItem` hijo (a cualquier profundidad) aparece con
 * fundido y un desplazamiento corto, uno tras otro. Con reduced motion, solo fundido.
 *
 * @example
 * <Stagger className="flex items-center gap-3">
 *   <StaggerItem><Avatar /></StaggerItem>
 *   <StaggerItem><p>{name}</p></StaggerItem>
 * </Stagger>
 */
export function Stagger({ step = 0.07, delay = 0.05, as = 'div', replayKey, className, children, ...rest }: StaggerProps) {
  const C = motion[as] as typeof motion.div;
  return (
    <C key={replayKey} className={className} variants={container(step, delay)} initial="hidden" animate="shown" data-testid={rest['data-testid']}>
      {children}
    </C>
  );
}

export function StaggerItem({ offset = 12, from = 'up', as = 'div', className, children }: StaggerItemProps) {
  const reduce = useReducedMotion();
  const C = motion[as] as typeof motion.div;
  const off = reduce ? 0 : offset;
  const variants: Variants = {
    hidden: { opacity: 0, x: from === 'left' ? -off : 0, y: from === 'up' ? off : 0 },
    shown: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 420, damping: 32 },
    },
  };
  return (
    <C className={className} variants={variants}>
      {children}
    </C>
  );
}
