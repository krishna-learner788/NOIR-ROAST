import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // the lazy 3D scene chunk is intentionally large; it loads only near the craft section
  build: { chunkSizeWarningLimit: 600 },
})
