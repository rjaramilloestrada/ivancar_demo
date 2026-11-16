import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface DialogProps {
  open: boolean;
  /** Se llama al cerrar con Escape, tocando fuera o con un botón que lo pida. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** Ícono opcional sobre el título. */
  icon?: ReactNode;
  /** Contenido extra entre la descripción y las acciones. */
  children?: ReactNode;
  /** Botones (de arriba hacia abajo). El primero con `autoFocus` recibe el foco. */
  actions?: ReactNode;
  /** 'danger' tiñe el ícono de rojo (cancelar, emergencia). */
  tone?: 'default' | 'danger';
  className?: string;
}

/**
 * Diálogo modal sobre `<dialog>` nativo: foco atrapado, Escape y fondo inerte gratis.
 * En móvil se apoya abajo (zona del pulgar); en pantallas anchas va centrado.
 * La entrada usa CSS (respetada por prefers-reduced-motion en index.css).
 */
export function Dialog({ open, onClose, title, description, icon, children, actions, tone = 'default', className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Cerrar el diálogo nativo (Escape) también actualiza el estado del dueño.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onCloseRef.current();
    };
    d.addEventListener('cancel', onCancel);
    return () => d.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClick={(e) => {
        // Toque en el fondo (fuera de la tarjeta) → cerrar.
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        'iv-dialog m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-[2px]',
        'sm:m-auto sm:max-w-[420px]',
        className,
      )}
    >
      {open && (
        <div className="mx-3 mb-[max(12px,env(safe-area-inset-bottom))] rounded-[28px] border border-line-strong bg-surface-raised p-6 shadow-sheet sm:mx-0 sm:mb-0">
          {icon && (
            <span
              className={cn(
                'mb-4 grid size-12 place-items-center rounded-full',
                tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-ivancar-yellow/15 text-ivancar-yellow',
              )}
            >
              {icon}
            </span>
          )}
          <h2 id={titleId} className="text-[22px] font-extrabold leading-tight">
            {title}
          </h2>
          {description && (
            <div id={descId} className="mt-2 text-[15px] leading-snug text-fg-75">
              {description}
            </div>
          )}
          {children}
          {actions && <div className="mt-6 flex flex-col gap-2">{actions}</div>}
        </div>
      )}
    </dialog>
  );
}
