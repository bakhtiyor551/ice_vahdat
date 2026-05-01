import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";

function isHtmlInsteadOfJson(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const r = data as { raw?: unknown };
  return typeof r.raw === "string" && /^\s*</.test(r.raw);
}

export default function Settings() {
  const { token, logout } = useAuth();
  const [s, setS] = useState<Record<string, string> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setErr(null);
    void apiFetch<Record<string, unknown>>("/admin/settings", { token })
      .then((data) => {
        if (isHtmlInsteadOfJson(data)) {
          setS(null);
          setErr(
            "Сервер вернул страницу сайта вместо JSON — запрос к API не доходит до Node. Пересоберите админку с правильным VITE_API_URL (например https://ваш-домен.ru/api) и проверьте nginx: location /api/ должен проксировать на бэкенд, а не отдавать index.html."
          );
          return;
        }
        setS(data as Record<string, string>);
      })
      .catch((e) => {
        setS(null);
        setErr(e instanceof Error ? e.message : "Не удалось загрузить настройки");
      });
  }, [token]);

  if (!token) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Настройки</h1>
      <p className="text-sm text-slate-500">
        Заготовка API. Полноценное редактирование — по мере расширения бэкенда.
      </p>
      {err && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {err}
        </p>
      )}
      {s && !err && (
        <pre className="overflow-auto rounded-xl bg-slate-100 p-3 text-left text-xs dark:bg-slate-800">
          {JSON.stringify(s, null, 2)}
        </pre>
      )}
      <button
        type="button"
        onClick={() => logout()}
        className="w-full rounded-xl border border-expense py-3 font-medium text-expense"
      >
        Сбросить сессию (выйти из админки)
      </button>
    </div>
  );
}
