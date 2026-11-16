# PLAN_IVANCAR.md
Demo PWA de pedido de taxis para IVANCAR (Guayaquil / Samborondón / Vía a la Costa)
Preparado por IGNIS · 16-nov-2026

## 0. Objetivo
Construir un demo funcional (simulado, sin backend real) de una PWA para pedir taxis IVANCAR, que en 60 segundos le muestre al dueño la diferencia entre:
- **Hoy:** escribir por WhatsApp, esperar respuesta, describir la dirección en texto, no saber si la unidad viene ni cuándo llega.
- **Con la app:** pin en el mapa, destino, tipo de servicio, precio estimado, unidad asignada con placa y ETA en vivo, seguimiento y compartir viaje.

El demo es la puerta de entrada a la plataforma completa. No es el producto.

## 1. Lo que sabemos de IVANCAR (verificado en ivancar-ec.com, 16-nov-2026)
| Dato | Valor |
|---|---|
| Propuesta | Taxi 24/7 por llamada y WhatsApp, personas y empresas |
| Servicios | Taxi regular, taxi ejecutivo, traslados ejecutivos, encomiendas, servicio por horas, viajes especiales, servicio corporativo |
| Corporativo | Control de usuarios, vales electrónicos, seguimiento de viajes |
| Vehículos | Taxis regulares y ejecutivos, SUVs, camionetas, unidades especiales |
| Canales de pedido | WhatsApp automatizado, llamada con operador, reservas programadas |
| Pedidos (tel/WhatsApp) | 0980100100 |
| Corporativo y conductores | WhatsApp 593981821111 |
| Email admin | administracion@ivancar-ec.com |
| App propia | No tiene |

**NO sabemos (no inventar en el demo):**
- Tarifas reales → usar tarifas de ejemplo, marcadas como tal en pantalla
- Tamaño de flota, viajes/mes, número de operadoras
- Zonas exactas de cobertura (referencia: Samborondón, Guayaquil, Vía a la Costa)

## 2. El problema que el demo debe hacer evidente
1. Pedir toma demasiado tiempo (ida y vuelta de mensajes, dirección en texto).
2. El cliente no ve confirmación clara ni ETA.
3. A veces la unidad no llega o el pedido se pierde (sin trazabilidad).
4. Canal poco llamativo: nada que lo diferencie de Uber/inDrive.

Cada pantalla del demo debe resolver visiblemente uno de estos 4 puntos.

## 3. Alcance del demo

### 3.1 Vista Pasajero (núcleo, mobile-first)
| # | Pantalla | Qué muestra | Problema que ataca |
|---|---|---|---|
| P1 | Inicio / mapa | Mapa centrado en ubicación (geolocalización o default Samborondón), pin de recogida arrastrable, campo "¿A dónde vas?" | 1 |
| P2 | Destino | Buscador + accesos rápidos a lugares frecuentes (aeropuerto, malls de Samborondón, Malecón, Terminal, Vía a la Costa) | 1 |
| P3 | Tipo de servicio | Tarjetas: Regular, Ejecutivo, SUV, Camioneta, Encomienda, Por horas. Cada una con precio estimado y tiempo | 1, 4 |
| P4 | Pago y opciones | Efectivo / tarjeta / vale corporativo, "Programar para después", nota al conductor | 4 |
| P5 | Buscando unidad | Animación de búsqueda con contador (máx 5-8 s en demo) | 2 |
| P6 | Unidad asignada | Foto/avatar conductor, nombre, placa, modelo/color, calificación, ETA en vivo, auto moviéndose en el mapa, botones Llamar / Chat / Compartir viaje / Cancelar | 2, 3 |
| P7 | En viaje | Ruta, tiempo restante, botón de emergencia, compartir ubicación por WhatsApp | 3 |
| P8 | Llegada y calificación | Resumen (distancia, tiempo, total estimado), estrellas, propina opcional, recibo | 3 |
| P9 | Mis viajes | Historial simulado | 3 |

