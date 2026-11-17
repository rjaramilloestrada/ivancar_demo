import { cn } from '@/lib/cn';

/**
 * Fondo del mapa mientras carga: liso, del mismo color que el mapa base, con un barrido de
 * luz muy tenue. Sin geografía inventada: lo que se ve después es el mapa real.
 */
export function MapSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('absolute inset-0 overflow-hidden bg-map', className)}>
      <div className="absolute inset-0 animate-shimmer bg-[linear-gradient(100deg,transparent_35%,rgb(255_255_255/0.035)_50%,transparent_65%)] bg-[length:250%_100%] motion-reduce:animate-none" />
    </div>
  );
}
