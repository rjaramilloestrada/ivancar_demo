import { motion, type Transition } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMap } from 'react-leaflet';
import { cn } from '@/lib/cn';
import type { LatLng } from '@/types';
import { useMapView } from './MapView';

export type PinState = 'idle' | 'lifted' | 'dropping';

export interface PinMoveInfo {
  /** true si el movimiento lo inició el usuario (arrastre, rueda, pellizco). */
  user: boolean;
}

export interface DraggablePinProps {
  /** El mapa empezó a moverse (el pin se levanta). */
  onMoveStart?: (info: PinMoveInfo) => void;
  /** El mapa se detuvo: coordenada bajo la punta del pin. */
  onMoveEnd?: (latlng: LatLng, info: PinMoveInfo) => void;
  /** Llama onMoveEnd al montar con la coordenada inicial. Default true. */
  emitInitial?: boolean;
  /** Texto principal de la burbuja sobre el pin (p. ej. la dirección). */
  label?: ReactNode;
  /** Texto secundario de la burbuja. */
  sublabel?: ReactNode;
  /** Muestra un shimmer en la burbuja mientras se resuelve la dirección. */
  labelLoading?: boolean;
  /** Variante: recogida (amarillo) o destino (blanco). Default 'pickup'. */
  tone?: 'pickup' | 'destination';
  className?: string;
}

/** Ventana (ms) para atribuir un movimiento a un gesto del usuario. */
const USER_WINDOW_MS = 600;

/**
 * Pin fijo en el centro del ÁREA VISIBLE del mapa (descontando los insets de MapView):
 * el usuario mueve el mapa debajo. Se levanta al empezar a mover y cae con un rebote
 * corto al soltar; con prefers-reduced-motion cambia de estado sin animar.
 * Debe ir como hijo de <MapView>. No captura eventos: el mapa se arrastra a través de él.
 * `data-state` expone idle | lifted | dropping (útil para tests y para el Bloque 5).
 */
