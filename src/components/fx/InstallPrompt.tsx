import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { IconClose } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { useInstall, type InstallPlatform } from '@/lib/install';
import { asset } from '@/lib/links';
import { springs } from '@/theme/tokens';

export type InstallResult = 'accepted' | 'dismissed' | 'unavailable' | 'ios-acknowledged';

export interface InstallPromptProps {
  /**
   * Quien integra decide el momento (p. ej. tras el primer viaje). El prompt solo aparece
   * si además `useInstall().canShow` es true (no instalada, no descartada, plataforma apta).
   */
  open: boolean;
  /** Se cierra (instaló, descartó o leyó las instrucciones). */
  onClose: (result: InstallResult) => void;
  /** Fuerza la variante (fx-lab / pruebas). Ignora `canShow`. */
  previewPlatform?: Exclude<InstallPlatform, null>;
  /** 'fixed' (default): tarjeta flotante sobre el borde inferior. 'inline': en el flujo. */
  placement?: 'fixed' | 'inline';
  className?: string;
}

/**
 * Prompt propio "Agrega IVANCAR a tu pantalla".
 * - Android/Chrome: botón Instalar → diálogo nativo (`beforeinstallprompt` capturado en lib/install).
 * - iOS Safari: instrucciones Compartir → "Agregar a inicio", con una flecha que señala la barra.
 * - "Ahora no" recuerda el descarte 14 días.
 *
 * @example
 * const install = useInstall();
 * <InstallPrompt open={install.canShow && tripsDone > 0} onClose={() => setAsked(true)} />
 */
export function InstallPrompt({ open, onClose, previewPlatform, placement = 'fixed', className }: InstallPromptProps) {
  const reduce = useReducedMotion();
  const install = useInstall();
  const titleId = useId();
  const platform = previewPlatform ?? install.platform;
  const visible = open && !!platform && (previewPlatform ? true : install.canShow);

  const later = () => {
    if (!previewPlatform) install.dismiss();
    onClose('dismissed');
  };
  const installNow = async () => {
    const r = previewPlatform ? 'unavailable' : await install.promptInstall();
    onClose(r);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          key="install"
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          className={cn(
            placement === 'fixed' && 'fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-[1040] mx-auto max-w-md',
            className,
          )}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 60, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40, transition: { duration: 0.18 } }}
          transition={reduce ? { duration: 0.2 } : springs.gentle}
          data-testid="install-prompt"
          data-platform={platform}
        >
          <div className="relative rounded-[28px] border border-line-strong bg-surface-raised/95 p-4 shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)] backdrop-blur-md">
            <button
              type="button"
              onClick={later}
              aria-label="Cerrar"
              className="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-fg-55 hover:bg-white/5 hover:text-fg"
            >
              <IconClose size={18} />
            </button>
            <div className="flex items-center gap-3.5 pr-8">
              <motion.img
                src={asset('icons/icon-192.png')}
                alt=""
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-[16px] shadow-[0_8px_24px_-6px_rgb(246_201_14/0.45)]"
                initial={reduce ? false : { scale: 0.6, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.12 }}
              />
              <div className="min-w-0">
                <h2 id={titleId} className="title-display text-[19px] leading-[1.05]">
                  Agrega IVANCAR a tu pantalla
                </h2>
                <p className="mt-1 text-[13px] leading-snug text-fg-65">Pide tu taxi en un toque, como una app. Sin descargas.</p>
              </div>
            </div>

            {platform === 'android' ? (
              <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
                <Button variant="ghost" onClick={later} data-testid="install-later">
                  Ahora no
                </Button>
                <Button fullWidth onClick={installNow} data-testid="install-accept">
                  Instalar
                </Button>
              </div>
            ) : (
              <>
                <ol className="mt-4 flex flex-col gap-2 text-[14px]">
                  <Step n={1}>
                    Toca <IosShareIcon /> <strong className="font-semibold">Compartir</strong> en la barra de Safari
                  </Step>
                  <Step n={2}>
                    Elige <IosAddIcon /> <strong className="font-semibold">Agregar a inicio</strong>
                  </Step>
                </ol>
                <Button fullWidth variant="secondary" className="mt-4" onClick={() => onClose('ios-acknowledged')} data-testid="install-ios-ok">
                  Entendido
                </Button>
                {/* Flecha hacia la barra inferior de Safari, donde está Compartir */}
                {!reduce && placement === 'fixed' && (
                  <motion.span
                    aria-hidden
                    className="absolute -bottom-[13px] left-1/2 -ml-2 block text-ivancar-yellow"
                    animate={{ y: [0, 6, 0] }}
                    transition={{ duration: 1.2, repeat: 3, ease: 'easeInOut', delay: 0.6 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 13L2 6h12z" />
                    </svg>
                  </motion.span>
                )}
              </>
            )}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-black/30 px-3 py-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ivancar-yellow text-[12px] font-black text-on-yellow">{n}</span>
      <span className="flex flex-wrap items-center gap-x-1.5 text-fg-80">{children}</span>
    </li>
  );
}

function IosShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="text-[#4DA3FF]">
      <path d="M12 3v12M8 7l4-4 4 4" />
      <path d="M6 11H5v10h14V11h-1" />
    </svg>
  );
}

function IosAddIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-fg">
      <rect x="4" y="4" width="16" height="16" rx="4" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
