import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Electron file:// loads need relative asset paths and an explicit base.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
