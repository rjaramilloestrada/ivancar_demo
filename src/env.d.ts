/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ID de Meta Pixel (solo dígitos). Vacío = no se carga. */
  readonly VITE_META_PIXEL_ID?: string;
  /** ID de medición de GA4 ("G-XXXXXXX"). Vacío = no se carga. */
  readonly VITE_GA4_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
