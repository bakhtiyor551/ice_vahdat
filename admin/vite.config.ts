import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
const apiTarget = process.env.VITE_PROXY_API || "http://127.0.0.1:3847";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: true,
    proxy: {
      "/telegram": apiTarget,
      "/admin": apiTarget,
      "/health": apiTarget,
    },
  },
  preview: {
    allowedHosts: true,
    proxy: {
      "/telegram": apiTarget,
      "/admin": apiTarget,
      "/health": apiTarget,
    },
  },
});
