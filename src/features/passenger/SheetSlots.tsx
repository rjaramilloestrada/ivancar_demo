import { motion, useReducedMotion } from 'motion/react';
import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { pageMotion } from '@/components/fx/PageTransition';

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
  // Transición de paso (fx/pageMotion): cabecera, cuerpo y pie entran escalonados. No hay
  // salida animada: el contenido viejo se reemplaza al instante y nunca frena el pedido.
  const wrap = (node: ReactNode, delay = 0) => {
    const { initial, animate } = pageMotion(!!reduce, { delay });
    return (
      <motion.div key={stepKey} data-step={stepKey} initial={initial} animate={animate}>
        {node}
      </motion.div>
    );
  };
  return (
    <>
      {slots.header && createPortal(wrap(header), slots.header)}
      {slots.body && createPortal(wrap(children, 0.04), slots.body)}
      {slots.footer && createPortal(wrap(footer, 0.08), slots.footer)}
    </>
  );
}
