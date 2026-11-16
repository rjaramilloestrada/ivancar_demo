# Plan de ejecución: Demo PWA IVANCAR

## Contexto

Rafa entregó `PLAN_IVANCAR.md` (IGNIS, 16-nov-2026): un demo PWA simulado, sin backend, para pedir taxis IVANCAR, con vista pasajero (P1 a P9) y panel central de despacho. Debe verse como producto terminado, con la marca de ivancar-ec.com y la capa de animación IGNIS, y servir de base para la Fase 1.

Estado verificado hoy:
- Repo `rjaramilloestrada/ivancar_demo` está vacío (solo `README.md`). Se usa este repo, no uno nuevo `demo-ivancar`. Rama de trabajo: `claude/ivancar-taxi-pwa-demo-659lpa`.
- Los 5 assets de ivancar-ec.com responden 200 desde este contenedor. Los tiles CARTO Dark Matter también.
- Node 22, npm 10. Versiones actuales en npm: vite 8.3, react 19.3, tailwindcss 4.3, motion 14, react-leaflet 5, leaflet 1.9.4, zustand 5.1, vite-plugin-pwa 2.0, react-router 8.5.

## Ajustes al plan original (y por qué)

1. **Tailwind v4**: los tokens van en CSS (`@theme` en `src/index.css`) con el plugin `@tailwindcss/vite`. No existe `tailwind.config.ts`. `theme/tokens.ts` se mantiene solo para valores que usa JS (mapa, canvas de confetti).
2. **"La central recibe el pedido hecho desde el celular"**: BroadcastChannel solo conecta pestañas del mismo navegador. Sin backend no cruza de un teléfono a un laptop. Solución dentro del alcance: ruta **`/demo`** que muestra en una sola pantalla el teléfono (marco con la app pasajero) y la central lado a lado. Es la vista para presentar y para grabar el video. `/` y `/central` en dos ventanas del mismo navegador también funcionan. El cruce real entre dispositivos queda para Fase 1 (Supabase realtime).
3. **Inter autoalojada** (`@fontsource-variable/inter`) en vez de Google Fonts: funciona offline y carga más rápido.
4. **Pixel y GA4**: el código queda listo pero solo se carga si hay IDs en variables de entorno (`VITE_META_PIXEL_ID`, `VITE_GA4_ID`). Con placeholder no dispara nada.
5. **Dirección del pin**: etiqueta local primero (sector o lugar conocido más cercano, instantánea). Nominatim (OSM) como mejora con debounce, si responde.
6. **Ruta**: se intenta OSRM público con timeout de 2 s. Si falla, línea curva entre puntos. La animación del auto funciona igual en ambos casos.

7. **Deploy en GitHub Pages, no Vercel** (decisión de Rafa). Consecuencias técnicas:
   - `base: '/ivancar_demo/'` en Vite. Manifest con `start_url` y `scope` relativos. Rutas de assets siempre vía `import.meta.env.BASE_URL`.
   - Pages no reescribe rutas SPA: se usa `HashRouter` (`#/central`, `#/demo`). No hay `vercel.json`.
   - Workflow `.github/workflows/deploy.yml` (build + `actions/deploy-pages`), con disparo en la rama por defecto y `workflow_dispatch`.
   - URL final: `https://rjaramilloestrada.github.io/ivancar_demo/`.

## Quién ejecuta (decisión de Rafa)

- Esta sesión solo orquesta: no escribe código ni corre comandos de construcción.
- Cada bloque lo ejecuta un agente con **Opus 5.5** (`Agent` con `model: "opus"`), uno a la vez y en orden, porque cada bloque depende del anterior. Cada agente recibe este plan, `PLAN_IVANCAR.md` y el estado del repo, y termina con commit y push a la rama.
- Si un agente necesita subagentes (búsquedas, verificaciones), van en **Haiku** (`model: "haiku"`).
- Entre bloques, la orquestación solo lee el reporte del agente y decide si sigue o si manda una corrección al mismo agente.
- Primer paso del Bloque 1: guardar `PLAN_IVANCAR.md` en el repo, para que todos los agentes lo lean de ahí.

## Stack

Vite + React 19 + TypeScript, Tailwind v4, Motion, react-leaflet + Leaflet, Zustand, react-router, vite-plugin-pwa, `sharp` (solo dev, para imágenes e íconos). Se validan peer dependencies al instalar (en especial vite-plugin-pwa 2 con Vite 8). Si alguna choca, se baja una versión mayor de Vite.

## Estructura

La de la sección 6 del plan, con estos cambios: sin `tailwind.config.ts`; se agregan `src/index.css` (tokens), `src/features/demo/SplitDemo.tsx`, `scripts/build-assets.mjs`, `.github/workflows/deploy.yml`.

## Orden de ejecución

Un commit por bloque, push a la rama al final de cada uno.

**Bloque 1. Base**
- Scaffold Vite React TS en la raíz del repo. Dependencias.
- Descargar los 5 assets a `public/img/`. `scripts/build-assets.mjs`: hero a 1200 px WebP, corporativo y conductores a WebP, íconos PWA 192/512/maskable y apple-touch-icon desde `icono.png`. No se usan logos de clientes corporativos.
- Tokens de 7.2 en `@theme`: `ivancar-yellow #F6C90E`, fondo `#050505`, superficie `#0C0C0C`, bordes y textos en blanco con opacidad, Inter 900 en mayúsculas para títulos.
- PWA: manifest (standalone, theme `#050505`), service worker con cache del shell, meta tags iOS.
- UI base: `Button` píldora (con estados cargando y check), `Card`, `Eyebrow`, `Skeleton`, `Toast`, `BottomSheet` con arrastre y snap (peek, medio, completo).

