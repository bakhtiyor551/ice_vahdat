import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";
import { ensureArray } from "../guards";

type SaleRow = {
  id: string;
  order_no: number;
  total_amount: number;
  payment_type: string;
  created_at: string;
  cashier_name: string | null;
  sync_status: string;
};

const payLabel: Record<string, string> = {
  cash: "наличные",
  card: "карта",
  transfer: "перевод",
  debt: "долг",
};

export default function Sales() {
  const { token } = useAuth();
  const [preset, setPreset] = useState<string>("today");
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const data = await apiFetch<SaleRow[]>(`/admin/orders?preset=${preset}`, { token });
        setRows(ensureArray(data));
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
      }
    })();
  }, [token, preset]);

  if (!token) return null;

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Продажи</h1>
      <div className="flex flex-wrap gap-1">
        {["today", "yesterday", "week", "month"].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              preset === p
                ? "bg-info text-white"
                : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            {p === "today"
              ? "Сегодня"
              : p === "yesterday"
                ? "Вчера"
                : p === "week"
                  ? "Неделя"
                  : "Месяц"}
          </button>
        ))}
      </div>
      {err && <p className="text-sm text-expense">{err}</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              to={`/sales/${encodeURIComponent(r.id)}`}
              className="block rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-slate-900 dark:text-white">#{r.order_no}</span>
                <span className="font-bold text-income">{formatFixed(r.total_amount, 0)} сом</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {r.cashier_name || "—"} · {payLabel[r.payment_type] || r.payment_type}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">
                {new Date(r.created_at).toLocaleString("ru-RU")} · {r.sync_status}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !err && <p className="text-sm text-slate-500">Нет продаж за период</p>}
    </div>
  );
}
