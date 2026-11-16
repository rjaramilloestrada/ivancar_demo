import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// Config aparte de vite.config.ts: los tests de lógica no necesitan React, Tailwind ni PWA.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
