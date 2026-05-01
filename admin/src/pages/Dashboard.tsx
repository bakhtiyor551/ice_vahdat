import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";

type Dash = {
  revenue: number;
  expenses: number;
  profit: number;
  order_count: number;
  cash: number;
  card: number;
  transfer: number;
  debt: number;
};

export default function Dashboard() {
  const { token } = useAuth();
  const [d, setD] = useState<Dash | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const data = await apiFetch<Dash>("/admin/dashboard", { token });
        setD(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
      }
    })();
  }, [token]);

  if (!token) return null;
  if (err) return <p className="text-expense text-sm">{err}</p>;
  if (!d) return <p className="text-slate-500">Загрузка…</p>;

  const cards = [
    { label: "Выручка сегодня", value: `${formatFixed(d.revenue, 0)} сом`, tone: "income" as const },
    { label: "Расходы сегодня", value: `${formatFixed(d.expenses, 0)} сом`, tone: "expense" as const },
    { label: "Чистая прибыль", value: `${formatFixed(d.profit, 0)} сом`, tone: "income" as const },
    { label: "Заказов", value: String(d.order_count ?? 0), tone: "info" as const },
    { label: "Наличные", value: `${formatFixed(d.cash, 0)} сом`, tone: "info" as const },
    { label: "Карта", value: `${formatFixed(d.card, 0)} сом`, tone: "info" as const },
    { label: "Перевод", value: `${formatFixed(d.transfer, 0)} сом`, tone: "info" as const },
    { label: "Долги", value: `${formatFixed(d.debt, 0)} сом`, tone: "warn" as const },
  ];

  const toneClass = {
    income: "border-income/30 bg-income-muted dark:bg-emerald-950/40",
    expense: "border-expense/30 bg-expense-muted dark:bg-red-950/40",
    info: "border-info/30 bg-info-muted dark:bg-blue-950/40",
    warn: "border-warn/30 bg-warn-muted dark:bg-amber-950/40",
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Сводка</h1>
        <p className="text-sm text-slate-500">Показатели за сегодня (по времени сервера)</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-2xl border p-3 shadow-sm ${toneClass[c.tone]}`}
          >
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {c.label}
            </div>
            <div className="mt-1 text-lg font-bold tabular-nums text-slate-900 dark:text-white">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
