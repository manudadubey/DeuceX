import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./*" so Vitest resolves the same
    // alias Next.js's own bundler already does.
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    passWithNoTests: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
