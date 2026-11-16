import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { useMapView } from '@/components/map';
import { carSvg } from '@/components/map/carIcon';
import { onTick } from '@/components/map/ticker';
import { lerpAngle, lerpLatLng } from '@/lib/geo';
import { simTimings } from '@/lib/simConfig';
import { busyIndex, computeAlerts, unitPose, unitViews, useDispatch, type DispatchOrder } from '@/store/dispatchStore';
import type { LatLng } from '@/types';

/** Transición al cambiar de "fuente" de posición (patrulla → ruta de llegada, etc.). */
const GLIDE_MS = 700;
const TURN_TAU_MS = 160;
const STEP_EVERY_MS = 1000; // reduced motion: por pasos

const STATE_LABEL = { available: 'disponible', busy: 'ocupada', assigned: 'en pedido' } as const;

interface UnitSprite {
  id: string;
  marker: L.Marker;
  el: HTMLElement | null;
  body: HTMLElement | null;
  shown: LatLng | null;
  heading: number;
  srcKey: string;
  glideFrom: LatLng | null;
  glideT0: number;
  cls: string;
  title: string;
}

/**
 * Las 14 unidades de la central, movidas de forma imperativa desde el rAF compartido
 * (`ticker`): cero renders de React por frame. La posición sale del store con el reloj de
 * pared (`unitPose`): patrulla, llegada a la recogida, espera o viaje.
 *
 * Clases para estilos y para el Bloque 5: `iv-unit--available|busy|assigned`,
 * `is-selected` (unidad elegida o del pedido elegido) e `is-alert` (pedido con alerta).
 * Click o Enter sobre una unidad la selecciona.
 */
export function FleetUnitsLayer() {
  const map = useMap();
  const { reduceMotion } = useMapView();
  const reduceRef = useRef(reduceMotion);
  reduceRef.current = reduceMotion;

  useEffect(() => {
    const sprites = new Map<string, UnitSprite>();
    let index = new Map<string, DispatchOrder>();
    let alertUnits = new Set<string>();

    const refreshClasses = () => {
      const s = useDispatch.getState();
      const views = unitViews(s.orders);
      const selOrder = s.selectedOrderId ? s.orders.find((o) => o.id === s.selectedOrderId) : null;
      for (const v of views) {
        const sp = sprites.get(v.unit.id);
        if (!sp) continue;
        const selected = s.selectedUnitId === v.unit.id || (!!selOrder && selOrder.unit_id === v.unit.id && v.state === 'assigned');
        const cls = `iv-unit--${v.state}${selected ? ' is-selected' : ''}${alertUnits.has(v.unit.id) ? ' is-alert' : ''}`;
        if (cls !== sp.cls && sp.el) {
          // Solo las clases propias: las de Leaflet (zoom animado, interactivo) se conservan.
          if (sp.cls) sp.el.classList.remove(...sp.cls.split(' '));
          sp.el.classList.add(...cls.split(' '));
          sp.cls = cls;
          sp.marker.setZIndexOffset(selected ? 2000 : v.state === 'assigned' ? 1000 : v.state === 'available' ? 500 : 0);
        }
        const title = `Unidad ${v.unit.vehicle.plate} · ${v.unit.display_name} · ${STATE_LABEL[v.state]}`;
        if (title !== sp.title && sp.el) {
          sp.el.setAttribute('title', title);
          sp.el.setAttribute('aria-label', title);
          sp.title = title;
        }
      }
    };

    // Crear marcadores.
    for (const v of unitViews(useDispatch.getState().orders)) {
      const u = v.unit;
      const icon = L.divIcon({
        className: 'iv-unit',
        html: `<div class="iv-unit__body">${carSvg({ body: 'currentColor' })}</div><span class="iv-unit__tag">${u.vehicle.plate}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const marker = L.marker([u.lat, u.lng], { icon, keyboard: true, riseOnHover: true, title: u.vehicle.plate, alt: u.vehicle.plate }).addTo(map);
      marker.on('click', () => useDispatch.getState().selectUnit(u.id));
      // Teclado: Leaflet emite keydown sobre el marcador enfocado (no click).
      marker.on('keydown', (e: L.LeafletKeyboardEvent) => {
        const k = e.originalEvent.key;
        if (k === 'Enter' || k === ' ') {
          e.originalEvent.preventDefault();
          useDispatch.getState().selectUnit(u.id);
        }
      });
      const el = marker.getElement() ?? null;
      el?.setAttribute('role', 'button');
      el?.setAttribute('data-unit-id', u.id);
      sprites.set(u.id, {
        id: u.id,
        marker,
        el,
        body: (el?.querySelector('.iv-unit__body') as HTMLElement | null) ?? null,
        shown: null,
        heading: 0,
        srcKey: '',
        glideFrom: null,
        glideT0: 0,
        cls: '',
        title: '',
      });
    }

    const sync = () => {
      index = busyIndex(useDispatch.getState().orders);
      refreshClasses();
    };
    sync();
    const unsub = useDispatch.subscribe(sync);

    // Alertas (dependen del reloj): cada medio segundo.
    const alertTimer = setInterval(() => {
      const s = useDispatch.getState();
      const ids = new Set(computeAlerts(s.orders, Date.now(), simTimings()).map((a) => a.order_id));
      const next = new Set<string>();
      for (const o of s.orders) if (ids.has(o.id) && o.unit_id) next.add(o.unit_id);
      const changed = next.size !== alertUnits.size || [...next].some((x) => !alertUnits.has(x));
      alertUnits = next;
      if (changed) refreshClasses();
    }, 500);

    let sinceStep = STEP_EVERY_MS;
    const off = onTick((dt) => {
      const now = Date.now();
      const stepped = reduceRef.current;
      if (stepped) {
        sinceStep += dt;
        if (sinceStep < STEP_EVERY_MS) return;
        sinceStep = 0;
      }
      for (const sp of sprites.values()) {
        const order = index.get(sp.id) ?? null;
        const pose = unitPose(sp.id, order, now);
        const leg = pose.mode === 'approach' ? order?.approach : pose.mode === 'trip' ? order?.trip : null;
        const key = `${pose.mode}:${order?.id ?? ''}:${leg?.started_at ?? ''}:${leg?.path.length ?? ''}`;
        if (key !== sp.srcKey) {
          if (sp.shown && sp.srcKey && !stepped) {
            sp.glideFrom = sp.shown;
            sp.glideT0 = now;
          }
          sp.srcKey = key;
        }
        let pt = pose.point;
        if (sp.glideFrom) {
          const k = Math.min(1, (now - sp.glideT0) / GLIDE_MS);
          const e = 1 - Math.pow(1 - k, 3);
          pt = lerpLatLng(sp.glideFrom, pose.point, e);
          if (k >= 1) sp.glideFrom = null;
        }
        if (!sp.shown || sp.shown[0] !== pt[0] || sp.shown[1] !== pt[1]) {
          sp.marker.setLatLng(pt);
          sp.shown = pt;
        }
        const target = pose.bearing;
        const h = stepped ? target : lerpAngle(sp.heading, target, 1 - Math.exp(-dt / TURN_TAU_MS));
        if (Math.abs(h - sp.heading) > 0.05 || !sp.body?.style.transform) {
          sp.heading = h;
          if (sp.body) sp.body.style.transform = `rotate(${h.toFixed(1)}deg)`;
        }
      }
    });

    return () => {
      off();
      unsub();
      clearInterval(alertTimer);
      for (const sp of sprites.values()) sp.marker.remove();
      sprites.clear();
    };
  }, [map]);

  return null;
}
