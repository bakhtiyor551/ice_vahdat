import { API_BASE } from "../config";

function apiRoot(): string {
  const base = API_BASE.replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "Не задан адрес сервера. Пересоберите приложение с VITE_API_URL=https://ваш-домен.ru/api (см. mobile/.env.example)"
    );
  }
  return base;
}

export async function authLogin(
  phone: string,
  pin: string
): Promise<{ token: string; cashier: { id: number; phone: string; name: string } }> {
  const base = apiRoot();
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, pin }),
  });
  const body = await parseJson(res);
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error || res.statusText || "Ошибка входа");
    throw err;
  }
  return body as { token: string; cashier: { id: number; phone: string; name: string } };
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function apiFetch(path: string, opts: RequestInit & { token?: string | null } = {}) {
  const base = apiRoot();
  const p = path.startsWith("/") ? path : `/${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const { token, ...rest } = opts;
  const res = await fetch(`${base}${p}`, { ...rest, headers });
  const body = await parseJson(res);
  if (!res.ok) {
    const err = new Error((body as { error?: string }).error || res.statusText || "Ошибка запроса");
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body;
}
