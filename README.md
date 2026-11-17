# IVANCAR · demo PWA

Demo conceptual de una app para pedir taxis IVANCAR (Guayaquil, Samborondón y Vía a la Costa),
con la vista del pasajero, la central de despacho y una vista de presentación que muestra las dos
a la vez. Es una PWA instalable, sin backend: el pedido, el conductor y la central son simulados en
el navegador. Preparado por IGNIS.

- Especificación de producto: [`docs/PLAN_IVANCAR.md`](docs/PLAN_IVANCAR.md)
- Plan de ejecución por bloques: [`docs/PLAN_EJECUCION.md`](docs/PLAN_EJECUCION.md)

## Correr

Requiere Node 22.

```bash
npm install
npm run dev        # http://localhost:5173/ivancar_demo/
npm run build      # tsc + vite build → dist/
npm run preview    # sirve dist/ en http://localhost:4173/ivancar_demo/ (service worker activo)
npm test           # pruebas unitarias (vitest)
npm run assets     # regenera imágenes WebP e íconos PWA (scripts/build-assets.mjs)
```

## Rutas

El sitio vive bajo `/ivancar_demo/` (`base` en `vite.config.ts`) y usa rutas por hash
(`src/lib/hashRouter.tsx`), porque GitHub Pages no reescribe rutas de una SPA.

| Ruta | Vista |
|---|---|
| `#/` | App del pasajero (móvil) |
| `#/central` | Central de despacho (escritorio o tableta) |
| `#/demo` | Teléfono + central lado a lado, para presentar o grabar |
| `#/fx-lab`, `#/map-lab`, `#/ui` | Catálogos internos (efectos, mapa, componentes). Se cargan aparte y no entran al precache |

Parámetro de prueba: `?sim=N` (por ejemplo `#/?sim=4`) divide los tiempos de la simulación entre N
y salta lo que es solo presentación (splash y vuelo de entrada del mapa).

## Qué es real y qué es simulado

| Real | Simulado |
|---|---|
| Mapa y calles (OpenFreeMap, datos OSM) | Conductores, placas y vehículos (ficticios) |
| Geolocalización, si el usuario da permiso (si no, Samborondón) | Movimiento de las unidades y de la flota |
| Ruta por calles con OSRM público (si no responde, ruta estimada) | Asignación, llegada y viaje (tiempos comprimidos: llegada ~30 s, viaje ~45 s; P1 → P8 en ~1 min 30 s) |
| Dirección del pin con Nominatim (si no responde, el lugar conocido más cercano) | Tarifas: fórmula de ejemplo, siempre marcada "Tarifa referencial de demo" |
| "Llamar" abre `tel:0980100100`; "Compartir viaje" y el respaldo abren WhatsApp con texto prellenado | Chat con el conductor (respuestas automáticas) y botón de emergencia |
| Instalación como PWA y uso sin red del shell | Central de despacho, pedidos sembrados y alertas |
| Vibración en Android (Vibration API) | Pago (efectivo, tarjeta o vale: solo se elige) |

Nada se envía a un servidor propio. Meta Pixel y GA4 solo se cargan si hay IDs en `.env.local`
(ver "Analítica").

## Guion de demostración (unos 90 segundos)

Abrir `#/demo` en una pantalla grande (o `#/` en el teléfono y `#/central` en otra pestaña del mismo navegador).

1. **0–5 s.** Abrir el pasajero: el logo se "enciende" y el mapa vuela desde Guayaquil completo hasta
   la recogida, con unidades amarillas moviéndose cerca. "Así de rápido se ubica, sin escribir la dirección."
2. **5–15 s.** Tocar un destino sugerido (cambian según la hora). Mostrar las tarjetas de servicio:
   al cambiar de servicio el brillo se desliza y el precio cuenta. "Precio y tiempo antes de pedir."
3. **15–20 s.** "Pedir Taxi normal". En el teléfono, radar sobre la recogida y unidades evaluadas;
   en la central, el pedido entra arriba con brillo amarillo y la central lo asigna sola.
4. **20–50 s.** Unidad asignada (una de las que se veían cerca, que sale desde donde estaba): conductor,
   placa grande, ETA que baja sin saltos, el auto acercándose por calles. Tocar "Compartir viaje"
   (abre WhatsApp con conductor, placa y destino). En la central, la misma placa en el mismo lugar.
5. **50–95 s.** "Tu IVANCAR llegó" (aviso con la placa y vibración en Android). Empieza el viaje:
   tiempo y kilómetros restantes, compartir ubicación y botón de emergencia (simulado).
6. **Al final.** Calificar con 5 estrellas: confetti amarillo y el viaje queda en "Mis viajes" con su mini mapa.
   Cerrar en la central: alerta pulsando en un pedido que no avanza y "Reasignar ya". "Ningún pedido se pierde."

"Reiniciar demo" (en `#/demo`) deja los dos lados como nuevos.

## Publicación

El demo se publica en GitHub Pages con origen "GitHub Actions". Cada push (merge) a la rama por
defecto, `main`, ejecuta `.github/workflows/deploy.yml`: instala dependencias (`npm ci`), corre
`npm test`, genera `dist/` con `npm run build` y lo despliega. También se puede lanzar a mano desde
la pestaña Actions (`workflow_dispatch`).

