import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Публичный URL / нестандартный Host — иначе Vite блокирует запросы
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
})
