import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react';
import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { springs } from '@/theme/tokens';

export type SheetSnap = 'peek' | 'half' | 'full';
const ORDER: SheetSnap[] = ['peek', 'half', 'full'];

export interface BottomSheetProps {
  /** Nombre accesible de la región (p. ej. "Pedir taxi"). */
  'aria-label': string;
  /** Snap controlado. Si se omite, el sheet maneja su propio estado (ver defaultSnap). */
  snap?: SheetSnap;
  /** Snap inicial en modo no controlado. Default 'half'. */
  defaultSnap?: SheetSnap;
  /** Se llama cuando el usuario cambia de snap (arrastre, toque o teclado). */
  onSnapChange?: (snap: SheetSnap) => void;
  /**
   * Alto visible (px) del snap actual, para que el mapa descuente la zona tapada
   * (MapView `insets.bottom`). Se llama al medir y cada vez que cambia.
   */
  onHeightChange?: (height: number, snap: SheetSnap) => void;
  /** Zona siempre visible bajo el asa (forma parte del peek). También sirve para arrastrar. */
  header?: ReactNode;
  /** Contenido principal. En 'full' hace scroll si no cabe. */
  children?: ReactNode;
  /** Acción fija abajo (zona del pulgar). Se mantiene visible en los tres snaps. */
  footer?: ReactNode;
  /** Alto del peek en px. Default: asa + header + footer medidos. */
  peekHeight?: number;
  /** Alto del snap medio como fracción del contenedor. Default 0.5. */
  halfRatio?: number;
  /** Espacio libre arriba en 'full' (px). Default 16. */
  topOffset?: number;
  /** Oscurece lo que hay detrás al acercarse a 'full'; tocarlo vuelve a 'half'. Default true. */
  backdrop?: boolean;
  className?: string;
}

/**
 * Bottom sheet con arrastre y tres alturas (peek / medio / completo).
 *
 * - Se posiciona `absolute` al fondo de su contenedor padre: el padre debe ser
 *   `relative`, `overflow-hidden` y con alto definido (pantalla completa o el marco
 *   de teléfono de /demo).
 * - Las alturas se adaptan al contenido: si el contenido es corto, 'full' mide lo
 *   que mide el contenido y los snaps que coinciden se fusionan.
 * - Solo anima transform (y), con resorte. Con prefers-reduced-motion salta sin animar.
 * - Accesible: región con nombre, asa como botón (Enter/Espacio rota, flechas suben/bajan),
 *   contenido oculto en peek marcado `inert`, foco por teclado en contenido recortado
 *   expande a 'full'.
 */
