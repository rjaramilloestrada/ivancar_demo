import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springs } from '@/theme/tokens';

export type CardVariant = 'surface' | 'raised' | 'outline';

export interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  /** surface: #0C0C0C con borde 10 % · raised: un tono más claro · outline: transparente con borde 15 %. */
  variant?: CardVariant;
  /** Escala y brillo amarillo (tarjetas de servicio seleccionables). */
  selected?: boolean;
  /** Respuesta al toque (hover + press). Úsalo con onClick o dentro de un botón. */
  interactive?: boolean;
  /** Padding interno: none | sm (12) | md (20) | lg (24). */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  children?: ReactNode;
}

const variantClass: Record<CardVariant, string> = {
  surface: 'bg-surface border border-line',
  raised: 'bg-surface-raised border border-line',
  outline: 'bg-transparent border border-line-strong',
};
const padClass = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-6' } as const;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'surface', selected = false, interactive = false, padding = 'md', className, children, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      initial={false}
      animate={{ scale: selected ? 1.02 : 1 }}
      whileTap={interactive ? { scale: selected ? 1.0 : 0.98 } : undefined}
      transition={springs.snappy}
      className={cn(
        'relative rounded-card transition-[border-color,box-shadow,background-color] duration-300',
        variantClass[variant],
        padClass[padding],
        interactive && 'cursor-pointer hover:border-line-strong',
        selected && 'border-ivancar-yellow shadow-glow',
        className,
      )}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

export interface HeroCardProps {
  /** URL de la imagen (usar asset('img/…')). */
  image: string;
  /** Texto alternativo; vacío si es decorativa. */
  imageAlt: string;
  /** srcSet opcional para versiones responsive. */
  imageSrcSet?: string;
  imageSizes?: string;
  /** Contenido sobre la foto (título, eyebrow, botón). Va abajo, con overlay oscuro. */
  children?: ReactNode;
  className?: string;
}

/** Tarjeta hero: esquinas 32 px, foto a sangre con overlay oscuro (como su web). */
export function HeroCard({ image, imageAlt, imageSrcSet, imageSizes, children, className }: HeroCardProps) {
  return (
    <div className={cn('relative isolate overflow-hidden rounded-hero border border-line bg-surface', className)}>
      <img
        src={image}
        srcSet={imageSrcSet}
        sizes={imageSizes}
        alt={imageAlt}
        className="absolute inset-0 -z-10 size-full object-cover"
        decoding="async"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-ivancar-black via-ivancar-black/70 to-ivancar-black/10"
      />
      <div className="flex h-full flex-col justify-end p-6">{children}</div>
    </div>
  );
}
