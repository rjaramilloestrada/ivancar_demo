import { afterEach, describe, expect, it, vi } from 'vitest';
import { canVibrate, hapticPatterns, vibrate } from '@/lib/haptics';
import { DISMISS_DAYS, getInstallState, isIosSafari, rememberDismiss, resetInstallDismiss } from '@/lib/install';
import { numberFormats } from '../AnimatedNumber';

const mm = (reduce: boolean) => (q: string) => ({ matches: q.includes('reduce') ? reduce : false });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('haptics', () => {
  it('no falla ni vibra sin Vibration API', () => {
    vi.stubGlobal('navigator', {});
    expect(canVibrate()).toBe(false);
    expect(vibrate('arrival')).toBe(false);
  });

  it('usa el patrón nombrado', () => {
    const fn = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: fn });
    vi.stubGlobal('matchMedia', mm(false));
    expect(vibrate('arrival')).toBe(true);
    expect(fn).toHaveBeenCalledWith([...hapticPatterns.arrival]);
    expect(vibrate(25)).toBe(true);
    expect(fn).toHaveBeenLastCalledWith(25);
  });

  it('no vibra con reduced motion', () => {
    const fn = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate: fn });
    vi.stubGlobal('matchMedia', mm(true));
    expect(vibrate('tap')).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });

  it('traga excepciones del navegador', () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked');
      },
    });
    vi.stubGlobal('matchMedia', mm(false));
    expect(vibrate('confirm')).toBe(false);
  });
});

describe('install', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
  const iphoneChrome = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1';
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

  it('detecta iOS Safari y excluye otros navegadores de iOS y Android', () => {
    expect(isIosSafari(iphone)).toBe(true);
    expect(isIosSafari(iphoneChrome)).toBe(false);
    expect(isIosSafari(android)).toBe(false);
  });

  it('recuerda el descarte y tolera localStorage bloqueado', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal('navigator', { userAgent: iphone });
    resetInstallDismiss();
    expect(getInstallState()).toMatchObject({ platform: 'ios', dismissed: false, canShow: true });
    rememberDismiss();
    expect(getInstallState()).toMatchObject({ dismissed: true, canShow: false });
    // Descarte vencido
    store.set('ivancar.install.dismissedAt', String(Date.now() - (DISMISS_DAYS + 1) * 864e5));
    resetInstallDismiss();
    expect(getInstallState().dismissed).toBe(false);

    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => rememberDismiss()).not.toThrow();
    expect(getInstallState().dismissed).toBe(false);
  });
});

describe('numberFormats', () => {
  it('formatea USD con coma decimal y minutos', () => {
    expect(numberFormats.usd(4.75)).toBe('$4,75');
    expect(numberFormats.minutes(3.6)).toBe('4 min');
    expect(numberFormats.minutes(-2)).toBe('0 min');
  });
});
