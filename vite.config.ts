/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static build; the same files work at any path (GitHub Pages serves it under /<repo>/).
export default defineConfig({
  plugins: [react()],
  base: './',
  // three.js is one lazy chunk loaded after first paint (~134 kB gzip).
  build: { chunkSizeWarningLimit: 600 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
