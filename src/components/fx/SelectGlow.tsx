import { LayoutGroup, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springs } from '@/theme/tokens';

export interface SelectGlowProps {
  /** Se dibuja solo en la tarjeta activa; al cambiar de tarjeta, se desliza a la nueva. */
  active: boolean;
  /** Mismo id en todas las tarjetas del grupo. Default 'iv-select-glow'. */
  layoutId?: string;
  /** Radio de borde (px). Default 20 (tarjetas de servicio). */
  radius?: number;
  className?: string;
}

/**
 * Realce de selección: borde amarillo + halo + velo amarillo tenue, que se desplaza entre
 * tarjetas con `layoutId` (transform, sin layout por frame). Va como primer hijo de una
 * tarjeta con `position: relative`. Decorativo: el estado lo comunica el input/aria.
 * Con reduced motion aparece directamente en la nueva tarjeta.
 *
 * Para varios grupos en la misma pantalla, envolver cada uno en `<SelectGlowGroup>`.
 *
 * @example
 * <label className="relative ..."><SelectGlow active={active} />…</label>
 */
export function SelectGlow({ active, layoutId = 'iv-select-glow', radius = 20, className }: SelectGlowProps) {
  const reduce = useReducedMotion();
  if (!active) return null;
  return (
    <motion.span
      aria-hidden
      layoutId={reduce ? undefined : layoutId}
      transition={springs.snappy}
      className={cn('pointer-events-none absolute inset-0 z-0', className)}
      style={{
        borderRadius: radius,
        background: 'linear-gradient(135deg, rgb(246 201 14 / 0.13), rgb(246 201 14 / 0.04) 55%, rgb(246 201 14 / 0.08))',
        boxShadow: 'inset 0 0 0 1.5px var(--color-ivancar-yellow), 0 0 0 1px rgb(246 201 14 / 0.35), 0 10px 36px -10px rgb(246 201 14 / 0.5)',
      }}
      data-fx="select-glow"
    />
  );
}

/** Aísla los `layoutId` de un grupo de tarjetas (el brillo no salta entre grupos). */
export function SelectGlowGroup({ children }: { children: ReactNode }) {
  const id = useId();
  return <LayoutGroup id={id}>{children}</LayoutGroup>;
}

export interface SelectCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  active: boolean;
  layoutId?: string;
  radius?: number;
  children: ReactNode;
}

/**
 * Tarjeta seleccionable lista: escala leve al activarse (1 → 1,015) y al tocar (0,98), con
 * `SelectGlow` dentro. El contenido queda por encima del brillo.
 *
 * @example
 * <SelectCard active={id === sel} onClick={() => setSel(id)} className="p-3 border border-line">…</SelectCard>
 */
export function SelectCard({ active, layoutId, radius = 20, className, children, style, ...rest }: SelectCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      animate={{ scale: active && !reduce ? 1.015 : 1 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={springs.snappy}
      className={cn('relative', className)}
      style={{ borderRadius: radius, ...style }}
      data-selected={active || undefined}
      {...rest}
    >
      <SelectGlow active={active} layoutId={layoutId} radius={radius} />
      <div className="relative z-[1]">{children}</div>
    </motion.div>
  );
}
