import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Chat simulado con el conductor (por pedido). Se guarda en sessionStorage para que una
 * recarga a mitad del viaje no lo borre, y se limpia al terminar o cancelar el viaje.
 */
export interface ChatMessage {
  id: string;
  from: 'driver' | 'me';
  text: string;
  at: number;
}

export interface ChatState {
  rideId: string | null;
  messages: ChatMessage[];
  /** El conductor "escribe" (indicador). */
  typing: boolean;
  /** Mensajes del conductor no leídos (chat cerrado). */
  unread: number;
  /** Guion ya cumplido: saludo, "¿dónde estás?" y "estoy afuera". */
  greeted: boolean;
  askedWhere: boolean;
  arrivedSent: boolean;
}

interface ChatActions {
  /** Asegura que el chat es el de este pedido (si no, lo empieza vacío). */
  bind(rideId: string): void;
  add(from: ChatMessage['from'], text: string, opts?: { unread?: boolean }): ChatMessage;
  setTyping(on: boolean): void;
  markRead(): void;
  flag(k: 'greeted' | 'askedWhere' | 'arrivedSent'): void;
  clear(): void;
}

const empty: ChatState = { rideId: null, messages: [], typing: false, unread: 0, greeted: false, askedWhere: false, arrivedSent: false };

let seq = 0;

export const useChat = create<ChatState & ChatActions>()(
  persist(
    (set, get) => ({
      ...empty,
      bind(rideId) {
        if (get().rideId !== rideId) set({ ...empty, rideId });
      },
      add(from, text, opts) {
        const msg: ChatMessage = { id: `${Date.now().toString(36)}-${++seq}`, from, text: text.slice(0, 280), at: Date.now() };
        set((s) => ({ messages: [...s.messages, msg], unread: s.unread + (opts?.unread ? 1 : 0) }));
        return msg;
      },
      setTyping(on) {
        if (get().typing !== on) set({ typing: on });
      },
      markRead() {
        if (get().unread) set({ unread: 0 });
      },
      flag(k) {
        set({ [k]: true } as Partial<ChatState>);
      },
      clear() {
        set({ ...empty });
      },
    }),
    {
      name: 'ivancar-chat',
      storage: createJSONStorage(() => {
        try {
          return sessionStorage;
        } catch {
          return undefined as unknown as Storage;
        }
      }),
      partialize: ({ typing: _t, ...rest }) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(rest)) if (typeof v !== 'function') out[k] = v;
        return out as Partial<ChatState>;
      },
    },
  ),
);

/* ------------------------------------------------------------ Respuestas */

export interface ReplyContext {
  /** Nombre corto del conductor ("Carlos"). */
  driver: string;
  pickup: string;
  /** "4 min" o null si ya está llegando. */
  eta: string | null;
  arrived: boolean;
  inTrip: boolean;
  /** "Kia Rio amarillo, placa GSD-1736". */
  car: string;
  askedWhere: boolean;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Respuesta creíble del conductor según lo que escribe el pasajero y el momento del viaje.
 * Devuelve el texto y si con ella el conductor preguntó dónde está el pasajero.
 */
export function driverReply(text: string, c: ReplyContext): { text: string; asksWhere?: boolean } {
  const t = norm(text);
  if (/cuanto (falta|demora|tarda)|ya llega|llegas|demora|falta mucho|por donde vas|donde estas/.test(t)) {
    if (c.inTrip) return { text: c.eta ? `Llegamos en unos ${c.eta}.` : 'Ya casi llegamos.' };
    if (c.arrived) return { text: `Ya estoy afuera, en un ${c.car}.` };
    return { text: c.eta ? `Estoy a unos ${c.eta}. Te escribo apenas llegue.` : 'Ya estoy por llegar, a una cuadra.' };
  }
  if (/ya bajo|bajo|salgo|voy saliendo|ya voy/.test(t)) {
    return { text: c.arrived ? 'Perfecto, aquí te espero.' : 'Perfecto. Te aviso cuando esté afuera.' };
  }
  if (/puerta|entrada|garita|porton|estoy en|estoy afuera|aqui|frente/.test(t)) {
    return { text: c.arrived ? 'Listo, ya te ubico. Estoy con las luces prendidas.' : 'Listo, voy directo a la puerta.' };
  }
  if (/gracias|ok|listo|dale|bien/.test(t)) return { text: 'Con gusto.' };
  if (!c.askedWhere && !c.arrived && !c.inTrip) return { text: `Entendido. ¿Me esperas en la entrada principal de ${c.pickup}?`, asksWhere: true };
  return { text: 'Entendido.' };
}

/** Primer mensaje del conductor al abrir el chat. */
export function driverGreeting(c: ReplyContext): string {
  if (c.inTrip) return `Hola, soy ${c.driver}. Cualquier cosa me dices.`;
  if (c.arrived) return `Hola, soy ${c.driver}. Ya estoy afuera, en un ${c.car}.`;
  return `Hola, soy ${c.driver}. Ya voy en camino${c.eta ? `, llego en unos ${c.eta}` : ''}.`;
}

export const QUICK_REPLIES = ['Ya bajo', 'Estoy en la puerta', '¿Cuánto falta?'] as const;
