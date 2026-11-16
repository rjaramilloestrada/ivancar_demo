import { cn } from '@/lib/cn';

/**
 * Fondo decorativo con aspecto de mapa nocturno (calles + río), en SVG puro.
 * Se usa mientras no exista MapView (bloque 2) y como fondo de vistas de carga.
 */
export function MapBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('absolute inset-0 overflow-hidden bg-[#0b0c0e]', className)}>
      <svg className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 400 800">
        <defs>
          <pattern id="mb-grid" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
            <path d="M46 0H0V46" fill="none" stroke="#1a1c20" strokeWidth="1.2" />
          </pattern>
          <radialGradient id="mb-vignette" cx="50%" cy="42%" r="70%">
            <stop offset="55%" stopColor="#050505" stopOpacity="0" />
            <stop offset="100%" stopColor="#050505" stopOpacity="0.9" />
          </radialGradient>
        </defs>
        <rect width="400" height="800" fill="url(#mb-grid)" />
        {/* Río */}
        <path d="M-20 120 C 90 180, 60 320, 150 400 S 260 560, 230 820" fill="none" stroke="#10161d" strokeWidth="46" />
        {/* Avenidas */}
        <g fill="none" stroke="#24272d" strokeLinecap="round">
          <path d="M-10 520 C 120 470, 260 470, 420 380" strokeWidth="7" />
          <path d="M300 -10 C 280 200, 330 420, 290 820" strokeWidth="6" />
          <path d="M-10 250 L 420 300" strokeWidth="4" />
          <path d="M60 820 C 90 650, 40 560, 120 430" strokeWidth="4" />
        </g>
        <rect width="400" height="800" fill="url(#mb-vignette)" />
      </svg>
    </div>
  );
}
