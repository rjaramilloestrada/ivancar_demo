import type { SVGProps } from 'react';
import type { ServiceId } from '@/types';

/**
 * Ilustraciones propias (vista lateral) para cada tipo de servicio. 64×40, sin texto.
 * Amarillo de marca para la carrocería, negro para vidrios y llantas.
 * `muted` las pasa a gris (tarjeta no seleccionada, si se quiere).
 */
export interface ServiceIconProps extends Omit<SVGProps<SVGSVGElement>, 'id'> {
  service: ServiceId;
  /** Ancho en px (alto proporcional 40/64). Default 64. */
  size?: number;
  muted?: boolean;
  /** Texto accesible. Si se omite, la ilustración es decorativa. */
  title?: string;
}

const Y = '#F6C90E';
const INK = '#0B0B0C';
const GLASS = '#1E2228';

function Wheels({ x1, x2, y = 31, r = 5 }: { x1: number; x2: number; y?: number; r?: number }) {
  return (
    <g>
      {[x1, x2].map((x) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill={INK} />
          <circle cx={x} cy={y} r={r * 0.42} fill="#8A8F98" />
        </g>
      ))}
    </g>
  );
}

const shapes: Record<ServiceId, (c: string) => React.ReactNode> = {
  taxi: (c) => (
    <>
      <rect x="25" y="5" width="12" height="4.5" rx="1.2" fill={INK} />
      <rect x="27.5" y="6.3" width="7" height="1.9" rx="0.6" fill={c} />
      <path d="M6 30v-6.5c0-1.6 1.1-3 2.7-3.3l8.4-1.8 6-7.1c.8-.9 1.9-1.4 3.1-1.4h11.6c1.3 0 2.5.6 3.3 1.6l5.4 6.9 7.6 1.7c1.6.4 2.8 1.8 2.8 3.4V30z" fill={c} />
      <path d="M19.5 18.8l5.1-6c.4-.4.9-.7 1.5-.7h5.2v6.7zm14.3 0v-6.7h3.4c.6 0 1.2.3 1.6.8l4.5 5.9z" fill={GLASS} />
      <rect x="54" y="23" width="3.5" height="2" rx="1" fill="#FFF8D6" />
      <Wheels x1={17} x2={47} />
    </>
  ),
  ejecutivo: (c) => (
    <>
      <path d="M4 30v-5.8c0-1.5 1-2.8 2.5-3.1l11-2.4 6.4-6.3c.9-.9 2.1-1.4 3.4-1.4h12.2c1.4 0 2.7.6 3.6 1.6l5.6 6.1 8.3 1.9c1.5.4 2.6 1.7 2.6 3.3V30z" fill="#16181C" stroke={c} strokeWidth="1.2" />
      <path d="M21 18.6l4.6-4.6c.5-.5 1.1-.7 1.8-.7h5v5.3zm13.6 0v-5.3h4.2c.7 0 1.3.3 1.8.8l4 4.5z" fill={GLASS} />
      <path d="M6 24.2h53" stroke={c} strokeWidth="1.4" strokeLinecap="round" />
      <rect x="55.5" y="21.6" width="3.6" height="1.8" rx="0.9" fill="#FFF8D6" />
      <Wheels x1={16} x2={48} />
    </>
  ),
  suv: (c) => (
    <>
      <rect x="18" y="5.2" width="30" height="1.8" rx="0.9" fill={INK} />
      <path d="M5 30v-8.5c0-1.5 1-2.8 2.4-3.2l7.4-2.2 4.6-6.8c.7-1 1.8-1.6 3-1.6h21.8c1.3 0 2.5.7 3.2 1.8l4.2 6.6 6.2 2.1c1.4.5 2.3 1.8 2.3 3.2V30z" fill={c} />
      <path d="M17 17l4.2-6.1c.3-.5.9-.8 1.5-.8h6.6v6.9zm15.3 0v-6.9h7.4v6.9zm10.4 0v-6.9h1.7c.6 0 1.2.3 1.5.9l3.6 6z" fill={GLASS} />
      <rect x="55.5" y="21" width="3.5" height="2" rx="1" fill="#FFF8D6" />
      <Wheels x1={17} x2={48} r={5.6} />
    </>
  ),
  camioneta: (c) => (
    <>
      <path d="M4 30v-11.5h25V30z" fill={c} />
      <path d="M4 18.5h25" stroke={INK} strokeWidth="1.2" />
      <path d="M29 30V10.5c0-1 .8-1.8 1.8-1.8h12.8c1.2 0 2.3.6 3 1.6l5 7.4 6.5 1.9c1.4.4 2.4 1.7 2.4 3.2V30z" fill={c} />
      <path d="M32 17.5v-6.3h6.2v6.3zm9.3 0v-6.3h2.3c.6 0 1.2.3 1.5.8l3.6 5.5z" fill={GLASS} />
      <rect x="56.4" y="22" width="3.4" height="2" rx="1" fill="#FFF8D6" />
      <Wheels x1={15} x2={48} r={5.6} />
    </>
  ),
  encomiendas: (c) => (
    <>
      <path d="M8 34h10M4 28h10M8 22h8" stroke="#8A8F98" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M22 13l17-7 19 7v20l-19 6-17-6z" fill={c} />
      <path d="M22 13l17 6 19-6M39 19v20" stroke={INK} strokeWidth="1.3" strokeLinejoin="round" fill="none" />
      <path d="M30 9.7l17.6 6.5v6.3" stroke={INK} strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </>
  ),
  por_horas: (c) => (
    <>
      <path d="M2 31v-5c0-1.2.8-2.2 2-2.5l6.5-1.5 4.6-5.2c.6-.7 1.5-1.1 2.4-1.1h8.4c1 0 1.9.4 2.5 1.2l3.9 5 5.5 1.3c1.2.3 2 1.3 2 2.5V31z" fill={c} />
      <path d="M12.6 21.8l3.6-4.2c.3-.3.7-.5 1.1-.5h3.8v4.7zm10.5 0v-4.7h2.5c.5 0 .9.2 1.2.6l3.2 4.1z" fill={GLASS} />
      <Wheels x1={11} x2={33} r={4.2} y={31.5} />
      <circle cx="50" cy="15" r="11" fill={INK} stroke={c} strokeWidth="2.2" />
      <path d="M50 8.5V15l4.5 3" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
};

export function ServiceIcon({ service, size = 64, muted = false, title, ...rest }: ServiceIconProps) {
  const color = muted ? '#6B6F76' : Y;
  return (
    <svg
      width={size}
      height={(size * 40) / 64}
      viewBox="0 0 64 40"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
      {...rest}
    >
      <ellipse cx="32" cy="37" rx="27" ry="2" fill="#000" opacity="0.45" />
      {shapes[service](color)}
    </svg>
  );
}