### 3.2 Vista Central / Operador (diferenciador clave)
Una pantalla tipo panel (desktop o tablet) con:
- Pedidos entrando en tiempo real (los que se hacen desde la vista pasajero en el mismo navegador, vía BroadcastChannel)
- Mapa con unidades disponibles
- Asignación automática a la unidad más cercana + opción de reasignar manualmente
- Alerta si un pedido pasa X min sin aceptar (ataca el punto "la unidad no llega")

Este panel convierte el demo de "otra app de taxi" a "control de tu operación". Alcance de demo, no de producto: todo simulado en el navegador, sin backend, sin usuarios ni roles, sin reportes. Una sola pantalla que se vea terminada y que muestre el pedido del celular llegando en vivo.

### 3.3 Fuera de alcance del demo
App de conductor real; backend, autenticación, base de datos; pagos reales; integración con su WhatsApp automatizado; facturación electrónica / vales corporativos reales; publicación en tiendas.

## 4. Simulado vs. real en el demo
| Elemento | En el demo |
|---|---|
| Mapa | Real (Leaflet + tiles CARTO Dark Matter, sin API key) |
| Geolocalización | Real si el usuario da permiso, si no default Samborondón |
| Rutas | Línea entre puntos. Opcional: OSRM demo público, solo si no complica |
| Lugares frecuentes | Lista fija con coordenadas aproximadas |
| Precio | Fórmula con tarifas de ejemplo (base + km × factor por servicio), con etiqueta visible "Tarifa referencial de demo" |
| Conductor y unidad | Datos ficticios (nombre, placa GSx-xxxx, modelo) |
| Movimiento del auto | Interpolación animada sobre la línea |
| Chat / llamada | Chat simulado con 2-3 respuestas automáticas. Llamar abre tel: al número de pedidos |
| Compartir viaje | Real: abre wa.me con texto prellenado |

**Regla:** nada que parezca dato real de IVANCAR si no lo es. Banner discreto "Demo conceptual · IGNIS".

## 5. Stack
**Criterio rector:** el demo debe verse y sentirse como el producto terminado, no como un prototipo ni un wireframe. IVANCAR tiene que poder abrirlo en su celular y creer que es su app ya publicada. Se construye en React y se reutiliza como base de la Fase 1.

- Vite + React + TypeScript
- Tailwind CSS con los tokens de 7.2
- Motion (Framer Motion) para transiciones, bottom sheet con gestos y layout animations
- react-leaflet con tiles dark (CARTO Dark Matter)
- Zustand (flujo del pedido como máquina de estados)
- Mocks locales en `/src/mocks`, con la misma forma de datos que tendrá Supabase en la Fase 1
- vite-plugin-pwa (manifest, service worker, íconos desde icono.png)
- PWA mínima: manifest (nombre, íconos 192/512, theme_color, display standalone), service worker con cache del shell, meta tags iOS (apple-mobile-web-app-capable, apple-touch-icon)
- Estándar IGNIS para demos: Meta Pixel + GA4 (IDs placeholder) y botón "Pedir por WhatsApp" como fallback visible

## 6. Estructura de archivos
```
public/
  img/                    # logo, icono, hero, corporativo, conductores
  icons/                  # íconos PWA generados desde icono.png
src/
  main.tsx
  App.tsx                 # rutas: / (pasajero), /central (operador), /demo
  theme/tokens.ts
  store/rideStore.ts      # máquina de estados P1..P9 (Zustand)
  features/
    passenger/            # Splash, MapHome, Destination, ServicePicker, Payment,
                          # Searching, DriverAssigned, InTrip, Rating, History
    central/              # DispatchPanel, OrdersList, FleetMap, Alerts
    demo/                 # SplitDemo
  components/
    map/                  # MapView, AnimatedCar, DraggablePin, RouteLine
    sheet/BottomSheet.tsx
    ui/                   # Button (píldora), Card, Eyebrow, Skeleton, Toast
  lib/
    pricing.ts            # tarifa referencial de demo
    geo.ts                # distancia, interpolación, bearing
    channel.ts            # BroadcastChannel pasajero ↔ central
  mocks/                  # places.ts, drivers.ts, history.ts
```

