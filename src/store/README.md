# store

`rideStore.ts`: máquina de estados del pedido del pasajero (Zustand + `persist` en sessionStorage).

```
home → destination → service ⇄ payment → searching → assigned → inTrip → rating → home
home ⇄ history → service ("Repetir viaje")
```

- Transiciones válidas en `TRANSITIONS`; cualquier otra acción es un no-op que devuelve `false`.
- `cancel()` (desde searching o assigned) vuelve a `home` y limpia pedido, unidad y destino.
- `back()` en cada paso previo a pedir (y para salir de "Elegir en el mapa").
- Sin efectos: timers, red y canal viven en `features/passenger/useRideSimulation.ts`.
- `rideEvents.on(fn)`: bus de eventos (`requested`, `assigned`, `arrived`, `trip_started`,
  `completed`, `cancelled`, `reassigned`, `rated`…) para analítica, canal y animaciones.
- Recarga: se persiste lo necesario para retomar el pedido; las fases con tiempo siguen el
  reloj de pared (`phaseStartedAt` + `phaseDurationMs`). Estados incoherentes → inicio limpio.
- `history`: viajes terminados en la sesión (Mis viajes los combina con `mocks/history`).

Pruebas: `src/store/__tests__/rideStore.test.ts`.

## dispatchStore.ts (central, `#/central`)

Estado de la central de despacho, separado del pasajero (Zustand + `persist` en sessionStorage,
clave `ivancar-dispatch`). Puro: no publica en el canal ni pone timers; los efectos viven en
`features/central/useDispatchSimulation.ts` y `features/central/commands.ts`.

- `orders`: pedidos reales (`source: 'app'`) y simulados (`'seed'`), con estado, unidad, tramos con reloj
  (`approach`, `trip`) y línea de tiempo. `receiveRide` deduplica por id.
- `tick(now)`: asignación automática tras la pausa visible, fases de los sembrados, pedidos nuevos y
  atascos programados. Devuelve las asignaciones a comunicar.
- `assign`, `reassign`, `resolveAlert`, `applyAppAssigned`, `applyStatus`, `cancel`.
- Selectores puros: `unitPose` (posición de cada unidad con el reloj de pared), `rankUnits` / `bestUnit`,
  `computeAlerts`, `computeKpis`, `unitViews`.
- `dispatchEvents.on(fn)`: `order_received`, `assigned`, `reassigned`, `status`, `cancelled`,
  `alert_raised`, `alert_resolved` (anuncios accesibles y capa de animación del Bloque 5).

Pruebas: `src/store/__tests__/dispatchStore.test.ts`.
