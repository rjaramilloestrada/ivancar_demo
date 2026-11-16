import { AnimatePresence, motion, useReducedMotion, type MotionProps } from 'motion/react';
import type { ReactNode } from 'react';

export type PageDirection = 1 | -1 | 0;

/**
 * Props de Motion para el contenido de un paso: fundido + desplazamiento corto (10 px).
 * Útil para aplicarlas directamente sobre un `motion.div` existente (p. ej. el `wrap` de
 * SheetSlots) sin cambiar su estructura.
 *
 * @param direction 1 = avanzar (entra desde abajo/derecha), -1 = volver, 0 = sin desplazamiento.
 */
export function pageMotion(reduce: boolean, { direction = 1, delay = 0, axis = 'y' }: { direction?: PageDirection; delay?: number; axis?: 'x' | 'y' } = {}): MotionProps {
  const d = reduce ? 0 : 10 * direction;
  const off = axis === 'x' ? { x: d * 1.6 } : { y: d };
  const back = axis === 'x' ? { x: -d * 1.2 } : { y: -d * 0.6 };
  return {
    initial: { opacity: 0, ...off },
    animate: { opacity: 1, x: 0, y: 0, transition: { duration: reduce ? 0.12 : 0.26, ease: [0.16, 1, 0.3, 1], delay } },
    exit: { opacity: 0, ...back, transition: { duration: reduce ? 0.08 : 0.14, ease: 'easeIn' } },
  };
}

export interface PageTransitionProps {
  /** Clave del paso: al cambiar, el contenido viejo sale y el nuevo entra. */
  stepKey: string;
  /** 1 avanzar, -1 volver (invierte el sentido), 0 solo fundido. Default 1. */
  direction?: PageDirection;
  /** 'y' (default, sheet) o 'x'. */
  axis?: 'x' | 'y';
  /** Retraso de entrada (s), para escalonar cabecera / cuerpo / pie. */
  delay?: number;
  /** false = el contenido viejo no espera a salir (sin hueco). Default true ("popLayout"). */
  overlap?: boolean;
  /** Anima también el primer montaje. Default true (cada pantalla del sheet se monta al entrar). */
  animateOnMount?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Transición de contenido entre pasos. La salida es muy corta (140 ms) y en "popLayout"
 * el nuevo contenido entra a la vez: nunca frena el pedido. Con reduced motion, fundido corto.
 *
 * Nota: la salida solo se ve si el `PageTransition` sigue montado al cambiar `stepKey`
 * (envolver en el contenedor estable, no dentro de la pantalla que se desmonta).
 *
 * @example
 * <PageTransition stepKey={step}>{content}</PageTransition>
 */
export function PageTransition({ stepKey, direction = 1, axis = 'y', delay = 0, overlap = true, animateOnMount = true, className, children }: PageTransitionProps) {
  const reduce = !!useReducedMotion();
  return (
    <AnimatePresence mode={overlap ? 'popLayout' : 'wait'} initial={animateOnMount}>
      <motion.div key={stepKey} data-step={stepKey} className={className} {...pageMotion(reduce, { direction, delay, axis })}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
