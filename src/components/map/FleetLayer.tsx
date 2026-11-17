import L from 'leaflet';
import { memo, useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { onFleetPlan, passengerUnitIds, patrolPosition } from '@/lib/fleetSim';
import { haversine, lerpAngle, lerpLatLng } from '@/lib/geo';
import { fleetById } from '@/mocks/drivers';
import type { LatLng } from '@/types';
import { carSvg } from './carIcon';
import { useMapView } from './MapView';
import { onTick } from './ticker';

export interface FleetLayerProps {
  /** Ids de unidad a mostrar. Default: las que ve el pasajero (`passengerUnitIds`). */
  ids?: string[];
  /** Ids a ocultar (p. ej. la unidad asignada, que se dibuja aparte). */
  hide?: string[];
}

const SIZE = 28;
const TURN_TAU_MS = 160;
/** Al cambiar de plan (otra recogida), las unidades se deslizan en vez de saltar. */
const GLIDE_MS = 600;
const STEP_EVERY_MS = 1000; // reduced motion: por pasos

interface Sprite {
  marker: L.Marker;
  body: HTMLElement | null;
  shown: LatLng | null;
  heading: number;
  glideFrom: LatLng | null;
  glideT0: number;
}

/**
 * Flota viva alrededor del pasajero, con el reloj único de `lib/fleetSim.ts`: cada unidad
 * está donde la dibuja la central en ese mismo instante. Solo unidades disponibles (las
 * ocupadas no se muestran). Marcadores imperativos movidos desde el rAF compartido: cero
 * renders de React por frame. Debe ir como hijo de <MapView>.
 */
export const FleetLayer = memo(function FleetLayer({ ids, hide }: FleetLayerProps) {
  const map = useMap();
  const { reduceMotion } = useMapView();
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;
  const hideKey = (hide ?? []).join(',');
  const idsKey = ids?.join(',') ?? '';

  useEffect(() => {
    const sprites = new Map<string, Sprite>();
    const hidden = new Set(hideKey ? hideKey.split(',') : []);

    const sync = () => {
      const want = new Set(
        (idsKey ? idsKey.split(',') : passengerUnitIds()).filter((id) => fleetById[id]?.status === 'available' && !hidden.has(id)),
      );
      for (const [id, sp] of sprites) {
        if (!want.has(id)) {
          sp.marker.remove();
          sprites.delete(id);
        } else if (sp.shown && haversine(sp.shown, patrolPosition(id, Date.now()).point) < 300) {
          // Plan nuevo: deslizar desde donde estaba (si queda lejos, aparece en su lugar).
          sp.glideFrom = sp.shown;
          sp.glideT0 = performance.now();
        }
      }
      const now = Date.now();
      for (const id of want) {
        if (sprites.has(id)) continue;
        const u = fleetById[id];
        const pose = patrolPosition(id, now, [u.lat, u.lng]);
        const title = `${u.vehicle.plate} · ${u.display_name}`;
        const icon = L.divIcon({
          className: 'iv-car iv-car--fleet',
          html: `<div class="iv-car__body" style="transform:rotate(${pose.bearing.toFixed(1)}deg)">${carSvg({ glow: false })}</div>`,
          iconSize: [SIZE, SIZE],
          iconAnchor: [SIZE / 2, SIZE / 2],
        });
        const marker = L.marker(pose.point, { icon, interactive: false, keyboard: false, title, alt: title }).addTo(map);
        marker.getElement()?.setAttribute('data-unit-id', id);
        sprites.set(id, {
          marker,
          body: (marker.getElement()?.firstElementChild as HTMLElement | null) ?? null,
          shown: pose.point,
          heading: pose.bearing,
          glideFrom: null,
          glideT0: 0,
        });
      }
    };
    sync();
    const offPlan = onFleetPlan(sync);

    let sinceStep = STEP_EVERY_MS;
    const offTick = onTick((dt) => {
      const stepped = reduceRef.current;
      if (stepped) {
        sinceStep += dt;
        if (sinceStep < STEP_EVERY_MS) return;
        sinceStep = 0;
      }
      const now = Date.now();
      const perf = performance.now();
      for (const [id, sp] of sprites) {
        const pose = patrolPosition(id, now);
        let pt = pose.point;
        if (sp.glideFrom) {
          const k = Math.min(1, (perf - sp.glideT0) / GLIDE_MS);
          pt = lerpLatLng(sp.glideFrom, pt, 1 - Math.pow(1 - k, 3));
          if (k >= 1 || stepped) sp.glideFrom = null;
        }
        if (!sp.shown || sp.shown[0] !== pt[0] || sp.shown[1] !== pt[1]) {
          sp.marker.setLatLng(pt);
          sp.shown = pt;
        }
        const h = stepped ? pose.bearing : lerpAngle(sp.heading, pose.bearing, 1 - Math.exp(-dt / TURN_TAU_MS));
        if (Math.abs(h - sp.heading) > 0.05) {
          sp.heading = h;
          if (sp.body) sp.body.style.transform = `rotate(${h.toFixed(1)}deg)`;
        }
      }
    });

    return () => {
      offPlan();
      offTick();
      for (const sp of sprites.values()) sp.marker.remove();
      sprites.clear();
    };
  }, [map, hideKey, idsKey]);

  return null;
});
