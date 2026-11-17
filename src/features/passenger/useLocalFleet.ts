import { useEffect, useRef } from 'react';
import { postMessage } from '@/lib/channel';
import { getFleetPlan, setFleetPlan } from '@/lib/fleetSim';
import { haversine } from '@/lib/geo';
import { buildLocalFleet, REUSE_M } from '@/lib/localFleet';
import { PRE_ORDER, useRide } from '@/store/rideStore';
import type { LatLng } from '@/types';

/** Espera tras soltar el mapa antes de armar la flota cercana (evita pedir en cada arrastre). */
const SETTLE_MS = 400;

/**
 * Flota alrededor de la recogida: cuando el pin queda quieto en el inicio, arma (si hace
 * falta) el plan de las unidades de zona alrededor de ese punto, lo aplica y lo publica a
 * la central. Cuando aparece una central, le reenvía el plan vigente.
 */
export function useLocalFleet({ pin, active, centralOnline }: { pin: LatLng | null; active: boolean; centralOnline: boolean }) {
  const lat = pin?.[0];
  const lng = pin?.[1];
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const activeRef = useRef(active);
  activeRef.current = active;
  // Depende solo del punto: si la persona avanza enseguida (elige destino), igual se arma.
  useEffect(() => {
    if (!activeRef.current || lat == null || lng == null) return;
    const t = setTimeout(() => {
      void buildLocalFleet([lat, lng]).then((plan) => {
        // Se aplica aunque la persona ya haya avanzado (pidió rápido), mientras no haya
        // pedido en curso y la recogida siga siendo la misma zona.
        const here = pinRef.current;
        if (!plan || !PRE_ORDER.includes(useRide.getState().step) || !here || haversine(here, plan.center) > REUSE_M) return;
        if (setFleetPlan(plan)) postMessage('passenger', { type: 'fleet:plan', plan });
      });
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [lat, lng]);

  // Central recién conectada (o recargada): que dibuje lo mismo que el pasajero.
  const wasOnline = useRef(false);
  useEffect(() => {
    if (centralOnline && !wasOnline.current) {
      const plan = getFleetPlan();
      if (plan) postMessage('passenger', { type: 'fleet:plan', plan });
    }
    wasOnline.current = centralOnline;
  }, [centralOnline]);
}
