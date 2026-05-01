import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";
import { ensureArray, ensurePaymentMap } from "../guards";

type OrderRow = {
  id: string;
  created_at: string;
  total_amount: number;
  payment_type: string;
  cashier_name: string | null;
  items?: { product_name: string; quantity: number; total: number }[];
};

type ExpRow = {
  id: string;
  created_at: string;
  amount: number;
  category: string;
  cashier_name: string | null;
};

type DayDetail = {
  date: string;
  summary: {
    revenue: number;
    expenses: number;
    profit: number;
    order_count: number;
    avg_check: number;
    debt_sales_total: number;
  };
  payments: Record<string, number>;
  orders: OrderRow[];
  expenses: ExpRow[];
  products: { product_name: string; qty: number; sum_total: number }[];
  cashiers: {
    name: string;
    orders: number;
    sales_sum: number;
    expenses_sum: number;
  }[];
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  debt: "Долг",
};

export default function ReportDayDetail() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const dateParam = search.get("date") || new Date().toISOString().slice(0, 10);
  const [data, setData] = useState<DayDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      setLoading(true);
      try {
        const d = await apiFetch<DayDetail>(
          `/admin/reports/day-detail?date=${encodeURIComponent(dateParam)}`,
          { token }
        );
        setData({
          ...d,
          summary: {
            revenue: d.summary?.revenue ?? 0,
            expenses: d.summary?.expenses ?? 0,
            profit: d.summary?.profit ?? 0,
            order_count: d.summary?.order_count ?? 0,
            avg_check: d.summary?.avg_check ?? 0,
            debt_sales_total: d.summary?.debt_sales_total ?? 0,
          },
          payments: ensurePaymentMap(d.payments),
          products: ensureArray(d.products),
          cashiers: ensureArray(d.cashiers),
          orders: ensureArray(d.orders),
          expenses: ensureArray(d.expenses),
        });
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, dateParam]);

  if (!token) return null;
  if (loading) return <p className="text-slate-500">Загрузка…</p>;
  if (!data) return <p className="text-red-600">Не удалось загрузить отчёт за день.</p>;

  const cur = "сомони";

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">День: {data.date}</h1>
        <Link to="/report" className="text-sm text-info underline">
          ← К отчёту
        </Link>
      </div>

      <label className="block text-xs text-slate-500">
        Другая дата
        <input
          type="date"
          defaultValue={dateParam}
          onChange={(e) => {
            const v = e.target.value;
            if (v) navigate(`/reports/detail?date=${encodeURIComponent(v)}`);
          }}
          className="mt-0.5 block w-full rounded-xl border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
        />
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-income-muted p-2 dark:bg-emerald-950/40">
          <div className="text-xs text-slate-600">Выручка</div>
          <div className="font-bold text-income">{formatFixed(data.summary.revenue, 0)}</div>
        </div>
        <div className="rounded-xl bg-expense-muted p-2 dark:bg-red-950/40">
          <div className="text-xs">Расходы</div>
          <div className="font-bold text-expense">{formatFixed(data.summary.expenses, 0)}</div>
        </div>
        <div className="rounded-xl bg-info-muted p-2 dark:bg-blue-950/40">
          <div className="text-xs">Прибыль</div>
          <div className="font-bold">{formatFixed(data.summary.profit, 0)}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
          <div className="text-xs text-slate-500">Заказы</div>
          <div className="font-bold">{data.summary.order_count ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
          <div className="text-xs text-slate-500">Средний чек</div>
          <div className="font-bold">{formatFixed(data.summary.avg_check, 2)}</div>
        </div>
        <div className="rounded-xl border border-warn/30 bg-warn-muted p-2 dark:bg-amber-950/30">
          <div className="text-xs text-warn">Долги</div>
          <div className="font-bold">{formatFixed(data.summary.debt_sales_total, 0)}</div>
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Итог по оплатам</h2>
        <ul className="rounded-2xl border border-slate-200 p-3 text-sm dark:border-slate-700">
          {Object.entries(data.payments ?? {}).map(([k, v]) => (
            <li key={k} className="flex justify-between py-0.5">
              <span>{PAYMENT_LABEL[k] || k}</span>
              <span>
                {formatFixed(v, 0)} {cur}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Итог по товарам</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-2">Товар</th>
                <th className="px-2 py-2">Кол-во</th>
                <th className="px-2 py-2">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.product_name} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-2">{p.product_name}</td>
                  <td className="px-2 py-2">{p.qty}</td>
                  <td className="px-2 py-2">{formatFixed(p.sum_total, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Итог по кассирам</h2>
        <ul className="space-y-2 text-sm">
          {data.cashiers.map((c) => (
            <li key={c.name} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="font-medium">{c.name}</div>
              <div>Заказы: {c.orders}</div>
              <div>Продажи: {formatFixed(c.sales_sum, 0)} {cur}</div>
              <div>Расходы: {formatFixed(c.expenses_sum, 0)} {cur}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Заказы ({data.orders.length})</h2>
        <ul className="space-y-3 text-sm">
          {data.orders.map((o) => (
            <li key={o.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="flex flex-wrap justify-between gap-1">
                <span className="text-slate-500">{new Date(o.created_at).toLocaleString()}</span>
                <span className="font-semibold">
                  {formatFixed(o.total_amount, 0)} {cur} · {PAYMENT_LABEL[o.payment_type] || o.payment_type}
                </span>
              </div>
              <div className="text-xs text-slate-500">Кассир: {o.cashier_name || "—"}</div>
              {ensureArray<{ product_name: string; quantity: number; total: number }>(o.items).length ? (
                <ul className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                  {ensureArray<{ product_name: string; quantity: number; total: number }>(o.items).map((it, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {it.product_name} ×{it.quantity}
                      </span>
                      <span>{formatFixed(it.total, 0)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Расходы ({data.expenses.length})</h2>
        <ul className="space-y-2 text-sm">
          {data.expenses.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <span>
                {e.category} · {e.cashier_name || "—"}
              </span>
              <span className="font-medium text-expense">
                −{formatFixed(e.amount, 0)} {cur}
              </span>
              <span className="w-full text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