URL final: https://rjaramilloestrada.github.io/ivancar_demo/ (por ejemplo `…/ivancar_demo/#/demo`).

`public/404.html` redirige al inicio cualquier ruta desconocida y `public/.nojekyll` evita que Pages
procese el sitio con Jekyll. Pasos manuales, una sola vez: Settings → Pages → Source: "GitHub Actions".
Pages solo está disponible en repositorios públicos o con un plan de pago de GitHub.

## Limitaciones conocidas

- **La central solo se conecta dentro del mismo navegador.** El pedido viaja por BroadcastChannel:
  conecta pestañas, ventanas e iframes del mismo origen en el mismo navegador, no un teléfono con un
  laptop. Por eso existe `#/demo`. El cruce real entre dispositivos queda para la Fase 1 (backend en tiempo real).
- **Mapa base de OpenFreeMap** (tiles vectoriales OpenMapTiles con datos OSM, sin clave, con
  atribución), dibujado con MapLibre GL dentro de Leaflet y con estilo oscuro propio
  (`src/components/map/basemapStyle.ts`). Necesita WebGL; sin WebGL o sin red el mapa muestra un
  aviso con "Reintentar" y el pedido sigue funcionando. Su velocidad depende de un servidor externo
  gratuito y sin SLA. MapLibre pesa ~290 kB gzip (más ~150 kB del worker), en un chunk diferido.
  Las teselas vistas quedan en caché 14 días.
- **OSRM y Nominatim** son servicios públicos de demostración, sin garantía de disponibilidad ni de
  uso intensivo. La app pide poco (caché, como mucho 2 peticiones a la vez y 350 ms entre una y otra) y
  tras 3 fallos seguidos deja de llamar a OSRM 60 s. Si fallan, usa ruta estimada y el lugar conocido
  más cercano, sin bloquear el pedido.
- Sin red, el shell abre y el pedido se simula igual, pero el mapa solo muestra lo que ya estaba en caché.
- El prompt de instalación propio aparece después del primer viaje completo: en Android solo si el
  navegador ofrece la instalación (`beforeinstallprompt`), y en iPhone como instrucciones de Safari.
- La vibración solo existe en Android (Chrome); iOS no expone la Vibration API.
- Rendimiento medido con Lighthouse móvil (simulado): ver la sección "Calidad".

## Stack

Vite 8 · React 19 · TypeScript 7 · Tailwind CSS 4 (tokens en `src/index.css`) · Motion · react-leaflet ·
Zustand · vite-plugin-pwa. Inter autoalojada (`@fontsource-variable/inter`), con una fuente de reserva
de métricas ajustadas para que el cambio de tipografía no mueva el layout.

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

Tiempos de la simulación en `src/lib/simConfig.ts` (llegada ~30 s, viaje ~45 s). El auto arranca y
frena suave, y ETA, kilómetros restantes y posición salen del mismo avance. Para acelerar en pruebas
o grabar: `#/?sim=4` divide todos los tiempos entre 4 (rango 1–20).

**Flota.** Un solo reloj (`src/lib/fleetSim.ts`) para pasajero y central: cada unidad libre está donde
dice la hora. Al fijar la recogida, `src/lib/localFleet.ts` arma dos circuitos por calles alrededor
(OSRM, 2–4 peticiones por zona, con caché) y reparte en ellos 6 unidades de zona de varios tipos
(4–6 a 0,4–1,8 km); el plan se publica a la central por el canal (`fleet:plan`). Sin OSRM usa el
circuito incluido más cercano o, si no hay, circuitos estimados. La unidad asignada es una de las
visibles y su ruta de llegada (OSRM, con su rumbo) empieza donde estaba al asignar.

Con la central abierta en otra pestaña del mismo navegador (`#/central`) o en `#/demo`, el pedido
llega por BroadcastChannel y la central asigna; sin central, la app se autoasigna la unidad más cercana.

## Capa de animación (`src/components/fx`)

Cada efecto tiene una función (orientar, confirmar o tranquilizar), anima solo `transform`/`opacity`
(o un canvas propio) y respeta `prefers-reduced-motion`. Catálogo en `#/fx-lab`.

| Efecto | Dónde |
|---|---|
| `Splash` (logo que se enciende) | Una vez por sesión sobre el pasajero; no en `#/central`, ni en el teléfono de `#/demo`, ni con `?sim=`. Un toque lo salta |
| Vuelo de entrada del mapa | `MapView` (`intro`): de Guayaquil completo a la recogida, con la flota visible |
| `pageMotion` | Cambio de paso del sheet (`SheetSlots.tsx`) |
| `SelectGlow` + `AnimatedNumber` | Tarjetas de servicio y precio del botón (`ServiceSheet.tsx`) |
| `RadarPulseMarker` + contador | Búsqueda (`MapLayers.tsx`, `SearchingSheet.tsx`) |
| `Stagger` | Tarjeta del conductor (`parts.tsx`), se repite al reasignar |
| `AnimatedNumber` | ETA (`AssignedSheet.tsx`) y tiempo restante (`InTripSheet.tsx`); el texto legible es siempre el valor final |
| `ArrivalBanner` + vibración | "Tu IVANCAR llegó", una vez por viaje; `vibrate('confirm')` al asignar |
| `StarRating` + `Confetti` | Calificación con flechas; confetti con 4 o 5 estrellas (`RatingSheet.tsx`, `PassengerApp.tsx`) |
| `InstallPrompt` | Tras completar el primer viaje, de vuelta en inicio; nunca durante un pedido |
| `EnterHighlight`, `PulseAlert` | Central: pedidos nuevos de la app y tarjetas en alerta (`OrderCard.tsx`) |

