import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { springs } from '@/theme/tokens';
import { IconCheck } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg';
export type ButtonState = 'idle' | 'loading' | 'success';

interface CommonProps {
  /** primary: amarillo IVANCAR · secondary: borde blanco · ghost: sin fondo. */
  variant?: ButtonVariant;
  /** md = 48 px de alto, lg = 56 px (acción principal en el sheet). */
  size?: ButtonSize;
  /** Ocupa todo el ancho del contenedor. */
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export interface ButtonProps extends CommonProps, Omit<HTMLMotionProps<'button'>, 'children' | 'className'> {
  /**
   * idle → loading → success. En loading el botón se deshabilita y muestra un indicador;
   * en success muestra un check. Con `morph`, el botón se contrae a círculo en ambos estados.
   */
  state?: ButtonState;
  /** Contraer a círculo durante loading/success ("Pedir taxi" → cargando → check). */
  morph?: boolean;
  /** Texto para lectores de pantalla en loading/success. */
  loadingLabel?: string;
  successLabel?: string;
}

export interface ButtonLinkProps extends CommonProps, Omit<HTMLMotionProps<'a'>, 'children' | 'className'> {
  href: string;
}

const HEIGHT: Record<ButtonSize, number> = { md: 48, lg: 56 };

const variantClass: Record<ButtonVariant, string> = {
  primary:
    'bg-ivancar-yellow text-on-yellow font-extrabold hover:bg-ivancar-yellow-soft shadow-[0_8px_30px_-10px_rgb(246_201_14/0.55)]',
  secondary: 'bg-transparent text-fg font-bold border border-line-strong hover:border-fg-55 hover:bg-white/5',
  ghost: 'bg-transparent text-fg-80 font-semibold hover:text-fg hover:bg-white/5',
};

function classes({ variant = 'primary', size = 'md', fullWidth, className }: CommonProps) {
  return cn(
    'relative inline-flex select-none items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-full',
    'transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none',
    size === 'lg' ? 'h-14 px-7 text-[17px]' : 'h-12 px-6 text-[15px]',
    fullWidth ? 'w-full' : '',
    variantClass[variant],
    className,
  );
}

const tap = { scale: 0.97 };

/** Botón píldora de marca. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    fullWidth,
    leadingIcon,
    trailingIcon,
    children,
    className,
    state = 'idle',
    morph = false,
    loadingLabel = 'Procesando',
    successLabel = 'Listo',
    disabled,
    type = 'button',
    onClick,
    ...rest
  },
  ref,
) {
  const reduce = useReducedMotion();
  const busy = state !== 'idle';
  const collapsed = morph && busy;
  const h = HEIGHT[size];

  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={disabled}
      aria-disabled={state === 'loading' || undefined}
      onClick={state === 'loading' ? undefined : onClick}
      aria-busy={state === 'loading' || undefined}
      whileTap={busy ? undefined : tap}
      initial={false}
      animate={morph ? { width: collapsed ? h : fullWidth ? '100%' : 'auto' } : undefined}
      transition={reduce ? { duration: 0 } : springs.snappy}
      className={cn(
        classes({ variant, size, fullWidth, className }),
        collapsed && 'px-0',
        state === 'loading' && 'pointer-events-none',
        state === 'success' && variant === 'primary' && 'bg-ivancar-yellow',
      )}
      {...rest}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {state === 'idle' && (
          <motion.span
            key="idle"
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {leadingIcon}
            {children}
            {trailingIcon}
          </motion.span>
        )}
        {state === 'loading' && (
          <motion.span
            key="loading"
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.18 }}
          >
            <Spinner />
            {!morph && <span>{loadingLabel}…</span>}
          </motion.span>
        )}
        {state === 'success' && (
          <motion.span
            key="success"
            className="inline-flex items-center gap-2"
            initial={{ opacity: 0, scale: 0.4, rotate: -30 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : springs.snappy}
          >
            <IconCheck size={22} />
            {!morph && <span>{successLabel}</span>}
          </motion.span>
        )}
      </AnimatePresence>
      <span className="sr-only" aria-live="polite">
        {state === 'loading' ? loadingLabel : state === 'success' ? successLabel : ''}
      </span>
    </motion.button>
  );
});

/** Mismo estilo que Button, como enlace (tel:, wa.me, rutas externas). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant = 'primary', size = 'md', fullWidth, leadingIcon, trailingIcon, children, className, ...rest },
  ref,
) {
  const external = /^https?:/.test(rest.href);
  return (
    <motion.a
      ref={ref}
      whileTap={tap}
      className={classes({ variant, size, fullWidth, className })}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </motion.a>
  );
});

function Spinner() {
  return (
    <span
      aria-hidden
      className="block size-5 animate-spin rounded-full border-[2.5px] border-current border-r-transparent motion-reduce:animate-none"
    />
  );
}
