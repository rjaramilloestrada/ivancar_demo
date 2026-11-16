import { create } from 'zustand';

/** Estado de interfaz de la central que no se persiste. */
interface CentralUi {
  /** Selector de unidad abierto (asignar o reasignar) para un pedido. */
  picker: { orderId: string; kind: 'assign' | 'reassign' } | null;
  /** Móvil: pestaña visible. */
  tab: 'orders' | 'map';
  openPicker(orderId: string, kind: 'assign' | 'reassign'): void;
  closePicker(): void;
  setTab(tab: 'orders' | 'map'): void;
}

export const useCentralUi = create<CentralUi>()((set) => ({
  picker: null,
  tab: 'orders',
  openPicker: (orderId, kind) => set({ picker: { orderId, kind } }),
  closePicker: () => set({ picker: null }),
  setTab: (tab) => set({ tab }),
}));
