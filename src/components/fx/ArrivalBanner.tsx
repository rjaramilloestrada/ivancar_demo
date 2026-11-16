import './fx.css';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { IconCar, IconClose } from '@/components/ui/icons';
import { vibrate } from '@/lib/haptics';
import { cn } from '@/lib/cn';

export interface ArrivalBannerProps {
  open: boolean;
  /** Placa de la unidad ("GSB-4821"). */
  plate: string;
  /** "Kia Soluto blanco". */
  vehicle?: string;
  /** Nombre del conductor. */
  driver?: string;
  /** Título. Default "Tu IVANCAR llegó". */
  title?: string;
  onClose?: () => void;
  /** Se cierra solo tras estos ms (llama onClose). Default: no se cierra solo. */
  autoHideMs?: number;
  /** Vibración 'arrival' al abrir (Android; nunca con reduced motion). Default true. */
  haptic?: boolean;
  /** 'fixed' (default): flota arriba de la pantalla. 'inline': en el flujo (dentro del sheet). */
  placement?: 'fixed' | 'inline';
  className?: string;
}

/**
 * Aviso "Tu IVANCAR llegó": cae desde arriba con un resorte, el ícono late tres veces con
 * ondas amarillas y muestra la placa en grande (lo que el pasajero busca en la calle).
 * Se anuncia a lectores de pantalla (role=status, assertive). Con reduced motion: fundido.
 *
 * @example
 * <ArrivalBanner open={arrived} plate={unit.vehicle.plate} vehicle="Kia Soluto blanco" onClose={() => setSeen(true)} />
 */
export function ArrivalBanner({
  open,
  plate,
  vehicle,
  driver,
  title = 'Tu IVANCAR llegó',
  onClose,
  autoHideMs,
  haptic = true,
  placement = 'fixed',
  className,
}: ArrivalBannerProps) {
  const reduce = useReducedMotion();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    if (haptic) vibrate('arrival');
    if (!autoHideMs) return;
    const t = setTimeout(() => closeRef.current?.(), autoHideMs);
    return () => clearTimeout(t);
  }, [open, haptic, autoHideMs]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="arrival"
          role="status"
          aria-live="assertive"
          aria-atomic="true"
          className={cn(
            placement === 'fixed' && 'fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[1050] mx-auto max-w-md',
            className,
          )}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -90, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -40, scale: 0.97, transition: { duration: 0.2 } }}
          transition={reduce ? { duration: 0.2 } : { type: 'spring', stiffness: 420, damping: 26, mass: 0.9 }}
          data-testid="arrival-banner"
        >
          <div className="relative overflow-hidden rounded-[24px] border border-ivancar-yellow/60 bg-[#121108]/95 p-3.5 pr-3 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.8),0_0_0_1px_rgb(246_201_14/0.15),0_10px_40px_-14px_rgb(246_201_14/0.55)] backdrop-blur-md">
            {/* Luz que barre una vez al entrar */}
            {!reduce && <span aria-hidden className="iv-sheen" />}
            <div className="relative flex items-center gap-3.5">
              <span className="relative grid size-12 shrink-0 place-items-center">
                {!reduce && (
                  <span aria-hidden className="absolute -inset-5">
                    <span className="iv-arrival-ring" />
                    <span className="iv-arrival-ring" style={{ animationDelay: '0.45s' }} />
                  </span>
                )}
                <motion.span
                  className="relative grid size-12 place-items-center rounded-full bg-ivancar-yellow text-on-yellow shadow-[0_0_24px_rgb(246_201_14/0.55)]"
                  initial={reduce ? false : { scale: 0.4, rotate: -20 }}
                  animate={reduce ? undefined : { scale: [0.4, 1.12, 1, 1.08, 1, 1.06, 1], rotate: 0 }}
                  transition={{ duration: 1.9, times: [0, 0.16, 0.3, 0.48, 0.62, 0.8, 1], ease: 'easeOut', delay: 0.08 }}
                >
                  <IconCar size={24} />
                </motion.span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="label-caps text-[10px] text-ivancar-yellow">Te está esperando</p>
                <p className="title-display mt-1 truncate text-[22px] leading-none text-fg">{title}</p>
              </div>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Cerrar aviso"
                  className="-my-2 -mr-1 grid size-11 shrink-0 place-items-center self-start rounded-full text-fg-65 hover:bg-white/5 hover:text-fg"
                >
                  <IconClose size={18} />
                </button>
              )}
            </div>
            <div className="relative mt-3 flex items-center justify-between gap-3 rounded-2xl bg-black/40 py-2 pl-3.5 pr-2">
              <p className="min-w-0 text-[13px] leading-snug text-fg-65">
                <span className="block truncate font-semibold text-fg">{vehicle ?? 'Busca la placa'}</span>
                {driver && <span className="block truncate">{driver}</span>}
              </p>
              <span className="inline-flex shrink-0 flex-col items-center rounded-lg bg-white px-2.5 pb-1 pt-0.5 text-black shadow-[0_4px_14px_rgb(0_0_0/0.4)]">
                <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-black/60">Placa</span>
                <span className="text-[20px] font-black leading-none tracking-[0.05em]" data-testid="arrival-plate">
                  {plate}
                </span>
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
