import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
// base "/html-to-pdf/" keeps assets working under GitHub Pages project site.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/html-to-pdf/',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/core/**/*.ts', 'src/ui/**/*.ts'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/showcases/**', '**/*.d.ts'],
      // Phase 3 enforcement: core ≥90% lines/functions/statements.
      // pdf/canvas/assets new-code goal is 100% (see docs/CONTRIBUTING.md).
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
})
