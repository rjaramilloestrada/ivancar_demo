# IVANCAR · demo PWA

Demo conceptual (simulado, sin backend) de una PWA para pedir taxis IVANCAR. Preparado por IGNIS.

- Especificación de producto: [`docs/PLAN_IVANCAR.md`](docs/PLAN_IVANCAR.md)
- Plan de ejecución por bloques: [`docs/PLAN_EJECUCION.md`](docs/PLAN_EJECUCION.md)

## Correr

Requiere Node 22.

```bash
npm install
npm run dev        # http://localhost:5173/ivancar_demo/
npm run build      # tsc + vite build → dist/
npm run preview    # sirve dist/ en http://localhost:4173/ivancar_demo/ (service worker activo)
npm run assets     # regenera imágenes WebP e íconos PWA (scripts/build-assets.mjs)
```

El sitio se publica en GitHub Pages bajo `/ivancar_demo/` (`base` en `vite.config.ts`), con `HashRouter`:

| Ruta | Vista |
|---|---|
| `#/` | App del pasajero |
| `#/central` | Central de despacho |
| `#/demo` | Teléfono + central lado a lado (presentación) |
| `#/ui` | Catálogo interno de componentes |

## Stack

Vite 8 · React 19 · TypeScript 7 · Tailwind CSS 4 (tokens en `src/index.css`) · Motion · react-leaflet ·
Zustand · react-router · vite-plugin-pwa. Inter autoalojada (`@fontsource-variable/inter`).

Assets de marca tomados de ivancar-ec.com; los originales pesados no se versionan (`assets-src/`,
los descarga `npm run assets`).

## Flujo del pasajero (P1–P8)

Un solo mapa a pantalla completa y un BottomSheet cuyo contenido cambia con el paso del store
(`src/store/rideStore.ts`). Pantallas en `src/features/passenger/screens/`:

| Paso | Archivo | Qué hace |
|---|---|---|
| P1 `home` | `HomeSheet.tsx` | Saludo, recogida con dirección en vivo, destinos de un toque, respaldo WhatsApp/llamada |
| P2 `destination` | `DestinationSheet.tsx` | Buscador (sin importar tildes), categorías, estado vacío, "Elegir en el mapa" |
| P3 `service` | `ServiceSheet.tsx` | 6 servicios con precio y llegada, por horas, encomiendas, fila de pago y opciones |
| P4 `payment` | `PaymentSheet.tsx` | Efectivo / tarjeta / vale (simulados), programar, nota |
| P5 `searching` | `SearchingSheet.tsx` | Búsqueda (≤ 8 s), con o sin central |
| P6 `assigned` | `AssignedSheet.tsx` | Conductor, placa, ETA en vivo, llamar, chat, compartir, cancelar |
| P7 `inTrip` | `InTripSheet.tsx` | Tiempo y distancia restantes, compartir ubicación, emergencia simulada |
| P8 `rating` | `RatingSheet.tsx` | Resumen, estrellas, propina, comentario, recibo simulado |
| P9 `history` | `HistorySheet.tsx` | Provisional (el Bloque 4 la reemplaza) |

Tiempos de la simulación en `src/lib/simConfig.ts` (P1 → P8 en ~40 s). Para acelerar en pruebas:
`#/?sim=4` divide todos los tiempos entre 4 (rango 1–20).

Con la central abierta en otra pestaña del mismo navegador (`#/central`, o `#/map-lab?role=central`
mientras el Bloque 4 la construye), el pedido llega por BroadcastChannel y la central asigna; sin
central, la app se autoasigna la unidad más cercana.

## Analítica

`src/lib/analytics.ts` carga Meta Pixel y GA4 solo si hay IDs en `.env.local`
(`VITE_META_PIXEL_ID`, `VITE_GA4_ID`; ver `.env.example`). Sin IDs no carga ni envía nada.

## Pruebas

```bash
npm test                              # unitarias (vitest): geo, pricing, máquina de estados
npm run build && node scripts/e2e-passenger.mjs              # recorrido E2E completo
node scripts/e2e-passenger.mjs --only=full,central --shots=/tmp/capturas
```

`scripts/e2e-passenger.mjs` usa Playwright con Chromium (local o global). Levanta `vite preview` si
no está corriendo y lo detiene al terminar. Escenarios: `full` (tiempos reales: toques hasta pedir,
P1 → P8 < 60 s, hrefs de llamar, WhatsApp y compartir), `options`, `cancel-search`,
`cancel-assigned`, `geo`, `osrm-blocked`, `reduced`, `reload`, `central`, `no-central`, `sizes`.
Falla ante errores de consola o respuestas propias ≥ 400. Capturas en `e2e-shots/` (ignorada por git).
