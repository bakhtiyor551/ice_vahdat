/**
 * В `npm run dev` без VITE_API_URL — относительные пути и прокси Vite → backend (без CORS).
 * Если страница открыта по HTTPS (ngrok, Telegram), а VITE_API_URL — `http://...`, браузер
 * заблокирует fetch (mixed content). Тогда сбрасываем base на «тот же origin», чтобы запросы
 * шли на прокси dev/preview. Для продакшена задайте `VITE_API_URL` с `https://...`.
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
  const fallbackProd = "http://localhost:3847";
  let base = explicit || (import.meta.env.DEV ? "" : fallbackProd);

  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    base &&
    isHttpUrl(base)
  ) {
    console.warn(
      "[admin] HTTPS-страница + HTTP API (mixed content). Запросы идут относительно текущего origin; задайте VITE_API_URL=https://… или откройте админку по HTTP.",
    );
    return "";
  }
  return base;
}

export const API_BASE = resolveApiBase();
