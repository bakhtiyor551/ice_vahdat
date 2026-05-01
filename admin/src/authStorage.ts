/** Ключ sessionStorage для JWT админки */
export const ADMIN_JWT_KEY = "ice_admin_jwt";

/** Событие: API вернуло 401 — сбросить сессию в React */
export const ADMIN_UNAUTHORIZED_EVENT = "ice-admin-unauthorized";

/** Удалить сохранённый токен (выход / протухший JWT / 401 с API) */
export function clearStoredAdminToken(): void {
  try {
    sessionStorage.removeItem(ADMIN_JWT_KEY);
  } catch {
    /* ignore */
  }
}

/** Распарсить exp из JWT без проверки подписи (только для UX срока жизни) */
export function parseJwtExp(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (base64.length % 4)) % 4;
    const padded = base64 + "=".repeat(pad);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string, skewSec = 60): boolean {
  const exp = parseJwtExp(token);
  if (exp == null) return false;
  return exp * 1000 < Date.now() + skewSec * 1000;
}
