/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Alamat dasar: GitHub Pages menerbitkan di https://sayyid646.github.io/ids-app/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/ids-app/',
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
