/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Alamat dasar diatur alur kerja GitHub (VITE_BASE) sesuai nama repo; bawaan /ids-app/.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/ids-app/',
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
