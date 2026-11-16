import { useRef, type ReactNode } from 'react';
import {
  IconBag,
  IconBriefcase,
  IconCar,
  IconChevronLeft,
  IconGraduation,
  IconHome,
  IconLandmark,
  IconPlane,
  IconStar,
  IconWave,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import type { FleetUnit, PaymentMethod, PlaceCategory } from '@/types';
import { useStepFocus } from './hooks';

/** Botón redondo de 44 px solo con ícono (siempre con nombre accesible). */
export function IconButton({
  label,
  children,
  onClick,
  className,
  tone = 'default',
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full border transition-colors',
        tone === 'danger'
          ? 'border-danger/50 bg-danger/10 text-danger hover:bg-danger/20'
          : 'border-line-strong bg-surface-raised text-fg hover:border-fg-55',
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface SheetTitleProps {
  title: ReactNode;
  /** Línea pequeña sobre el título. */
  eyebrow?: ReactNode;
  /** Texto bajo el título. */
  subtitle?: ReactNode;
  /** Muestra "Volver". */
  onBack?: () => void;
  /** Acción a la derecha (p. ej. emergencia). */
  right?: ReactNode;
  /** Tamaño del título: 'lg' = display de marca. */
  size?: 'md' | 'lg';
  /** Mueve el foco al título al montar (default true). */
  focus?: boolean;
  className?: string;
}

/** Cabecera de cada paso: volver + título enfocable + subtítulo. */
export function SheetTitle({ title, eyebrow, subtitle, onBack, right, size = 'md', focus = true, className }: SheetTitleProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useStepFocus(ref, focus);
  return (
    <div className={cn('flex items-start gap-3', className)}>
      {onBack && (
        <IconButton label="Volver" onClick={onBack} className="-ml-1 mt-0.5">
          <IconChevronLeft size={22} />
        </IconButton>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="label-caps mb-1.5 text-ivancar-yellow">{eyebrow}</p>}
        <h2
          ref={ref}
          tabIndex={-1}
          className={cn(
            'outline-none',
            size === 'lg' ? 'title-display text-[30px]' : 'text-[22px] font-extrabold leading-tight tracking-[-0.01em]',
            onBack && size === 'md' && 'pt-2',
          )}
        >
          {title}
        </h2>
        {subtitle && <div className="mt-1.5 text-[14px] leading-snug text-fg-65">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

/** Ícono para la categoría de un lugar. */
export function PlaceIcon({ category, kind, size = 18 }: { category?: PlaceCategory; kind?: 'home' | 'work' | 'other'; size?: number }) {
  if (kind === 'home') return <IconHome size={size} />;
  if (kind === 'work') return <IconBriefcase size={size} />;
  switch (category) {
    case 'airport':
      return <IconPlane size={size} />;
    case 'bus_terminal':
      return <IconCar size={size} />;
    case 'mall':
      return <IconBag size={size} />;
    case 'university':
      return <IconGraduation size={size} />;
    case 'business':
      return <IconBriefcase size={size} />;
    case 'residential':
      return <IconHome size={size} />;
    case 'nature':
      return <IconWave size={size} />;
    default:
      return <IconLandmark size={size} />;
  }
}

/** Recogida → destino en dos líneas con puntos de color. */
export function RouteSummary({ from, to, className }: { from: string; to: string; className?: string }) {
  return (
    <div className={cn('relative flex flex-col gap-3 pl-6', className)}>
      <span aria-hidden className="absolute left-[5px] top-[9px] h-[calc(100%-18px)] w-px bg-line-strong" />
      <p className="relative min-w-0">
        <span aria-hidden className="absolute -left-6 top-[6px] size-[11px] rounded-full border-2 border-ivancar-yellow bg-ivancar-black" />
        <span className="sr-only">Recogida: </span>
        <span className="block truncate text-[15px] font-semibold">{from}</span>
      </p>
      <p className="relative min-w-0">
        <span aria-hidden className="absolute -left-6 top-[6px] size-[11px] rounded-[3px] bg-white" />
        <span className="sr-only">Destino: </span>
        <span className="block truncate text-[15px] font-semibold">{to}</span>
      </p>
    </div>
  );
}

/** Avatar generado (iniciales + tono): sin fotos de personas reales. */
export function Avatar({ unit, size = 56 }: { unit: FleetUnit; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-black text-white ring-2 ring-ivancar-yellow/70"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, hsl(${unit.avatar_hue} 42% 34%), hsl(${(unit.avatar_hue + 40) % 360} 38% 20%))`,
      }}
    >
      {unit.initials}
    </span>
  );
}

/** Placa grande y legible (formato del Guayas, ficticia). */
export function Plate({ plate, className }: { plate: string; className?: string }) {
  return (
    <span className={cn('inline-flex flex-col items-center rounded-lg bg-white px-2.5 pb-1 pt-0.5 text-black', className)}>
      <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-black/60">Placa</span>
      <span className="font-black text-[19px] leading-none tracking-[0.06em]" data-testid="plate">
        {plate}
      </span>
    </span>
  );
}

export function Rating({ value, trips }: { value: number; trips?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-fg-75">
      <IconStar size={14} filled className="text-ivancar-yellow" />
      <span className="font-semibold text-fg">{value.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span>
      {trips != null && <span>· {trips.toLocaleString('es-EC')} viajes</span>}
    </span>
  );
}

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  voucher: 'Vale corporativo',
};

/** Aviso en línea (ruta aproximada, ubicación aproximada, simulado…). */
export function InlineNote({ children, icon, className }: { children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-[13px] leading-snug text-fg-65', className)}>
      {icon && <span className="mt-px shrink-0 text-ivancar-yellow">{icon}</span>}
      <span>{children}</span>
    </p>
  );
}

/** Tarjeta del conductor: quién es (arriba) y qué auto buscar, con la placa grande (abajo). */
export function DriverCard({ unit, className }: { unit: FleetUnit; className?: string }) {
  const v = unit.vehicle;
  return (
    <div className={cn('rounded-[20px] border border-line bg-surface-raised p-4', className)} data-testid="driver-card">
      <div className="flex items-center gap-3">
        <Avatar unit={unit} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold" data-testid="driver-name">
            {unit.display_name}
          </p>
          <Rating value={unit.rating} trips={unit.trips_count} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <p className="min-w-0 text-[14px] leading-snug">
          <span className="block truncate font-semibold">
            {v.make} {v.model}
          </span>
          <span className="flex items-center gap-1.5 text-fg-65">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full border border-white/30" style={{ background: v.color_hex }} />
            {v.color} · {v.year}
          </span>
        </p>
        <Plate plate={v.plate} />
      </div>
    </div>
  );
}
