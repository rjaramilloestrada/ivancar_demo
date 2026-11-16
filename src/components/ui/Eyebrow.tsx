import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EyebrowProps {
  children: ReactNode;
  /** yellow (default, como su web) · neutral (borde blanco 15 %). */
  tone?: 'yellow' | 'neutral';
  /** Punto que pulsa a la izquierda: indica algo "en vivo". */
  live?: boolean;
  className?: string;
}

/** Píldora con borde, texto pequeño en mayúsculas y tracking amplio. */
export function Eyebrow({ children, tone = 'yellow', live = false, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        'label-caps inline-flex items-center gap-2 rounded-full border px-3 py-1.5 leading-none',
        tone === 'yellow' ? 'border-ivancar-yellow/70 text-ivancar-yellow' : 'border-line-strong text-fg-75',
        className,
      )}
    >
      {live && (
        <span aria-hidden className="size-1.5 rounded-full bg-ivancar-yellow animate-pulse-dot motion-reduce:animate-none" />
      )}
      {children}
    </span>
  );
}
