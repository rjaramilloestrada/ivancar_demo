import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SkeletonProps {
  /** Tamaño y forma con clases Tailwind (h-4 w-32, size-12 …). */
  className?: string;
  /** Forma: line (radio 8) · pill · circle · card (radio 24). */
  shape?: 'line' | 'pill' | 'circle' | 'card';
  style?: CSSProperties;
}

const shapeClass = {
  line: 'rounded-lg',
  pill: 'rounded-full',
  circle: 'rounded-full aspect-square',
  card: 'rounded-card',
} as const;

/** Bloque de carga con brillo que recorre (sin spinners). Decorativo: aria-hidden. */
export function Skeleton({ className, shape = 'line', style }: SkeletonProps) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'block bg-[linear-gradient(100deg,rgb(255_255_255/0.05)_30%,rgb(255_255_255/0.11)_50%,rgb(255_255_255/0.05)_70%)] bg-[length:200%_100%]',
        'animate-shimmer motion-reduce:animate-none',
        shapeClass[shape],
        className,
      )}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

/** Varias líneas de texto; la última más corta. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <span className={cn('flex flex-col gap-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </span>
  );
}

/** Contenedor accesible para un estado de carga: anuncia "Cargando" una sola vez. */
export function LoadingRegion({ label = 'Cargando', children }: { label?: string; children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
