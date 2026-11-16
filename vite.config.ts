import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { map as mapTokens } from './src/theme/tokens.ts';

// GitHub Pages sirve el sitio en https://<usuario>.github.io/ivancar_demo/
const BASE = '/ivancar_demo/';

/** Precarga Inter latin (peso variable normal) para evitar el salto de layout por font swap. */
function preloadInter(): Plugin {
  return {
    name: 'preload-inter-latin',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((f) => /inter-latin-wght-normal-.*\.woff2$/.test(f));
        if (!file) return [];
        // Solo en la primera visita: con el service worker activo la fuente sale de la caché
        // al instante y un preload extra queda "sin usar" (aviso en consola).
        const href = `${BASE}${file}`;
        // Tile central de la vista de entrada (Guayaquil completo): se pide desde el HTML, sin
        // esperar a Leaflet, cuando la app va a hacer la entrada animada (sin pedido en curso,
        // sin ?sim= y sin reduced motion; mismas condiciones que PassengerApp).
        const tiles = introTiles().map((u) => JSON.stringify(u)).join(',');
        const pre = (attrs: string) => `var l=document.createElement('link');${attrs}document.head.appendChild(l);`;
        return [
          {
            tag: 'script',
            children:
              `(function(){try{if(!(navigator.serviceWorker&&navigator.serviceWorker.controller)){${pre(`l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='';l.href='${href}';`)}}` +
              `var h=location.hash||'',st='';try{st=sessionStorage.getItem('ivancar-ride')||''}catch(e){}` +
              `if((h===''||h==='#/'||h==='#')&&!/[?&]sim=/.test(location.href)&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!/"pickup":\{/.test(st)){` +
              `[${tiles}].forEach(function(u){${pre(`l.rel='preload';l.as='image';l.href=u;`)}})}}catch(e){}})()`,
            injectTo: 'head',
          },
        ];
      },
    },
  };
}

/** URLs (base y etiquetas) del tile que queda en el centro de la vista de entrada. */
function introTiles(): string[] {
  const [lat, lng] = mapTokens.cityCenter;
  const z = mapTokens.cityZoom;
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const r = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  const fill = (u: string) => u.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  return [mapTokens.tiles.url, mapTokens.tiles.labelsUrl].filter((u): u is string => !!u && !u.includes('{s}')).map(fill);
}

export default defineConfig({
  base: BASE,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
    preloadInter(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      includeAssets: ['icons/favicon-48.png', 'icons/apple-touch-icon-180.png', 'icons/mark.svg'],
      manifest: {
        id: BASE,
        name: 'IVANCAR',
        short_name: 'IVANCAR',
        description: 'Pide tu taxi IVANCAR en segundos. Taxi 24/7 en Guayaquil, Samborondón y Vía a la Costa.',
        lang: 'es',
        dir: 'ltr',
        // Relativos al manifest, para que funcionen bajo /ivancar_demo/
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#050505',
        background_color: '#050505',
        categories: ['travel', 'navigation'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Shell de la app: JS, CSS, HTML, fuentes, íconos y las imágenes optimizadas.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webp}'],
        // El logo original (530 KB) no se precachea; la UI usa la versión WebP.
        globIgnores: [
          '**/img/ivancarlogo.png',
          '**/img/icono.png',
          // Fotos de secciones que no están en la ruta inicial: se piden por red al usarse.
          '**/img/hero-*.webp',
          '**/img/corporativo-*.webp',
          '**/img/conductores-*.webp',
          // Alfabetos que casi no se usan (latin-ext también): se cargan por red si hacen falta.
          '**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese,latin-ext}-*.woff2',
          // Catálogos internos (#/fx-lab, #/map-lab, #/ui) y su cursiva: solo con red.
          '**/assets/{FxLab,MapLab,UiKit}-*.{js,css}',
          '**/inter-*-wght-italic-*.woff2',
        ],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Tiles del mapa (bloque 2): Esri Dark Gray Canvas (y CARTO si se configura con clave)
            urlPattern: /^https:\/\/(server\.arcgisonline\.com\/ArcGIS\/rest\/services\/Canvas\/|[a-d]\.basemaps\.cartocdn\.com\/)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Librerías en chunks propios: cachean aparte del código de la app y ningún
        // chunk pasa de 500 kB. Todas se cargan en la home, en paralelo.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
            { name: 'leaflet', test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/, priority: 2 },
            { name: 'motion', test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
