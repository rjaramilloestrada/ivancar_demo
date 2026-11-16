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
| P9 `history` | `HistorySheet.tsx` | Mis viajes: los de la sesión primero (o estado vacío), ejemplos, mini mapa SVG, detalle con recibo y "Repetir viaje" |

Chat con el conductor (`ChatPanel.tsx` + `chat/chatStore.ts`): diálogo nativo con respuestas automáticas
según el momento del viaje (ya voy, ¿dónde estás?, estoy afuera), "escribiendo…", respuestas rápidas,
hora por mensaje, no leídos en el botón "Chat" y limpieza al terminar o cancelar el viaje.

Tiempos de la simulación en `src/lib/simConfig.ts` (P1 → P8 en ~40 s). Para acelerar en pruebas:
`#/?sim=4` divide todos los tiempos entre 4 (rango 1–20).

Con la central abierta en otra pestaña del mismo navegador (`#/central`) o en `#/demo`, el pedido
llega por BroadcastChannel y la central asigna; sin central, la app se autoasigna la unidad más cercana.

## Central de despacho (`#/central`)

Una sola pantalla (escritorio y tableta; en el teléfono, dos pestañas). Código en `src/features/central/`,
estado en `src/store/dispatchStore.ts` (separado del pasajero, sessionStorage `ivancar-dispatch`).

- **Cola de pedidos en vivo** (`OrdersList.tsx`, `OrderCard.tsx`): los nuevos entran arriba; origen,
  destino, servicio, pago, hora, cronómetro de espera y estado con color. Filtros: Todos, Sin asignar,
  En curso, Cerrados. Teclado: flechas recorren la cola, Enter abre el detalle.
- **Mapa de flota** (`FleetMap.tsx`, `FleetUnitsLayer.tsx`): 14 unidades movidas de forma imperativa
  (sin renders por frame), libres / ocupadas / en pedido; elegir un pedido encuadra recogida, destino,
  unidad y ruta; elegir una unidad muestra conductor, placa, vehículo y estado.
- **Asignación** automática a la unidad libre más cercana del tipo correcto (reglas de `lib/dispatch.ts`)
  tras una pausa visible, o **manual** (interruptor Automático / Manual) con lista por cercanía y ETA.
  **Reasignar** antes de la recogida publica `ride:reassigned` y el pasajero cambia de unidad.
- **Alertas** ("Requiere atención"): pedido sin asignar o unidad que no avanza más allá del umbral
  (`alertUnassignedMs`, `alertStalledMs` en `lib/simConfig.ts`); la tarjeta pulsa y ofrece "Asignar ya" /
  "Reasignar ya".
- **Actividad sembrada**: pedidos simulados en varios estados al abrir (uno atascado que dispara la
  alerta) y uno nuevo cada `seedEveryMs`. Se marcan "Simulado"; los reales llevan "App" y brillan al entrar.
- **Indicadores**: pedidos activos, sin asignar, unidades disponibles y asignación promedio de la sesión,
  calculados de lo que hay en pantalla.

Coordinación (protocolo en `lib/channel.ts`): el pasajero publica `ride:created`; la central responde
`ride:ack` con su modo y, en automático, asigna a los `centralAutoAssignMs` (`ride:assigned`, `by: 'central'`).
El pasajero espera hasta `searchCentralTimeoutMs` (en manual, `searchManualTimeoutMs`) y si no llega
asignación se autoasigna (`by: 'auto'`; la central adopta esa unidad). Los `ride:status` del pasajero
traen su reloj y su ruta: la central mueve la unidad por la misma línea y al mismo ritmo.

## Vista de presentación (`#/demo`)

Teléfono (marco con barra de estado) y central lado a lado, en iframes del mismo origen. La central se
dibuja a ≥ 1100 px y se escala para caber. "Reiniciar demo" limpia los dos lados. `#/demo?sim=2` pasa la
aceleración a ambos. En pantallas menores a 1024 px ofrece enlaces a cada vista.

## Analítica

`src/lib/analytics.ts` carga Meta Pixel y GA4 solo si hay IDs en `.env.local`
(`VITE_META_PIXEL_ID`, `VITE_GA4_ID`; ver `.env.example`). Sin IDs no carga ni envía nada.

## Pruebas

```bash
npm test                              # unitarias (vitest): geo, pricing, fechas, pasajero y central
npm run build && node scripts/e2e-passenger.mjs              # recorrido E2E del pasajero
npm run build && node scripts/e2e-central.mjs                # central + pasajero + #/demo
node scripts/e2e-passenger.mjs --only=full,central --shots=/tmp/capturas
```

`scripts/e2e-passenger.mjs` usa Playwright con Chromium (local o global). Levanta `vite preview` si
no está corriendo y lo detiene al terminar. Escenarios: `full` (tiempos reales: toques hasta pedir,
P1 → P8 < 60 s, hrefs de llamar, WhatsApp y compartir), `options`, `cancel-search`,
`cancel-assigned`, `geo`, `osrm-blocked`, `reduced`, `reload`, `central`, `no-central`, `history`
(Mis viajes: estado vacío, detalle, "Repetir viaje"), `chat`, `sizes`.

`scripts/e2e-central.mjs` abre pasajero (390×844) y central (1440×900) en dos páginas del mismo contexto.
Escenarios: `flow` (el pedido entra, la central asigna, misma placa en ambos lados, reasignación manual,
estados hasta finalizado), `cancel`, `manual`, `alert` (sembrado atascado y pedido real sin asignar, con
su acción), `reload` (recargas sin duplicar), `demo` (lo esencial dentro de `#/demo` y el reinicio, a
1440×900, 1920×1080 y 1280×800), `reduced`, `sizes` (1440×900, 1280×800, 1024×768, 390×844 y teclado) y
`fps` (framerate de la central con todo en movimiento; informa también `#/demo`).

Ambos fallan ante errores de consola o respuestas propias ≥ 400. Capturas en `e2e-shots/` (ignorada por git).
