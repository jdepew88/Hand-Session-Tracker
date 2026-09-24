import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    outDir: 'dist',
    // The modulepreload polyfill is injected as an INLINE <script>, which would
    // force `script-src 'unsafe-inline'` in the CSP. Every browser we target
    // supports modulepreload natively, so we drop the polyfill and keep a strict CSP.
    modulePreload: { polyfill: false },
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
