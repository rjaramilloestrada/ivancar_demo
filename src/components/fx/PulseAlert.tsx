import './fx.css';

import { motion, useReducedMotion } from 'motion/react';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springs } from '@/theme/tokens';

export interface PulseAlertProps {
  /** Encendido: borde + halo que pulsa (solo opacity, en el compositor). */
  active: boolean;
  /** 'yellow' (pedido demorado) o 'danger' (emergencia). Default 'yellow'. */
  tone?: 'yellow' | 'danger';
  /** Radio de borde (px). Default 20. */
  radius?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  'data-testid'?: string;
}

/**
 * Halo amarillo que pulsa alrededor de una tarjeta (central: pedido que pasó el umbral sin
 * asignarse). Envuelve la tarjeta; no cambia su layout. Con reduced motion: halo fijo.
 * El motivo de la alerta debe estar también en texto (no solo color).
 *
 * @example
 * <PulseAlert active={waitingMs > THRESHOLD}><OrderCard order={o} /></PulseAlert>
 */
export function PulseAlert({ active, tone = 'yellow', radius = 20, className, style, children, ...rest }: PulseAlertProps) {
  const reduce = useReducedMotion();
  return (
    <div
      className={cn('iv-pulse-alert', className)}
      style={{ borderRadius: radius, '--pulse-color': tone === 'danger' ? 'var(--color-danger)' : 'var(--color-ivancar-yellow)', ...style } as CSSProperties}
      data-alert={active || undefined}
      data-testid={rest['data-testid']}
    >
      {children}
      {active && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10"
          style={{ borderRadius: radius }}
          initial={reduce ? false : { opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springs.snappy}
        >
          <span className="iv-pulse-alert__edge" />
          <span className="iv-pulse-alert__glow" />
        </motion.span>
      )}
    </div>
  );
}
