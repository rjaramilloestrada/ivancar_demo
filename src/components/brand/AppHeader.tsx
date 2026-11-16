import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Logo } from './Logo';

export interface AppHeaderProps {
  /** Contenido a la derecha (acciones). */
  right?: ReactNode;
  className?: string;
}

/** Barra superior fija: negro al 85 % con blur, como su web. */
export function AppHeader({ right, className }: AppHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-line bg-header px-4 pt-safe backdrop-blur-xl',
        className,
      )}
    >
      <div className="flex h-14 items-center">
        <Logo height={24} />
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}
