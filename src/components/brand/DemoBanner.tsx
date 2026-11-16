import { cn } from '@/lib/cn';

/** Aviso discreto obligatorio en todas las vistas (PLAN_IVANCAR.md §4). */
export function DemoBanner({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'label-caps pointer-events-none inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[10px] tracking-[0.16em] text-fg-65 backdrop-blur-md',
        className,
      )}
    >
      Demo conceptual · IGNIS
    </p>
  );
}