## Central de despacho (`#/central`)

Una sola pantalla (escritorio y tableta; en el teléfono, dos pestañas). Código en `src/features/central/`,
estado en `src/store/dispatchStore.ts` (separado del pasajero, sessionStorage `ivancar-dispatch`).

- **Cola de pedidos en vivo** (`OrdersList.tsx`, `OrderCard.tsx`): los nuevos entran arriba; origen,
  destino, servicio, pago, hora, cronómetro de espera y estado con color. Filtros: Todos, Sin asignar,
  En curso, Cerrados. Teclado: flechas recorren la cola, Enter abre el detalle.
- **Mapa de flota** (`FleetMap.tsx`, `FleetUnitsLayer.tsx`): 20 unidades (14 de la flota general y 6
  de zona, que patrullan cerca del pasajero y no se usan para los pedidos simulados) movidas de forma imperativa
  (sin renders por frame), libres / ocupadas / en pedido; elegir un pedido encuadra recogida, destino,
  unidad y ruta; elegir una unidad muestra conductor, placa, vehículo y estado.
- **Asignación** automática a la unidad libre más cercana del tipo correcto (reglas de `lib/dispatch.ts`)
  tras una pausa visible, o **manual** (interruptor Automático / Manual) con lista por cercanía y ETA.
  **Reasignar** antes de la recogida publica `ride:reassigned` y el pasajero cambia de unidad.
- **Alertas** ("Requiere atención"): pedido sin asignar o unidad que no avanza más allá del umbral
  (`alertUnassignedMs`, `alertStalledMs` en `lib/simConfig.ts`); la tarjeta pulsa y ofrece "Asignar ya" /
  "Reasignar ya". Los anuncios para lectores de pantalla se encolan (3 s cada uno).
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
P1 → P8 < 100 s, ETA leído cada segundo sin subir ni saltar más de 1 min, hrefs de llamar, WhatsApp
y compartir), `options`, `cancel-search`, `cancel-assigned`, `geo`, `osrm-blocked`, `reduced`, `reload`,
`central`, `no-central`, `history` (Mis viajes: estado vacío, detalle, "Repetir viaje"), `chat`,
`fleet` (Urdesa, Samborondón y Vía a la Costa: ≥ 3 autos a la vista, circuitos OSRM, la unidad
asignada estaba a la vista y su llegada arranca donde estaba), `sizes` (360×740, 390×844 y 430×932,
incluido que Llamar / Chat / Cancelar de "Unidad asignada" quedan completos sobre el pie fijo).

`scripts/e2e-central.mjs` abre pasajero (390×844) y central (1440×900) en dos páginas del mismo contexto.
Escenarios: `flow` (el pedido entra, la central asigna, misma placa en ambos lados, reasignación manual,
estados hasta finalizado), `cancel`, `manual`, `alert` (sembrado atascado y pedido real sin asignar, con
su acción), `reload` (recargas sin duplicar), `demo` (lo esencial dentro de `#/demo` y el reinicio, a
1440×900, 1920×1080 y 1280×800), `reduced`, `sizes` (1440×900, 1280×800, 1024×768, 390×844 y teclado) y
`fps` (framerate de la central con todo en movimiento; informa también `#/demo`).

Ambos fallan ante errores de consola o respuestas propias ≥ 400. Capturas en `e2e-shots/` (ignorada por git).

## Calidad

Medido sobre `vite preview` (con el `base` de Pages) en Chromium headless. Lighthouse móvil, mediana
de 3 corridas (rendimiento simulado: CPU ×4 y 4G lenta):

| | Antes del pulido final | Ahora |
|---|---|---|
| Performance | 51 | 80 (76–85 entre corridas; 82 sin splash ni vuelo de entrada) |
| Accessibility | 100 | 100 |
| CLS (Lighthouse) | 1,07 | 0,002 |
| CLS de la primera carga, CPU ×4 y 1,6 Mbps (CDP) | 1,04 | 0,002 |
| LCP / TBT | 5,1 s / 258 ms | 4,5 s / 181 ms |

El LCP es un tile del mapa: viene de un servidor externo y Leaflet lo pide después de cargar su JS.
Observado sin throttling, el primer contenido pinta a ~0,25 s y el LCP llega a ~0,6 s. axe
(WCAG 2.1 AA + buenas prácticas) no reporta violaciones serias ni críticas en ningún paso del pasajero
(con y sin reduced motion), en la central ni en `#/demo`.

