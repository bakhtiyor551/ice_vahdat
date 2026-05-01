import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { formatFixed } from "../format";
import { useAuth } from "../context/AuthContext";

type Cashier = {
  id: number;
  phone: string;
  name: string;
  is_active: number;
  sale_count: number;
  sale_sum: number;
  daily_salary_rate?: number;
};

export default function Cashiers() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Cashier[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [dailyRate, setDailyRate] = useState("45");
  const [editing, setEditing] = useState<Cashier | null>(null);

  const load = async () => {
    if (!token) return;
    const data = await apiFetch<Cashier[]>("/admin/cashiers", { token });
    setRows(data);
  };

  useEffect(() => {
    if (!token) return;
    void load().catch((e) => setErr(String(e.message)));
  }, [token]);

  const saveNew = async () => {
    if (!token) return;
    try {
      const dr = Number(dailyRate);
      await apiFetch("/admin/cashiers", {
        method: "POST",
        token,
        body: JSON.stringify({
          name,
          phone,
          pin,
          is_active: true,
          daily_salary_rate: Number.isFinite(dr) && dr >= 0 ? dr : 45,
        }),
      });
      setName("");
      setPhone("");
      setPin("");
      setDailyRate("45");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const saveEdit = async () => {
    if (!token || !editing) return;
    try {
      const dr = Number(dailyRate);
      const body: Record<string, unknown> = {
        name,
        phone,
        is_active: editing.is_active,
        daily_salary_rate: Number.isFinite(dr) && dr >= 0 ? dr : 45,
      };
      if (pin) body.pin = pin;
      await apiFetch(`/admin/cashiers/${editing.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify(body),
      });
      setEditing(null);
      setName("");
      setPhone("");
      setPin("");
      setDailyRate("45");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const toggleActive = async (c: Cashier) => {
    if (!token) return;
    try {
      await apiFetch(`/admin/cashiers/${c.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ is_active: c.is_active ? false : true }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (!token) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Кассиры</h1>
      {err && <p className="text-sm text-expense">{err}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">{editing ? "Редактировать" : "Новый кассир"}</h2>
        <div className="grid gap-2">
          <input
            placeholder="Имя"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Телефон"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder={editing ? "Новый PIN (оставьте пустым — не менять)" : "PIN"}
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <label className="text-xs text-slate-500">
            Ставка за день (сомони)
            <input
              type="number"
              min={0}
              step={1}
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              className="mt-0.5 w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveEdit()}
                  className="flex-1 rounded-xl bg-income py-2 font-semibold text-white"
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setName("");
                    setPhone("");
                    setPin("");
                    setDailyRate("45");
                  }}
                  className="rounded-xl bg-slate-200 px-4 dark:bg-slate-700"
                >
                  Отмена
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void saveNew()}
                className="w-full rounded-xl bg-income py-2 font-semibold text-white"
              >
                Добавить
              </button>
            )}
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {rows.map((c) => (
          <li
            key={c.id}
            className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex justify-between">
              <span className="font-semibold">{c.name}</span>
              <span className="text-xs text-slate-400">{c.is_active ? "активен" : "выкл"}</span>
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">{c.phone}</div>
            <div className="text-xs text-slate-500">
              Продаж: {c.sale_count ?? 0} · на {formatFixed(c.sale_sum, 0)} сом · ставка {c.daily_salary_rate ?? 45} сом/день
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(c);
                  setName(c.name);
                  setPhone(c.phone);
                  setPin("");
                  setDailyRate(String(c.daily_salary_rate ?? 45));
                }}
                className="flex-1 rounded-lg bg-info-muted py-1.5 text-sm text-info"
              >
                Редактировать
              </button>
              <button
                type="button"
                onClick={() => void toggleActive(c)}
                className="rounded-lg bg-warn-muted px-2 py-1.5 text-xs text-warn"
              >
                {c.is_active ? "Отключить" : "Включить"}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
