import { asset } from '@/lib/links';
import { cn } from '@/lib/cn';

export interface LogoProps {
  /** Alto en px (el ancho sigue la proporción 1412×287 del original). Default 28. */
  height?: number;
  className?: string;
}

/** Logo oficial IVANCAR (versión WebP de 700 px generada desde ivancarlogo.png). */
export function Logo({ height = 28, className }: LogoProps) {
  const width = Math.round((height * 1412) / 287);
  return (
    <img
      src={asset('img/ivancarlogo-700.webp')}
      alt="IVANCAR"
      width={width}
      height={height}
      className={cn('block select-none', className)}
      draggable={false}
    />
  );
}
