import { ADMIN_UNAUTHORIZED_EVENT, clearStoredAdminToken } from "../authStorage";
import { API_BASE } from "../config";

export async function apiFetch<T = unknown>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const { token, ...rest } = opts;
  const base = API_BASE.replace(/\/$/, "");
  let url = path.startsWith("http") ? path : `${base}${path}`;
  // Доп. защита: старая сборка или кэш могли оставить http-URL на HTTPS-странице.
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    url.startsWith("http://") &&
    !path.startsWith("http")
  ) {
    url = path;
  }
  const res = await fetch(url, { ...rest, headers });
  const text = await res.text();
  const looksLikeHtml = /^\s*</.test(text);

  if (res.ok && looksLikeHtml) {
    throw new Error(
      "Сервер вернул HTML вместо JSON — запрос не дошёл до API Node. Нужен nginx: location /api/ → proxy_pass на бэкенд; при сборке админки задайте VITE_API_URL=https://ваш-домен/api (или оставьте префикс /api по умолчанию)."
    );
  }

  let data: unknown;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAdminToken();
      try {
        window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
      } catch {
        /* SSR / старые браузеры */
      }
    }
    const err = (data as { error?: string })?.error || res.statusText;
    throw new Error(err);
  }
  return data as T;
}

export async function apiDownloadBlob(
  path: string,
  opts: RequestInit & { token?: string | null; filename?: string }
): Promise<void> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string>),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const { token, filename, ...rest } = opts;
  const base = API_BASE.replace(/\/$/, "");
  let url = path.startsWith("http") ? path : `${base}${path}`;
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    url.startsWith("http://") &&
    !path.startsWith("http")
  ) {
    url = path;
  }
  const res = await fetch(url, { ...rest, headers });
  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAdminToken();
      try {
        window.dispatchEvent(new CustomEvent(ADMIN_UNAUTHORIZED_EVENT));
      } catch {
        /* ignore */
      }
    }
    const text = await res.text();
    let err = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (j?.error) err = j.error;
    } catch {
      if (text) err = text.slice(0, 200);
    }
    throw new Error(err);
  }
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "report.xlsx";
  a.click();
  URL.revokeObjectURL(a.href);
}
