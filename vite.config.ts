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
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Phase 1 skeleton: report only, no enforcement (thresholds in Phase 3).
    },
  },
})
