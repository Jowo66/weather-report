/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/weather-report/',
  plugins: [react()],
  // three.js lives in its own lazy chunk (budget 200 KB gzip, checked by tools/check-bundle-size.mjs).
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['tests/{unit,golden,property,bench}/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
