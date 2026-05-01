/**
 * Dev: без VITE_API_URL — относительные пути → прокси Vite на backend (порт 3847).
 * Prod: без VITE_API_URL — префикс `/api` (тот же хост, nginx проксирует /api на Node).
 * Явно задайте VITE_API_URL при сборке, если API на другом домене или без префикса /api.
 */
function isHttpUrl(s: string): boolean {
  try {
    return new URL(s).protocol === "http:";
  } catch {
    return false;
  }
}

function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_API_URL?.trim();

  if (import.meta.env.DEV) {
    const base = explicit ?? "";
    if (
      typeof window !== "undefined" &&
      window.location.protocol === "https:" &&
      base &&
      isHttpUrl(base)
    ) {
      console.warn(
        "[admin] HTTPS + HTTP API (mixed content). Задайте VITE_API_URL=https://… или откройте по HTTP.",
      );
      return "";
    }
    return base;
  }

  // production: не используйте пустой base — иначе fetch пойдёт на /admin/... и nginx отдаст HTML SPA вместо JSON
  const base = explicit || "/api";
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    base &&
    isHttpUrl(base)
  ) {
    console.warn(
      "[admin] HTTPS страница + HTTP в VITE_API_URL — запросы идут на /api (прокси nginx на Node). Задайте https://ваш-домен/api в .env при сборке.",
    );
    return "/api";
  }
  return base;
}

export const API_BASE = resolveApiBase();
