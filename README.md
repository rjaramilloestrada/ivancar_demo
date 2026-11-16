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
