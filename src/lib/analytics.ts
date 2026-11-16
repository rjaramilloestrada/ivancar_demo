/**
 * Analítica del demo (PLAN_IVANCAR.md §5, estándar IGNIS: Meta Pixel + GA4).
 *
 * - Solo carga los scripts si hay IDs válidos en `VITE_META_PIXEL_ID` / `VITE_GA4_ID`.
 *   Sin IDs (o con placeholders) no se inyecta nada ni se hace ninguna petición.
 * - `track(evento, datos)` es seguro de llamar siempre: sin proveedores solo guarda el
 *   evento en un registro local (útil para pruebas: `window.__ivancarEvents`).
 * - Sin datos personales: solo ids de servicio, montos referenciales y pasos del flujo.
 */

export type AnalyticsEvent =
  | 'app_open'
  | 'destination_selected'
  | 'service_selected'
  | 'ride_requested'
  | 'ride_assigned'
  | 'ride_reassigned'
  | 'driver_arrived'
  | 'trip_started'
  | 'trip_completed'
  | 'ride_cancelled'
  | 'rating_submitted'
  | 'share_trip'
  | 'share_location'
  | 'call_click'
  | 'whatsapp_fallback_click'
  | 'emergency_open'
  | 'history_open'
  | 'history_trip_open'
  | 'history_repeat'
  | 'chat_open'
  | 'chat_message';

export type AnalyticsData = Record<string, string | number | boolean | null | undefined>;

type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; callMethod?: (...a: unknown[]) => void; push?: unknown };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: Fbq;
    _fbq?: Fbq;
    __ivancarEvents?: Array<{ event: AnalyticsEvent; data?: AnalyticsData; at: number }>;
  }
}

const PIXEL_RE = /^\d{6,20}$/;
const GA4_RE = /^G-[A-Z0-9]{4,}$/;

function readIds() {
  const env = import.meta.env ?? {};
  const pixel = (env.VITE_META_PIXEL_ID ?? '').trim();
  const ga = (env.VITE_GA4_ID ?? '').trim();
  return { pixel: PIXEL_RE.test(pixel) ? pixel : null, ga: GA4_RE.test(ga) ? ga : null };
}

let started = false;
let pixelOn = false;
let gaOn = false;

function inject(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/** Carga los proveedores configurados (idempotente). */
export function initAnalytics(): { pixel: boolean; ga: boolean } {
  if (started || typeof window === 'undefined') return { pixel: pixelOn, ga: gaOn };
  started = true;
  const { pixel, ga } = readIds();

  if (ga) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag() {
      // GA4 espera el objeto `arguments`, no un array.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', ga, { anonymize_ip: true });
    inject(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`);
    gaOn = true;
  }

  if (pixel) {
    // Snippet estándar de Meta Pixel, sin <noscript>.
    if (!window.fbq) {
      const fbq: Fbq = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      } as Fbq;
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      fbq.queue = [];
      window.fbq = fbq;
      window._fbq = fbq;
      inject('https://connect.facebook.net/en_US/fbevents.js');
    }
    window.fbq('init', pixel);
    window.fbq('track', 'PageView');
    pixelOn = true;
  }
  return { pixel: pixelOn, ga: gaOn };
}

/** Eventos de Meta con nombre estándar; el resto va como evento personalizado. */
const PIXEL_STANDARD: Partial<Record<AnalyticsEvent, string>> = {
  ride_requested: 'Lead',
  trip_completed: 'Purchase',
  whatsapp_fallback_click: 'Contact',
  call_click: 'Contact',
};

/** Registra un hito del flujo. Nunca lanza. */
export function track(event: AnalyticsEvent, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;
  try {
    const log = (window.__ivancarEvents = window.__ivancarEvents ?? []);
    log.push({ event, data, at: Date.now() });
    if (log.length > 200) log.shift();

    if (gaOn && window.gtag) window.gtag('event', event, data ?? {});
    if (pixelOn && window.fbq) {
      const std = PIXEL_STANDARD[event];
      if (std === 'Purchase') window.fbq('track', std, { value: data?.value ?? 0, currency: 'USD' });
      else if (std) window.fbq('track', std, data ?? {});
      else window.fbq('trackCustom', event, data ?? {});
    }
  } catch {
    /* la analítica nunca rompe el flujo */
  }
}
