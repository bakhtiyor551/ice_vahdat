import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // ngrok / cloudflared / localtunnel: случайный поддомен → иначе Vite блокирует Host
    allowedHosts: true,
  },
  preview: {
    allowedHosts: true,
  },
})
