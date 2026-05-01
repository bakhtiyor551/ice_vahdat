import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "../api/client";
import {
  ADMIN_JWT_KEY,
  ADMIN_UNAUTHORIZED_EVENT,
  clearStoredAdminToken,
  isJwtExpired,
} from "../authStorage";

type Admin = { id: number; name: string; username: string | null };

type AuthCtx = {
  ready: boolean;
  error: string | null;
  token: string | null;
  admin: Admin | null;
  logout: () => void;
  loginWithPassword: (login: string, password: string) => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [admin, setAdmin] = useState<Admin | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const dev = import.meta.env.VITE_DEV_TOKEN?.trim();
      if (dev) {
        if (!cancelled) {
          setToken(dev);
          setAdmin({ id: 0, name: "Dev", username: null });
          setReady(true);
        }
        return;
      }

      let saved = sessionStorage.getItem(ADMIN_JWT_KEY);
      if (saved && isJwtExpired(saved)) {
        clearStoredAdminToken();
        saved = null;
      }
      if (saved) {
        if (!cancelled) {
          setToken(saved);
          setAdmin({ id: 0, name: "Админ", username: null });
          setReady(true);
        }
        return;
      }

      const WebApp = window.Telegram?.WebApp;
      const initData = WebApp?.initData;
      if (!initData) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const body = await apiFetch<{ token: string; admin: Admin }>("/telegram/auth", {
          method: "POST",
          body: JSON.stringify({ initData }),
        });
        if (cancelled) return;
        sessionStorage.setItem(ADMIN_JWT_KEY, body.token);
        setToken(body.token);
        setAdmin(body.admin);
        WebApp?.ready();
        WebApp?.expand();
        const isDark = WebApp?.colorScheme === "dark";
        document.documentElement.classList.toggle("dark", !!isDark);
      } catch (e) {
        if (!cancelled) {
          const raw = e instanceof Error ? e.message : String(e);
          const netFail =
            /load failed|failed to fetch|networkerror|network request failed/i.test(raw);
          setError(
            netFail
              ? `${raw}. Сервер недоступен по текущему адресу: проверьте, что backend запущен (порт 3847). Если открываете Mini App с телефона — в сборке задайте VITE_API_URL на публичный HTTPS-адрес вашего API (не localhost). В браузере на ПК можно оставить пустой VITE_API_URL и прокси dev-сервера.`
              : raw
          );
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null);
      setAdmin(null);
      setError(null);
    };
    window.addEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(ADMIN_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const logout = useCallback(() => {
    clearStoredAdminToken();
    setToken(null);
    setAdmin(null);
    setError(null);
  }, []);

  const loginWithPassword = useCallback(async (login: string, password: string) => {
    const body = await apiFetch<{ token: string; admin: Admin }>("/admin/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
    sessionStorage.setItem(ADMIN_JWT_KEY, body.token);
    setToken(body.token);
    setAdmin(body.admin);
    setError(null);
  }, []);

  const value = useMemo(
    () => ({ ready, error, token, admin, logout, loginWithPassword }),
    [ready, error, token, admin, logout, loginWithPassword]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth");
  return v;
}
