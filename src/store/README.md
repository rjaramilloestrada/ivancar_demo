# store

`rideStore.ts`: máquina de estados del pedido del pasajero (Zustand + `persist` en sessionStorage).

```
home → destination → service ⇄ payment → searching → assigned → inTrip → rating → home
home ⇄ history
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
