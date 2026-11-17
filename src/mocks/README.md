# mocks

Datos ficticios con la forma de las tablas de la Fase 1 (Supabase): ids string, snake_case,
timestamps ISO. Tipos en `src/types`.

- `places.ts`: lugares frecuentes (coordenadas verificadas en OSM), lugares guardados, sectores y `suggestPlaces()`.
- `services.ts`: tipos de servicio con los nombres de ivancar-ec.com (factores de precio de ejemplo).
- `drivers.ts`: conductores y vehículos ficticios (placas GSx-xxxx inventadas), la vista `fleet` y las
  6 unidades de zona (`LOCAL_UNIT_IDS`) que patrullan alrededor del pasajero.
- `fleetRoutes.ts`: circuitos de patrulla sobre calles reales (OSRM, simplificados, sin vaivenes).
- `history.ts`: viajes pasados con ruta simplificada para mini mapas.

Nada aquí debe parecer dato real de IVANCAR.
