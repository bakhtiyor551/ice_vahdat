import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
const apiTarget = process.env.VITE_PROXY_API || "http://127.0.0.1:3847";

/** Корень статики на сервере: "/" или "/admin/" если админка не в корне домена */
function viteBase(): string {
  const raw = process.env.VITE_BASE?.trim();
  if (!raw || raw === "/") return "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withSlash.endsWith("/") ? withSlash : `${withSlash}/`;
}

export default defineConfig({
  base: viteBase(),
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