export function DraggablePin({
  onMoveStart,
  onMoveEnd,
  emitInitial = true,
  label,
  sublabel,
  labelLoading = false,
  tone = 'pickup',
  className,
}: DraggablePinProps) {
  const map = useMap();
  const { handle, internalMove, reduceMotion } = useMapView();
  const [state, setState] = useState<PinState>('idle');
  const stateRef = useRef<PinState>('idle');
  const lastGesture = useRef(0);
  const moveUser = useRef(false);
  const cbs = useRef({ onMoveStart, onMoveEnd });
  cbs.current = { onMoveStart, onMoveEnd };

  const set = (s: PinState) => {
    stateRef.current = s;
    setState(s);
  };

  useEffect(() => {
    const el = map.getContainer();
    const mark = () => (lastGesture.current = performance.now());
    el.addEventListener('pointerdown', mark, { passive: true });
    el.addEventListener('wheel', mark, { passive: true });
    el.addEventListener('touchstart', mark, { passive: true });

    const onStart = () => {
      if (internalMove.current) return;
      const user = performance.now() - lastGesture.current < USER_WINDOW_MS;
      moveUser.current = user;
      if (stateRef.current !== 'lifted') {
        set('lifted');
        cbs.current.onMoveStart?.({ user });
      }
    };
    const onDragStart = () => {
      moveUser.current = true;
      onStart();
    };
    const onEnd = () => {
      // Movimientos propios de MapView (compensar insets) no sueltan el pin.
      if (internalMove.current || stateRef.current !== 'lifted') return;
      set('dropping');
      const c = handle.getVisibleCenter();
      if (c) cbs.current.onMoveEnd?.(c, { user: moveUser.current });
    };
    map.on('movestart', onStart);
    map.on('zoomstart', onStart);
    map.on('dragstart', onDragStart);
    map.on('moveend', onEnd);

    if (emitInitial) {
      const c = handle.getVisibleCenter();
      if (c) cbs.current.onMoveEnd?.(c, { user: false });
    }
    return () => {
      el.removeEventListener('pointerdown', mark);
      el.removeEventListener('wheel', mark);
      el.removeEventListener('touchstart', mark);
      map.off('movestart', onStart);
      map.off('zoomstart', onStart);
      map.off('dragstart', onDragStart);
      map.off('moveend', onEnd);
    };
    // emitInitial solo importa al montar.
  }, [map, handle, internalMove]);

  // Tras la caída, volver a idle.
  useEffect(() => {
    if (state !== 'dropping') return;
    const t = setTimeout(() => set('idle'), reduceMotion ? 0 : 420);
    return () => clearTimeout(t);
  }, [state, reduceMotion]);

  const lifted = state === 'lifted';
  const headTransition: Transition = reduceMotion
    ? { duration: 0 }
    : lifted
      ? { type: 'spring', stiffness: 520, damping: 30 }
      : { type: 'spring', stiffness: 720, damping: 13, mass: 0.8 }; // caída con rebote corto

  const yellow = tone === 'pickup';
  const showLabel = !!label && !lifted;

  return (
    <div
      aria-hidden
      data-pin-state={state}
      className={cn(
        'pointer-events-none absolute z-[5]',
        !reduceMotion && 'transition-[top,left] duration-[350ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
        className,
      )}
      style={{
        left: 'calc(var(--map-inset-left, 0px) + (100% - var(--map-inset-left, 0px) - var(--map-inset-right, 0px)) / 2)',
        top: 'calc(var(--map-inset-top, 0px) + (100% - var(--map-inset-top, 0px) - var(--map-inset-bottom, 0px)) / 2)',
        width: 0,
        height: 0,
      }}
    >
      {/* Sombra en el suelo: marca el punto exacto. */}
      <motion.span
        className="absolute left-0 top-0 block h-[7px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-black/70 blur-[1.5px]"
        animate={{ scale: lifted ? 0.55 : 1, opacity: lifted ? 0.45 : 1 }}
        transition={headTransition}
      />
      <span
        className={cn(
          'absolute left-0 top-0 block size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full',
          yellow ? 'bg-ivancar-yellow' : 'bg-white',
        )}
      />

      {/* Cabeza + palito: la punta del palito toca el punto. */}
      <motion.div
        className="absolute bottom-0 left-0 flex -translate-x-1/2 flex-col items-center"
        initial={false}
        animate={{ y: lifted ? -16 : 0, scale: lifted ? 1.06 : 1 }}
        transition={headTransition}
        style={{ transformOrigin: '50% 100%' }}
      >
        {/* Burbuja con la dirección */}
        <motion.div
          initial={false}
          animate={{ opacity: showLabel ? 1 : 0, y: showLabel ? 0 : 6 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18 }}
          className="mb-2 max-w-[min(78vw,280px)] rounded-2xl border border-line-strong bg-surface/95 px-3.5 py-2 text-center shadow-sheet backdrop-blur-md"
          data-testid="pin-label"
        >
          {labelLoading && !label ? (
            <span className="block h-3.5 w-32 animate-shimmer rounded-full bg-[linear-gradient(90deg,rgb(255_255_255/0.06),rgb(255_255_255/0.16),rgb(255_255_255/0.06))] bg-[length:200%_100%]" />
          ) : (
            <>
              <span className="block truncate text-[13px] font-bold leading-tight text-fg">{label}</span>
              {sublabel && <span className="mt-0.5 block truncate text-[11px] leading-tight text-fg-65">{sublabel}</span>}
            </>
          )}
        </motion.div>

        <span
          className={cn(
            'grid size-11 place-items-center rounded-full shadow-[0_8px_24px_rgb(0_0_0/0.55)]',
            yellow ? 'bg-ivancar-yellow shadow-glow' : 'bg-white',
          )}
        >
          <span className="size-3.5 rounded-full bg-black" />
        </span>
        <span className={cn('h-4 w-[3px] rounded-b-full', yellow ? 'bg-ivancar-yellow' : 'bg-white')} />
      </motion.div>
    </div>
  );
}
