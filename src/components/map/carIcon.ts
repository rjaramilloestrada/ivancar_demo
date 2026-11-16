/**
 * Auto amarillo visto desde arriba, apuntando al norte (0°), como string SVG para divIcon.
 * Sin filtros CSS (se rota cada frame): la sombra es una forma semitransparente.
 */
export function carSvg({ body = '#F6C90E', glow = false }: { body?: string; glow?: boolean } = {}): string {
  return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
${glow ? '<circle cx="16" cy="16" r="15" fill="rgba(246,201,14,0.16)"/>' : ''}
<rect x="8.2" y="3.6" width="15.6" height="26" rx="5.2" fill="rgba(0,0,0,0.45)"/>
<rect x="9" y="3" width="14" height="25.5" rx="4.6" fill="${body}" stroke="#0b0b0b" stroke-width="1.1"/>
<path d="M10.6 10.2c1.6-1.3 3.4-1.9 5.4-1.9s3.8.6 5.4 1.9l-.9 3.3c-1.4-.6-2.9-.9-4.5-.9s-3.1.3-4.5.9z" fill="#141518"/>
<path d="M11.3 23.4c1.4.6 3 .9 4.7.9s3.3-.3 4.7-.9l.6 2.3c-1.6.8-3.4 1.1-5.3 1.1s-3.7-.3-5.3-1.1z" fill="#141518"/>
<rect x="11.4" y="14.4" width="9.2" height="7.6" rx="1.6" fill="rgba(0,0,0,0.14)"/>
<rect x="13.2" y="16.6" width="5.6" height="2.4" rx="0.6" fill="#0b0b0b"/>
<rect x="10.4" y="3.7" width="3" height="1.5" rx="0.7" fill="#FFF8D6"/>
<rect x="18.6" y="3.7" width="3" height="1.5" rx="0.7" fill="#FFF8D6"/>
<rect x="10.6" y="27" width="2.6" height="1" rx="0.5" fill="#E2412F"/>
<rect x="18.8" y="27" width="2.6" height="1" rx="0.5" fill="#E2412F"/>
</svg>`;
}
