import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function Settings() {
  const { token, logout } = useAuth();
  const [s, setS] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (!token) return;
    void apiFetch<Record<string, string>>("/admin/settings", { token }).then(setS);
  }, [token]);

  if (!token) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Настройки</h1>
      <p className="text-sm text-slate-500">
        Заготовка API. Полноценное редактирование — по мере расширения бэкенда.
      </p>
      {s && (
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
