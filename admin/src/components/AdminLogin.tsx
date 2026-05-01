import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function AdminLogin() {
  const { loginWithPassword } = useAuth();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalErr(null);
    setBusy(true);
    try {
      await loginWithPassword(login.trim(), password);
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : "Не удалось войти");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center px-4 py-8">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">Вход в админку</h1>
        <p className="mt-1 text-xs text-slate-500">
          Логин и пароль задаются в <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">backend/.env</code>{" "}
          (<span className="whitespace-nowrap">ADMIN_LOGIN</span>,{" "}
          <span className="whitespace-nowrap">ADMIN_PASSWORD</span> или хеш{" "}
          <span className="whitespace-nowrap">ADMIN_PASSWORD_HASH</span>).
        </p>

        <form onSubmit={(e) => void submit(e)} className="mt-6 space-y-3">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Логин
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              placeholder="admin"
              disabled={busy}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Пароль
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
              disabled={busy}
            />
          </label>
          {localErr && <p className="text-sm text-expense">{localErr}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-info py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-blue-700"
          >
            {busy ? "Вход…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
