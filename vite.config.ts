import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages sirve el sitio en https://<usuario>.github.io/ivancar_demo/
const BASE = '/ivancar_demo/';

export default defineConfig({
  base: BASE,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    tailwindcss(),
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
        globIgnores: ['**/img/ivancarlogo.png', '**/img/icono.png', '**/inter-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Tiles CARTO Dark Matter (bloque 2)
            urlPattern: /^https:\/\/[a-d]\.basemaps\.cartocdn\.com\/.*/,
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
  },
});