## 7. Diseño: su web es la referencia, el toque IGNIS es el estándar
1. **Referencia (piso):** ivancar-ec.com define la identidad. Mismos assets, paleta, tipografía y tono de copy, para que IVANCAR reconozca su marca al primer vistazo.
2. **Toque IGNIS (techo):** sobre esa base, la app debe ser de nivel premio 2026 (tipo Awwwards / Apple Design Awards): animaciones dinámicas, comportamiento que responde al usuario, cero fricción y un "wow" en los primeros 5 segundos. Su web actual es estática; la app tiene que verse claramente un salto de calidad.

### 7.1 Assets de su web
| Asset | URL | Uso |
|---|---|---|
| Logo (1412×287 px) | https://ivancar-ec.com/assets/img/ivancarlogo.png | Header, splash, panel central |
| Ícono / favicon | https://ivancar-ec.com/assets/img/icono.png | Ícono PWA (192 y 512), favicon |
| Foto hero (6016×4016 px) | https://ivancar-ec.com/assets/img/hero-foto.jpg | Splash / onboarding (comprimir a ~1200 px y WebP). Alt: "Servicio ejecutivo de IVANCAR junto a un vehiculo" |
| Foto corporativo | https://ivancar-ec.com/assets/img/corporativo.jpg | Pantalla "Cuenta empresa" / vales |
| Foto conductores | https://ivancar-ec.com/assets/img/conductores.png | Tarjeta "Trabaja con nosotros" |

**No usar** los logos de sus clientes corporativos (en empresa.html): son marcas de terceros.

### 7.2 Sistema visual (medido en su home)
| Token | Valor | Uso |
|---|---|---|
| Amarillo IVANCAR | `#F6C90E` | Botón principal, acentos, selección de texto (`ivancar-yellow`) |
| Fondo | `#050505` | Body |
| Superficie / tarjetas | `#0C0C0C` | Bloques y tarjetas |
| Header | `rgba(0,0,0,0.85)` con blur | Barra superior fija |
| Texto principal | `#FFFFFF` | Títulos y cuerpo |
| Texto secundario | blanco al 55 / 65 / 75 / 80 % | Párrafos, links |
| Bordes | blanco al 10 / 15 % | Separadores y tarjetas |
| Texto sobre amarillo | `#000000` | Botón principal |
| Tipografía | Inter (fallback system-ui) | Todo |
| Títulos | Inter 900, MAYÚSCULAS, 32-40 px en móvil | |
| Cuerpo | Inter 400, 16 px | |
| Botón principal | Píldora (`border-radius: 9999px`), fondo amarillo, texto negro bold | |
| Eyebrow | Píldora con borde amarillo, texto amarillo pequeño, mayúsculas con tracking amplio | |
| Tarjeta hero | Esquinas muy redondeadas (24-32 px), foto con overlay oscuro | |

Logo: "IVAN" en negro sobre bloque amarillo en itálica + "CAR" en amarillo itálica, ambos extra bold. Tema 100 % oscuro: el mapa va en estilo dark.

### 7.3 Copy: reutilizar su lenguaje
- Sus frases tal cual donde encajen: "Taxi 24/7", "Solicitar taxi por WhatsApp", "Llamar ahora", "Solicitar propuesta corporativa".
- Nombres de servicio como en su web: Taxi normal, Taxi ejecutivo, SUV y camionetas, Encomiendas, Servicio por horas, Viajes, Servicio corporativo.
- Tono: frases cortas, directas, sin tecnicismos.
- "Solicitar taxi por WhatsApp" → `https://wa.me/593980100100`. "Llamar ahora" → `tel:0980100100`.

