/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/weather-report/',
  plugins: [react()],
  test: {
    include: ['tests/{unit,golden,property,bench}/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
