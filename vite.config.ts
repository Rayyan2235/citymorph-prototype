import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // MapLibre loads its own module worker; pre-bundling breaks the worker path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
