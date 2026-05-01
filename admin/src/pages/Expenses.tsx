import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";

type ExpRow = {
  id: string;
  amount: number;
  category: string;
  payment_type: string;
  comment: string | null;
  created_at: string;
  cashier_name: string | null;
};

const payLabels: Record<string, string> = {
  cash: "наличные",
  card: "карта",
  transfer: "перевод",
};

export default function Expenses() {
  const { token } = useAuth();
  const [preset, setPreset] = useState("today");
  const [rows, setRows] = useState<ExpRow[]>([]);
  const [cats, setCats] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [payment_type, setPaymentType] = useState("cash");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const c = await apiFetch<string[]>("/admin/expense-categories", { token });
        setCats(c);
        setCategory((prev) => prev || c[0] || "");
      } catch {
        /* ignore */
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const data = await apiFetch<ExpRow[]>(`/admin/expenses?preset=${preset}`, { token });
        setRows(data);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
      }
    })();
  }, [token, preset]);

  const submit = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await apiFetch("/admin/expenses", {
        method: "POST",
        token,
        body: JSON.stringify({
          amount: Number(amount.replace(",", ".")),
          category,
          payment_type,
          comment: comment.trim() || null,
        }),
      });
      setAmount("");
      setComment("");
      const data = await apiFetch<ExpRow[]>(`/admin/expenses?preset=${preset}`, { token });
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  if (!token) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Расходы</h1>

      <div className="flex flex-wrap gap-1">
        {["today", "week", "month"].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              preset === p ? "bg-info text-white" : "bg-slate-200 dark:bg-slate-800"
            }`}
          >
            {p === "today" ? "Сегодня" : p === "week" ? "Неделя" : "Месяц"}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">Новый расход</h2>
        <div className="grid gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="Сумма"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={payment_type}
            onChange={(e) => setPaymentType(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="cash">Наличные</option>
            <option value="card">Карта</option>
            <option value="transfer">Перевод</option>
          </select>
          <input
            placeholder="Комментарий"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
            className="rounded-xl bg-expense py-2.5 font-semibold text-white disabled:opacity-50"
          >
            Сохранить расход
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-expense">{err}</p>}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li
            key={r.id}
            className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex justify-between font-semibold">
              <span>{r.category}</span>
              <span className="text-expense">{formatFixed(r.amount, 0)} сом</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {r.cashier_name || "—"} · {payLabels[r.payment_type] || r.payment_type}
            </div>
            {r.comment && <div className="mt-1 text-sm">{r.comment}</div>}
            <div className="text-[11px] text-slate-400">{new Date(r.created_at).toLocaleString("ru-RU")}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