### 7.4 Patrón de la app
- Mapa dark a pantalla completa + bottom sheet `#0C0C0C` con esquinas superiores redondeadas, botón principal amarillo píldora.
- Una acción principal por pantalla, botones grandes para uso a una mano, contraste AA.
- Microinteracciones: búsqueda de unidad, auto moviéndose (ícono amarillo), ETA bajando.

### 7.5 Capa IGNIS: nivel premio 2026
**Principio:** cada animación tiene una función (orientar, confirmar o dar tranquilidad). Nada decorativo que frene el pedido. Pedir un taxi sigue tomando menos de 60 segundos.

**Primera impresión (0-5 s)**
- Splash con el logo que se "enciende" como luz de faro: barrido de luz amarilla sobre el logo y transición al mapa.
- Entrada del mapa con zoom suave desde Guayaquil completo hasta la ubicación del usuario, con unidades amarillas "vivas" moviéndose cerca (simuladas).
- Saludo contextual por hora del día ("Buenas noches, ¿a dónde vamos?"), sin pedir login.

**Comportamiento dinámico**
- Bottom sheet con física real: se arrastra, rebota suave, se adapta al contenido (peek / medio / completo).
- Pin de recogida que se "levanta" al mover el mapa y "cae" con un pequeño rebote al soltar, con la dirección actualizándose en vivo.
- Tarjetas de servicio con selección animada (escala + brillo amarillo) y precio que cuenta hacia arriba al cambiar de servicio.
- Destinos sugeridos según la hora: aeropuerto de madrugada, centros comerciales de Samborondón en la tarde, Vía a la Costa el fin de semana.
- Botón principal con morphing: "Pedir taxi" → cargando → check.
- Búsqueda de unidad: ondas de radar amarillas desde el pin, contador de unidades cercanas evaluadas.
- Unidad asignada: tarjeta del conductor con stagger (foto, nombre, placa, auto), ruta dibujándose en el mapa, auto girando según la dirección.
- ETA en vivo con números que transicionan (no saltan).
- Llegada: vibración háptica (Vibration API en Android) + aviso "Tu IVANCAR llegó".
- Final del viaje: estrellas animadas y confetti amarillo sutil.

**Intuición (cero fricción)**
- Máximo 3 toques desde abrir la app hasta pedir (ubicación automática, destino, confirmar).
- Una acción principal por pantalla, siempre en la zona del pulgar.
- Estados vacíos, de carga y de error diseñados. Skeletons en vez de spinners.
- Respeta `prefers-reduced-motion`.
- Modo oscuro nativo, contraste AA.

**Lo que hace que el usuario quiera usarla**
- "Compartir mi viaje" con texto que se ve bien al pegarlo en WhatsApp.
- Lugares guardados (Casa, Oficina) con íconos y acceso de un toque.
- Historial con mini mapas de cada viaje.
- Instalación PWA con prompt propio animado ("Agrega IVANCAR a tu pantalla").

**Rendimiento:** 60 fps en un Android de gama media, Lighthouse ≥ 90 en Performance y Accessibility.

**Panel central con el mismo nivel:** pedidos que entran con animación, unidades que se mueven en vivo, alertas que pulsan en amarillo cuando un pedido lleva demasiado tiempo sin asignarse.

## 9. Checklist de aceptación
- Pedido completo P1 → P8 en menos de 60 s sin explicaciones
- Funciona en Android y iPhone, instalable como PWA
- Precio marcado como referencial, sin tarifas inventadas presentadas como reales
- Panel central recibe el pedido hecho desde la vista pasajero
- Botón compartir viaje abre WhatsApp con texto correcto
- Sin errores en consola, carga < 3 s en 4G
- Banner "Demo conceptual · IGNIS"
- Puesta al lado de ivancar-ec.com, se ve como la misma marca
- Puesta al lado de su web, se nota claramente el salto de calidad
- Máximo 3 toques de abrir a pedir; 60 fps en Android de gama media; Lighthouse ≥ 90
- Funciona bien con `prefers-reduced-motion` activado
