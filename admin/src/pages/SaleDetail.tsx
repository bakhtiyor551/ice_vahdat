import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";

type Item = {
  product_name: string;
  quantity: number;
  price: number;
  total: number;
};

type SaleDetail = {
  id: string;
  total_amount: number;
  payment_type: string;
  cashier_name: string | null;
  created_at: string;
  date_display: string;
  items: Item[];
};

export default function SaleDetail() {
  const { id } = useParams();
  const { token } = useAuth();
  const [s, setS] = useState<SaleDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    void (async () => {
      try {
        const data = await apiFetch<SaleDetail>(`/admin/orders/${encodeURIComponent(id)}`, { token });
        setS(data);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
      }
    })();
  }, [token, id]);

  if (!token) return null;
  if (err) return <p className="text-expense">{err}</p>;
  if (!s) return <p className="text-slate-500">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <Link to="/sales" className="text-sm text-info">
        ← Назад к списку
      </Link>
      <h1 className="text-xl font-bold">Заказ</h1>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-2xl font-bold">{formatFixed(s.total_amount, 0)} сомони</div>
        <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <p>Оплата: {s.payment_type}</p>
          <p>Кассир: {s.cashier_name || "—"}</p>
          <p>Дата: {s.date_display || new Date(s.created_at).toLocaleString("ru-RU")}</p>
        </div>
      </div>
      <div>
        <h2 className="mb-2 font-semibold">Товары</h2>
        <ul className="space-y-2">
          {s.items.map((it, i) => (
            <li
              key={i}
              className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800"
            >
              <span>
                {it.product_name} ×{it.quantity}
              </span>
              <span className="font-medium">{formatFixed(it.total, 0)} сом</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
