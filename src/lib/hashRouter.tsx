import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from 'react';

/**
 * Enrutado mínimo por hash (GitHub Pages no reescribe rutas SPA): `#/central?sim=2`.
 * Reemplaza a react-router, que pesaba en la ruta inicial para cinco rutas planas.
 */
function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const getHash = () => window.location.hash;

/** Ruta y parámetros del hash: `#/central?sim=2` → { path: '/central', params }. */
export function parseHash(hash: string): { path: string; params: URLSearchParams } {
  const raw = hash.replace(/^#/, '') || '/';
  const q = raw.indexOf('?');
  const path = (q >= 0 ? raw.slice(0, q) : raw) || '/';
  return { path: path.startsWith('/') ? path : `/${path}`, params: new URLSearchParams(q >= 0 ? raw.slice(q + 1) : '') };
}

/** Ruta actual (se actualiza con `hashchange`). */
export function useHashPath(): string {
  return parseHash(useSyncExternalStore(subscribe, getHash, () => '')).path;
}

/** Parámetros de la ruta actual (lo que va después de `?` en el hash). */
export function useHashParams(): URLSearchParams {
  return parseHash(useSyncExternalStore(subscribe, getHash, () => '')).params;
}

/** Navega a otra ruta del hash. `replace` no deja entrada en el historial. */
export function navigate(to: string, { replace = false } = {}) {
  const hash = `#${to.startsWith('/') ? to : `/${to}`}`;
  if (replace) {
    window.history.replaceState(window.history.state, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else window.location.hash = hash;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  /** Ruta dentro de la app, p. ej. '/central'. */
  to: string;
}

/** Enlace interno: un `<a href="#/ruta">` real (abre en pestaña nueva, se copia, etc.). */
export function Link({ to, onClick, ...rest }: LinkProps) {
  const href = `#${to.startsWith('/') ? to : `/${to}`}`;
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
