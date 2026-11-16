import { motion, useReducedMotion } from 'motion/react';
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Un solo BottomSheet para todo el flujo: cada paso "pinta" su cabecera, cuerpo y acción
 * en los huecos del sheet con portales. Así el sheet (y el mapa) no se desmontan al
 * cambiar de paso: solo cambia el contenido, y el sheet anima su altura con su resorte.
 */
export interface SheetSlotElements {
  header: HTMLElement | null;
  body: HTMLElement | null;
  footer: HTMLElement | null;
}

export const SheetSlotsContext = createContext<SheetSlotElements>({ header: null, body: null, footer: null });

export interface SheetContentProps {
  /** Clave del paso: el contenido nuevo entra con un fundido corto. */
  stepKey: string;
  header: ReactNode;
  footer: ReactNode;
  children?: ReactNode;
}

export function SheetContent({ stepKey, header, footer, children }: SheetContentProps) {
  const slots = useContext(SheetSlotsContext);
  const reduce = useReducedMotion();
  // Bloque 5: aquí se puede añadir stagger por paso (variants) sin tocar las pantallas.
  const wrap = (node: ReactNode, delay = 0) => (
    <motion.div
      key={stepKey}
      data-step={stepKey}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {node}
    </motion.div>
  );
  return (
    <>
      {slots.header && createPortal(wrap(header), slots.header)}
      {slots.body && createPortal(wrap(children, 0.04), slots.body)}
      {slots.footer && createPortal(wrap(footer), slots.footer)}
    </>
  );
}
