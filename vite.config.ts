import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
        return [
          {
            tag: 'script',
            children:
              `(function(){try{if(!(navigator.serviceWorker&&navigator.serviceWorker.controller)){` +
              `var l=document.createElement('link');l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='';l.href='${href}';document.head.appendChild(l)}}catch(e){}})()`,
            injectTo: 'head',
          },
        ];
      },
    },
  };
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
        // .mjs: el worker de MapLibre (se publica como archivo aparte).
        globPatterns: ['**/*.{js,mjs,css,html,woff2,svg,png,webp}'],
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
            // TileJSON del mapa base: apunta a la versión vigente de las teselas. Red primero
            // (las versiones viejas se retiran del servidor) y caché solo como respaldo offline.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/planet$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'map-tilejson',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Teselas vectoriales (URL versionada, inmutables) y glifos de OpenFreeMap.
            urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(planet\/.+\.pbf|fonts\/)/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-vector',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 14 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    // MapLibre GL es un solo módulo minificado de ~1,2 MB (~330 kB gzip) que no admite más
    // división; va en un chunk diferido (no bloquea el primer pintado) y precacheado por el
    // service worker. El resto de chunks sigue por debajo de 500 kB.
    chunkSizeWarningLimit: 1300,
    rolldownOptions: {
      output: {
        // Librerías en chunks propios: cachean aparte del código de la app. React y Motion van
        // en la ruta inicial; Leaflet y MapLibre llegan con el chunk diferido del mapa.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 4 },
            // MapLibre solo lo alcanzan los chunks diferidos del mapa: nunca entra en la ruta inicial.
            { name: 'maplibre', test: /node_modules[\\/](maplibre-gl|@maplibre)[\\/]/, priority: 2 },
            { name: 'leaflet', test: /node_modules[\\/](leaflet|react-leaflet|@react-leaflet)[\\/]/, priority: 3 },
            { name: 'motion', test: /node_modules[\\/](motion|motion-dom|motion-utils|framer-motion)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
