import { useEffect, useRef, useState } from 'react';
import type { FleetUnit, IsoDateTime, LatLng, Ride, RideStatus } from '@/types';

/**
 * Canal pasajero ↔ central sobre BroadcastChannel (PLAN_EJECUCION.md, ajuste 2).
 *
 * - Conecta pestañas y ventanas del mismo navegador y origen.
 * - También entrega los mensajes dentro de la MISMA pestaña (BroadcastChannel no lo hace),
 *   para que `#/demo` (teléfono y central en una sola página) funcione igual.
 * - Si BroadcastChannel no existe, sigue funcionando solo dentro de la pestaña.
 * - Cada mensaje viaja en un sobre con id, rol y pestaña de origen: el consumidor filtra
 *   con `env.role` (p. ej. la central ignora lo que manda la central).
 * En la Fase 1 esto se reemplaza por Supabase Realtime con los mismos tipos de mensaje.
 */

export const CHANNEL_NAME = 'ivancar-demo';
export const PROTOCOL_VERSION = 1;

export type ChannelRole = 'passenger' | 'central';

/** Estados que la central (o la autoasignación) comunica al pasajero. */
export type RideProgressStatus = Extract<RideStatus, 'en_route' | 'arrived' | 'in_trip' | 'completed'>;

export type ChannelMessage =
  /** Pasajero → central: pedido nuevo. */
  | { type: 'ride:created'; ride: Ride }
  /** Central → pasajero: unidad asignada. `by: 'auto'` = autoasignación sin central. */
  | { type: 'ride:assigned'; ride_id: string; unit: FleetUnit; eta_s: number; by: 'central' | 'auto'; at: IsoDateTime }
  /**
   * Cambio de estado del viaje (lo manda el pasajero, que lleva el reloj).
   * En `en_route` e `in_trip` viajan, opcionales, la unidad, el reloj de la fase y la ruta
   * que dibuja el pasajero: la central mueve la unidad por la misma línea y al mismo ritmo.
   */
  | {
      type: 'ride:status';
      ride_id: string;
      status: RideProgressStatus;
      eta_s?: number;
      at: IsoDateTime;
      driver_id?: string;
      /** Inicio de la fase (ms de época) y su duración en el demo (ms). */
      phase_started_at?: number;
      phase_ms?: number;
      /** Ruta de la fase (simplificada). */
      path?: LatLng[];
    }
  /**
   * Central → pasajero: "recibí tu pedido". En modo manual el pasajero espera al operador
   * más tiempo (`searchManualTimeoutMs`) antes de autoasignarse.
   */
  | { type: 'ride:ack'; ride_id: string; mode: 'auto' | 'manual'; at: IsoDateTime }
  /** Cancelación por cualquiera de las partes. */
  | { type: 'ride:cancelled'; ride_id: string; by: ChannelRole; reason?: string; at: IsoDateTime }
  /** Central → pasajero: cambio de unidad. */
  | {
      type: 'ride:reassigned';
      ride_id: string;
      unit: FleetUnit;
      previous_driver_id: string;
      eta_s: number;
      reason?: string;
      at: IsoDateTime;
    }
  /** Presencia: "¿hay alguien?". */
  | { type: 'presence:ping'; at: IsoDateTime }
  /** Presencia: "aquí estoy". `to` = tab que preguntó. */
  | { type: 'presence:pong'; to: string; at: IsoDateTime };

export type ChannelMessageType = ChannelMessage['type'];

export interface Envelope<M extends ChannelMessage = ChannelMessage> {
  v: typeof PROTOCOL_VERSION;
  id: string;
  /** Pestaña de origen (estable mientras viva la pestaña). */
  tab: string;
  role: ChannelRole;
  sent_at: IsoDateTime;
  msg: M;
}

type Listener = (env: Envelope) => void;

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Id de esta pestaña. */
export const TAB_ID = uid();

export const isChannelSupported = typeof BroadcastChannel !== 'undefined';

const listeners = new Set<Listener>();
let bc: BroadcastChannel | null = null;

function ensure() {
  if (bc || !isChannelSupported) return;
  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (e: MessageEvent) => {
      const env = e.data as Envelope;
      if (env && env.v === PROTOCOL_VERSION && env.msg && typeof env.msg.type === 'string') dispatch(env);
    };
  } catch {
    bc = null; // p. ej. contextos restringidos: queda solo la entrega local
  }
}

function dispatch(env: Envelope) {
  for (const l of [...listeners]) {
    try {
      l(env);
    } catch (err) {
      console.warn('[channel] listener falló', err);
    }
  }
}

/** Publica un mensaje a las demás pestañas y, en diferido, a esta misma. */
export function postMessage<M extends ChannelMessage>(role: ChannelRole, msg: M): Envelope<M> {
  ensure();
  const env: Envelope<M> = { v: PROTOCOL_VERSION, id: uid(), tab: TAB_ID, role, sent_at: new Date().toISOString(), msg };
  try {
    bc?.postMessage(env);
  } catch {
    /* mensaje no clonable o canal cerrado: se ignora */
  }
  queueMicrotask(() => dispatch(env));
  return env;
}

/** Se suscribe a todos los mensajes. Devuelve la función para desuscribirse. */
export function subscribe(listener: Listener): () => void {
  ensure();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Cierra el canal (tests). */
export function closeChannel() {
  bc?.close();
  bc = null;
  listeners.clear();
}

/* ------------------------------------------------------------------ Hooks */

/**
 * Escucha mensajes del canal. El handler puede cambiar entre renders sin re-suscribir.
 * `from`: solo mensajes de ese rol (p. ej. el pasajero escucha a 'central').
 */
export function useChannel(handler: (env: Envelope) => void, { from }: { from?: ChannelRole } = {}) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(
    () =>
      subscribe((env) => {
        if (!from || env.role === from) ref.current(env);
      }),
    [from],
  );
}

/**
 * Para la central: responde a los ping de presencia mientras el componente esté montado,
 * y se anuncia al montar.
 */
export function usePresenceResponder(role: ChannelRole = 'central') {
  useEffect(() => {
    const off = subscribe((env) => {
      if (env.msg.type === 'presence:ping' && env.role !== role) {
        postMessage(role, { type: 'presence:pong', to: env.tab, at: new Date().toISOString() });
      }
    });
    // Anuncio inicial: quien esté escuchando sabe de inmediato que hay central.
    postMessage(role, { type: 'presence:pong', to: '*', at: new Date().toISOString() });
    return off;
  }, [role]);
}

/**
 * Para el pasajero: ¿hay una central abierta? Envía ping cada `intervalMs` y considera
 * que hay central si recibió un pong en los últimos `timeoutMs`.
 */
export function usePeerOnline(
  { role = 'passenger', peer = 'central', intervalMs = 3000, timeoutMs = 7000 }:
    { role?: ChannelRole; peer?: ChannelRole; intervalMs?: number; timeoutMs?: number } = {},
): boolean {
  const [online, setOnline] = useState(false);
  const lastPong = useRef(0);
  useEffect(() => {
    const off = subscribe((env) => {
      if (env.msg.type === 'presence:pong' && env.role === peer && (env.msg.to === TAB_ID || env.msg.to === '*')) {
        lastPong.current = Date.now();
        setOnline(true);
      }
    });
    const ping = () => {
      postMessage(role, { type: 'presence:ping', at: new Date().toISOString() });
      if (Date.now() - lastPong.current > timeoutMs) setOnline(false);
    };
    ping();
    const t = setInterval(ping, intervalMs);
    return () => {
      off();
      clearInterval(t);
    };
  }, [role, peer, intervalMs, timeoutMs]);
  return online;
}
