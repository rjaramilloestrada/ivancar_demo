import { useCallback, useSyncExternalStore } from 'react';

/**
 * Instalación PWA con prompt propio.
 *
 * - Android/Chrome/Edge: captura `beforeinstallprompt` (se evita el mini-infobar) y lo
 *   reproduce con `promptInstall()` cuando la app decide.
 * - iOS Safari: no hay evento; `platform === 'ios'` indica que hay que mostrar
 *   instrucciones (Compartir → Agregar a inicio).
 * - Ya instalada (`display-mode: standalone` o `navigator.standalone`): nunca se ofrece.
 * - El descarte se recuerda en localStorage (con try/catch) durante `DISMISS_DAYS`.
 *
 * La captura empieza al importar este módulo: importarlo desde el chunk principal
 * (lo hace `InstallPrompt`) para no perder el evento, que llega temprano.
 */

export type InstallPlatform = 'android' | 'ios' | null;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export interface InstallState {
  /** Ya corre instalada (standalone) o se instaló en esta sesión. */
  installed: boolean;
  /** El usuario dijo "Ahora no" hace menos de DISMISS_DAYS. */
  dismissed: boolean;
  /** Cómo se puede instalar aquí: android (prompt nativo), ios (instrucciones) o null. */
  platform: InstallPlatform;
  /** Hay algo que ofrecer: no instalada, no descartada y plataforma compatible. */
  canShow: boolean;
}

const DISMISS_KEY = 'ivancar.install.dismissedAt';
export const DISMISS_DAYS = 14;

let deferred: BeforeInstallPromptEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
let snapshot: InstallState = compute();

function notify() {
  snapshot = compute();
  listeners.forEach((l) => l());
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  } catch {
    /* sin matchMedia */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** iPhone/iPad en Safari (no Chrome/Firefox para iOS, que no pueden agregar a inicio igual). */
export function isIosSafari(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);
  return ios && /Safari/.test(ua) && !otherBrowser;
}

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 864e5;
  } catch {
    return false;
  }
}

function compute(): InstallState {
  const installed = installedNow || isStandalone();
  const dismissed = readDismissed();
  const platform: InstallPlatform = deferred ? 'android' : isIosSafari() ? 'ios' : null;
  return { installed, dismissed, platform, canShow: !installed && !dismissed && platform !== null };
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

export function getInstallState(): InstallState {
  return snapshot;
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Abre el diálogo nativo (solo Android/Chrome). El evento es de un solo uso.
 * Devuelve 'accepted' | 'dismissed' | 'unavailable'.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const ev = deferred;
  if (!ev) return 'unavailable';
  deferred = null;
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === 'accepted') installedNow = true;
    else rememberDismiss();
    notify();
    return outcome;
  } catch {
    notify();
    return 'unavailable';
  }
}

/** "Ahora no": no se vuelve a ofrecer en DISMISS_DAYS. */
export function rememberDismiss(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* almacenamiento bloqueado: se descarta solo en esta sesión */
  }
  notify();
}

/** Solo para pruebas / fx-lab. */
export function resetInstallDismiss(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* nada */
  }
  notify();
}

/**
 * Estado de instalación reactivo. `canShow` dice si hay algo que ofrecer; quien integra
 * decide el momento (p. ej. después de terminar el primer viaje).
 */
export function useInstall(): InstallState & {
  promptInstall: typeof promptInstall;
  dismiss: () => void;
} {
  const state = useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
  const dismiss = useCallback(() => rememberDismiss(), []);
  return { ...state, promptInstall, dismiss };
}
