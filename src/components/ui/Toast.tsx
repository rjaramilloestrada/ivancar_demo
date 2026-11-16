import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springs } from '@/theme/tokens';
import { IconAlert, IconCheck, IconClose, IconInfo } from './icons';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  title: string;
  description?: string;
  /** info (default) · success · warning (amarillo) · error. */
  tone?: ToastTone;
  /** ms antes de cerrarse solo. 0 = no se cierra solo. Default 4000. */
  duration?: number;
  /** Botón de acción opcional dentro del toast. */
  action?: { label: string; onClick: () => void };
  /** Si se repite el mismo id, reemplaza al anterior en vez de apilar. */
  id?: string;
}

interface ToastItem extends Required<Pick<ToastOptions, 'title' | 'tone' | 'duration'>> {
  id: string;
  description?: string;
  action?: ToastOptions['action'];
}

interface ToastApi {
  /** Muestra un toast y devuelve su id. */
  show: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let counter = 0;

export interface ToastProviderProps {
  children: ReactNode;
  /** Máximo de toasts visibles a la vez. Default 3. */
  max?: number;
}

/**
 * Proveedor de toasts. Se renderizan arriba (zona segura incluida), centrados,
 * con ancho máximo de teléfono. Desliza hacia arriba para cerrar.
 */
export function ToastProvider({ children, max = 3 }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = opts.id ?? `t${++counter}`;
      const item: ToastItem = {
        id,
        title: opts.title,
        description: opts.description,
        tone: opts.tone ?? 'info',
        duration: opts.duration ?? 4000,
        action: opts.action,
      };
      setItems((list) => [...list.filter((t) => t.id !== id), item].slice(-max));
      return id;
    },
    [max],
  );

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[1000] flex flex-col items-center gap-2 px-4 pt-[max(12px,env(safe-area-inset-top))]"
        role="region"
        aria-label="Notificaciones"
      >
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <ToastView key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

const toneStyle: Record<ToastTone, { icon: ReactNode; className: string }> = {
  info: { icon: <IconInfo size={18} />, className: 'bg-white/10 text-fg' },
  success: { icon: <IconCheck size={16} />, className: 'bg-success text-black' },
  warning: { icon: <IconAlert size={18} />, className: 'bg-ivancar-yellow text-on-yellow' },
  error: { icon: <IconAlert size={18} />, className: 'bg-danger text-black' },
};

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const reduce = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!item.duration || paused) return;
    timer.current = window.setTimeout(onDismiss, item.duration);
    return () => window.clearTimeout(timer.current);
  }, [item.duration, paused, onDismiss]);

  const tone = toneStyle[item.tone];
  const urgent = item.tone === 'error' || item.tone === 'warning';

  return (
    <motion.div
      layout={!reduce}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96, transition: { duration: 0.18 } }}
      transition={springs.gentle}
      drag={reduce ? false : 'y'}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.6, bottom: 0.1 }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -30 || info.velocity.y < -300) onDismiss();
      }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-[20px] border border-line-strong bg-surface-raised/95 p-3 pr-2 shadow-[0_16px_40px_rgb(0_0_0/0.55)] backdrop-blur-xl"
    >
      <span className={cn('mt-0.5 grid size-8 shrink-0 place-items-center rounded-full', tone.className)}>
        {tone.icon}
      </span>
      <div className="min-w-0 flex-1 py-1">
        <p className="text-[15px] font-bold leading-tight text-fg">{item.title}</p>
        {item.description && <p className="mt-0.5 text-sm leading-snug text-fg-65">{item.description}</p>}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
            className="label-caps -ml-3 mt-1 min-h-11 rounded-full px-3 text-ivancar-yellow hover:bg-white/5"
          >
            {item.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar notificación"
        className="grid size-11 shrink-0 place-items-center rounded-full text-fg-55 hover:bg-white/5 hover:text-fg"
      >
        <IconClose size={18} />
      </button>
    </motion.div>
  );
}
