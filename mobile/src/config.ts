/**
 * Локально (`npm run dev`): по умолчанию backend на этом ПК (`http://localhost:3847`).
 *
 * Сборка под телефон (`npm run build`): задайте абсолютный URL API — тот же, что и админка за nginx:
 *   VITE_API_URL=https://ваш-домен.ru/api
 * Относительный путь `/api` здесь не работает: WebView приложения не на вашем домене.
 */
function resolveApiBase(): string {
  const explicit = import.meta.env.VITE_API_URL?.trim();

  if (import.meta.env.DEV) {
    return explicit || "http://localhost:3847";
  }

  if (!explicit) {
    console.warn(
      "[Ice mobile] Сборка без VITE_API_URL — запросы к API не настроены. Пересоберите так:\n" +
        "  VITE_API_URL=https://ваш-сервер.ru/api npm run build && npx cap sync android"
    );
    return "";
  }

  return explicit.replace(/\/$/, "");
}

export const API_BASE = resolveApiBase();