**Bloque 2. Mapa y datos**
- `MapView` dark, `DraggablePin` (pin fijo al centro, el mapa se mueve debajo), `AnimatedCar` (interpolación + bearing), `RouteLine` (dibujo progresivo).
- `lib/geo.ts` (haversine, interpolación sobre polilínea, bearing), `lib/pricing.ts` (base + km × factor por servicio, siempre etiquetado "Tarifa referencial de demo"), `lib/channel.ts`.
- Mocks con la forma de tablas de Fase 1: `places.ts` (aeropuerto JJO, Terminal Terrestre, Malecón 2000, malls de Samborondón, puntos de Vía a la Costa, coordenadas aproximadas), `drivers.ts` (nombres ficticios, placas GSx-xxxx, modelos), `history.ts`.
- Servicios con los nombres de su web: Taxi normal, Taxi ejecutivo, SUV, Camioneta, Encomiendas, Servicio por horas.

**Bloque 3. Flujo pasajero P1 a P8**
- `store/rideStore.ts`: máquina de estados `home → destination → service → payment → searching → assigned → inTrip → rating`, más `history`. Cancelar vuelve a `home`.
- Pantallas en `features/passenger/`. Tres toques de abrir a pedir: destino rápido, servicio preseleccionado, "Pedir taxi". Pago por defecto en efectivo, cambiable en el mismo sheet.
- Llamar abre `tel:0980100100`. Compartir abre `wa.me` con texto prellenado (conductor, placa, ETA). Respaldo "Solicitar taxi por WhatsApp" a `wa.me/593980100100`. Botón de emergencia simulado con confirmación.
- Banner discreto "Demo conceptual · IGNIS".

**Bloque 4. P9, chat y central**
- Mis viajes con mini mapas (SVG estático de la ruta, sin instanciar Leaflet por tarjeta).
- Chat simulado con 2 o 3 respuestas automáticas.
- `/central`: lista de pedidos en vivo, mapa de flota con unidades moviéndose, asignación automática a la más cercana, reasignación manual, alerta pulsante si un pedido pasa del umbral sin aceptar (umbral corto en demo, con un pedido "atascado" sembrado para que la alerta se vea). La central es dueña de la asignación cuando está abierta. Si no hay central, el pasajero se autoasigna tras el tiempo de búsqueda, para que el flujo nunca se cuelgue.
- `/demo`: teléfono + central lado a lado.

**Bloque 5. Capa IGNIS (7.5)**
- Splash con barrido de luz sobre el logo. Zoom de Guayaquil a la ubicación. Unidades vivas cerca. Saludo por hora.
- Pin que se levanta y cae. Tarjetas de servicio con selección animada y precio con conteo. Destinos sugeridos según hora y día.
- Radar de búsqueda con contador de unidades evaluadas. Tarjeta de conductor con stagger. ETA con dígitos que transicionan.
- Vibración al llegar (Android) y aviso "Tu IVANCAR llegó". Estrellas animadas y confetti amarillo (canvas propio, sin librería).
- Prompt de instalación propio (`beforeinstallprompt` en Android, instrucciones en iOS).
- `prefers-reduced-motion`: `MotionConfig reducedMotion="user"` más guardas en animaciones de mapa y canvas.

**Bloque 6. Pulido y entrega**
- Estados vacíos, de carga y de error (sin geolocalización, sin red para tiles). Revisión de copy contra su web.
- README con cómo correr, qué es simulado y guion de demo de 60 s.
- Lighthouse y correcciones hasta ≥ 90 en Performance y Accessibility.
- Workflow de GitHub Pages listo en el repo (ver "Necesita a Rafa").

## Verificación

- `npm run build` y `tsc` sin errores.
- Script Playwright (Chromium ya instalado) en viewport móvil: recorre P1 a P8, mide tiempo y toques, falla si hay errores de consola, guarda capturas de cada pantalla para revisión visual.
- Segundo test: dos páginas en el mismo contexto (`/` y `/central`), se pide un taxi y se verifica que el pedido aparece y se asigna en la central.
- Mismo recorrido con `reducedMotion: 'reduce'`.
- Se verifica el `href` de compartir (`wa.me` con texto correcto) y de llamar.
- Lighthouse móvil sobre `vite preview` (con el `base` de Pages, para detectar rutas rotas antes de publicar).
- Comparación visual: captura de la app junto a captura de ivancar-ec.com.

## Lo que no puedo cerrar desde aquí

- Prueba en Android y iPhone reales e instalación como PWA (paso 12): lo hace Rafa con la URL de GitHub Pages. Yo dejo checklist.
- "Prueba de los 5 segundos" con una persona.
- Video del outreach: puedo generar una grabación de pantalla automática con Playwright como borrador. El video final conviene grabarlo en un teléfono real.

## Necesita a Rafa

- **GitHub Pages**: activar una vez en el repo, Settings → Pages → Source: "GitHub Actions". Si el repo es privado, Pages requiere plan de pago de GitHub o hacer el repo público.
- **Publicar**: Pages despliega desde la rama por defecto, así que al final hace falta un PR y merge de la rama de trabajo. Lo pido en ese momento, no antes.
- Pendientes 3 y 4 de la sección 10 (a quién se presenta, datos para cotizar) no bloquean la construcción.
