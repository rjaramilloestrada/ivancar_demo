/**
 * Contacto real publicado en ivancar-ec.com (PLAN_IVANCAR.md §1 y §7.3).
 * Todo lo demás en el demo es simulado.
 */
export const IVANCAR_PHONE = '0980100100';
export const IVANCAR_WHATSAPP = '593980100100';

export const telHref = `tel:${IVANCAR_PHONE}`;

export function whatsappHref(text?: string): string {
  const base = `https://wa.me/${IVANCAR_WHATSAPP}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Ruta a un archivo de `public/`, respetando el `base` de Vite (GitHub Pages). */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
}

/** wa.me sin número: WhatsApp deja elegir el contacto (compartir viaje o ubicación). */
export function shareWhatsappHref(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