export function BottomSheet({
  'aria-label': ariaLabel,
  snap: snapProp,
  defaultSnap = 'half',
  onSnapChange,
  onHeightChange,
  header,
  children,
  footer,
  peekHeight,
  halfRatio = 0.5,
  topOffset = 16,
  backdrop = true,
  className,
}: BottomSheetProps) {
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const bodyId = useId();

  const [inner, setInner] = useState<SheetSnap>(snapProp ?? defaultSnap);
  const snap = snapProp ?? inner;

  const sheetRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [m, setM] = useState({ container: 0, handle: 0, header: 0, content: 0, footer: 0 });
  const measured = m.container > 0;

  // Medición: contenedor padre + partes del sheet (alto natural del contenido).
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const parent = sheet?.parentElement;
    if (!sheet || !parent) return;
    const read = () =>
      setM({
        container: parent.clientHeight,
        handle: handleRef.current?.offsetHeight ?? 0,
        header: headerRef.current?.offsetHeight ?? 0,
        content: contentRef.current?.offsetHeight ?? 0,
        footer: footerRef.current?.offsetHeight ?? 0,
      });
    read();
    const ro = new ResizeObserver(read);
    [parent, handleRef.current, headerRef.current, contentRef.current, footerRef.current].forEach(
      (el) => el && ro.observe(el),
    );
    return () => ro.disconnect();
  }, []);

  const natural = m.handle + m.header + m.content + m.footer;
  const fullH = Math.max(0, Math.min(natural, m.container - topOffset));
  const peekH = Math.min(fullH, Math.max(72, peekHeight ?? m.handle + m.header + m.footer));
  const halfH = Math.min(fullH, Math.max(peekH, Math.round(m.container * halfRatio)));
  const heights: Record<SheetSnap, number> = { peek: peekH, half: halfH, full: fullH };

  // y = cuánto se esconde el sheet bajo el borde inferior.
  const y = useMotionValue(10000);
  const footerY = useTransform(y, (v) => -v);
  const backdropOpacity = useTransform(y, [0, Math.max(1, fullH - halfH)], [1, 0], { clamp: true });

  const animateTo = useCallback(
    (target: SheetSnap) => {
      const to = fullH - heights[target];
      if (reduce) y.set(to);
      else animate(y, to, springs.sheet);
    },
    [fullH, peekH, halfH, reduce, y],
  );

  // Entrada desde abajo al medir por primera vez y reajuste cuando cambian alturas o snap.
  const first = useRef(true);
  useLayoutEffect(() => {
    if (!measured) return;
    if (first.current) {
      first.current = false;
      y.set(reduce ? fullH - heights[snap] : fullH);
    }
    animateTo(snap);
  }, [measured, snap, animateTo]);

  const setSnap = useCallback(
    (next: SheetSnap) => {
      if (snapProp === undefined) setInner(next);
      onSnapChange?.(next);
      animateTo(next);
    },
    [snapProp, onSnapChange, animateTo],
  );

  // Snaps distintos (si el contenido es corto, half y full pueden coincidir).
  // 'full' siempre existe; 'half' y 'peek' se descartan si coinciden con su vecino.
  const distinct = ORDER.filter((s) => {
    if (s === 'full') return true;
    if (s === 'peek') return fullH - peekH > 8;
    return halfH - peekH > 8 && fullH - halfH > 8;
  });
  const effective: SheetSnap = distinct.includes(snap)
    ? snap
    : snap === 'half' && distinct.includes('peek') && halfH - peekH <= 8
      ? 'peek'
      : 'full';

  // Se usa el desplazamiento del puntero (no y.get()), que es exacto aunque el
  // último frame del arrastre aún no se haya pintado.
  const dragStartY = useRef(0);
  const onDragStart = () => {
    dragStartY.current = y.get();
    // Evita seleccionar texto al arrastrar con mouse.
    window.getSelection()?.removeAllRanges();
    document.documentElement.style.userSelect = 'none';
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    document.documentElement.style.userSelect = '';
    const endY = Math.min(fullH - peekH, Math.max(0, dragStartY.current + info.offset.y));
    const projected = fullH - (endY + info.velocity.y * 0.2);
    let best: SheetSnap = distinct[0];
    for (const s of distinct) {
      if (Math.abs(heights[s] - projected) < Math.abs(heights[best] - projected)) best = s;
    }
    setSnap(best);
  };

  const startDrag = (e: ReactPointerEvent) => controls.start(e);
  const startBodyDrag = (e: ReactPointerEvent) => {
    if (effective !== 'full') controls.start(e);
  };

  const step = (dir: 1 | -1) => {
    const i = distinct.indexOf(effective);
    const next = distinct[Math.min(distinct.length - 1, Math.max(0, i + dir))];
    if (next !== effective) setSnap(next);
  };
  const cycle = () => {
    const i = distinct.indexOf(effective);
    setSnap(distinct[(i + 1) % distinct.length]);
  };
  const onHandleKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      step(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      step(-1);
    }
  };

  // Foco de teclado en contenido recortado → expandir.
  const onBodyFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (effective === 'full') return;
    const el = e.target as HTMLElement;
    if (!el.matches(':focus-visible')) return;
    const sheetBottom = sheetRef.current?.parentElement?.getBoundingClientRect().bottom ?? window.innerHeight;
    if (el.getBoundingClientRect().bottom > sheetBottom - m.footer) setSnap('full');
  };

  const onHeightRef = useRef(onHeightChange);
  onHeightRef.current = onHeightChange;
  const effectiveHeight = heights[effective];
  useLayoutEffect(() => {
    if (measured) onHeightRef.current?.(effectiveHeight, effective);
  }, [measured, effectiveHeight, effective]);

  const label: Record<SheetSnap, string> = { peek: 'contraído', half: 'a media altura', full: 'expandido' };
  const nextLabel = distinct[(distinct.indexOf(effective) + 1) % distinct.length];

  return (
    <>
      {backdrop && distinct.length > 1 && (
        <motion.div
          aria-hidden
          style={{ opacity: backdropOpacity }}
          className={cn(
            'absolute inset-0 z-30 bg-black/55',
            effective === 'full' ? 'pointer-events-auto' : 'pointer-events-none',
          )}
          onClick={() => setSnap(distinct.includes('half') ? 'half' : distinct[0])}
        />
      )}
      <motion.section
        ref={sheetRef}
        aria-label={ariaLabel}
        drag="y"
        dragControls={controls}
        dragListener={false}
        dragMomentum={false}
        dragConstraints={{ top: 0, bottom: Math.max(0, fullH - peekH) }}
        dragElastic={{ top: 0.08, bottom: 0.25 }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{ y, height: fullH || undefined, visibility: measured ? 'visible' : 'hidden' }}
        className={cn(
          'absolute inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-sheet border-t border-line bg-surface shadow-sheet will-change-transform',
          className,
        )}
      >
        {/* Asa */}
        <div ref={handleRef} className="relative h-6 shrink-0 touch-none select-none" onPointerDown={startDrag}>
          <span aria-hidden className="absolute left-1/2 top-2.5 h-[5px] w-10 -translate-x-1/2 rounded-full bg-white/25" />
          <button
            type="button"
            aria-controls={bodyId}
            aria-expanded={effective === 'full'}
            aria-label={`Panel ${label[effective]}. Toca para ${nextLabel === 'full' ? 'expandir' : nextLabel === 'peek' ? 'contraer' : 'llevar a media altura'}; usa las flechas para ajustar.`}
            onClick={cycle}
            onKeyDown={onHandleKey}
            className="absolute left-1/2 top-0 z-10 h-11 w-28 -translate-x-1/2 rounded-full focus-visible:outline-offset-[-4px]"
          />
        </div>

        {header && (
          <div ref={headerRef} className="shrink-0 touch-none select-none px-5 pb-3" onPointerDown={startDrag}>
            {header}
          </div>
        )}

        <div
          ref={bodyRef}
          id={bodyId}
          inert={effective === 'peek'}
          onPointerDown={startBodyDrag}
          onFocus={onBodyFocus}
          className={cn(
            'min-h-0 flex-1 overscroll-contain',
            effective === 'full' ? 'touch-pan-y overflow-y-auto' : 'touch-none select-none overflow-hidden',
          )}
          style={{ paddingBottom: m.footer }}
        >
          <div ref={contentRef} className={cn('px-5', !footer && 'pb-safe')}>
            {children}
          </div>
        </div>

        {footer && (
          <motion.div
            ref={footerRef}
            style={{ y: footerY }}
            className="absolute inset-x-0 bottom-0 z-10 border-t border-line bg-surface/95 px-5 pt-3 pb-safe backdrop-blur-md"
          >
            {footer}
          </motion.div>
        )}
      </motion.section>
    </>
  );
}
