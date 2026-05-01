import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiDownloadBlob, apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed, safeNum } from "../format";

type Preset = "today" | "yesterday" | "week" | "month" | "custom";

type Summary = {
  revenue: number;
  expenses: number;
  salary_paid: number;
  profit: number;
  order_count: number;
  avg_check: number;
  debt_sales_total: number;
  net_cash_card_transfer: number;
  currency: string;
  period: { start: string; end: string; label: string };
};

type PaymentsRes = { payments: Record<string, number>; currency: string };
type ProductsRes = { products: { product_name: string; qty: number; sum_total: number }[] };
type ExpensesRes = { by_category: { category: string; sum_amount: number; cnt: number }[] };
type CashiersRes = {
  cashiers: {
    name: string;
    orders: number;
    sales_sum: number;
    expenses_sum: number;
  }[];
};
type AccountsRes = {
  accounts: {
    name: string;
    code: string;
    current_balance: number;
    period: {
      sales_in: number;
      expenses_out: number;
      transfer_in: number;
      transfer_out: number;
      net_change: number;
    };
  }[];
};
type StockRes = {
  packaging: {
    name: string;
    sold_qty: number;
    stock_qty: number;
    unit: string;
  }[];
};

type CashierOpt = { id: number; name: string };
type ProductOpt = { id: number; name: string };

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  debt: "Долг",
};

const EXPENSE_CATEGORIES = [
  "Молоко",
  "Сахар",
  "Сливки",
  "Сухое молоко",
  "Ванилин",
  "Стаканчики",
  "Рожки",
  "Ложки",
  "Салфетки",
  "Доставка",
  "Ремонт",
  "Аренда",
  "Электричество",
  "Вода",
  "Реклама",
  "Прочее",
];

function buildSearchParams(opts: {
  preset: Preset;
  from: string;
  to: string;
  cashier_id: string;
  payment_type: string;
  expense_category: string;
  expense_payment_type: string;
  product_id: string;
}): string {
  const q = new URLSearchParams();
  if (opts.preset === "custom" && opts.from && opts.to) {
    q.set("from", opts.from);
    q.set("to", opts.to);
  } else if (opts.preset !== "custom") {
    q.set("preset", opts.preset);
  }
  if (opts.cashier_id) q.set("cashier_id", opts.cashier_id);
  if (opts.payment_type) q.set("payment_type", opts.payment_type);
  if (opts.expense_category) q.set("expense_category", opts.expense_category);
  if (opts.expense_payment_type) q.set("expense_payment_type", opts.expense_payment_type);
  if (opts.product_id) q.set("product_id", opts.product_id);
  return q.toString();
}

export default function Report() {
  const { token } = useAuth();
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashierId, setCashierId] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expensePaymentType, setExpensePaymentType] = useState("");
  const [productId, setProductId] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [cashiers, setCashiers] = useState<CashierOpt[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [payments, setPayments] = useState<PaymentsRes | null>(null);
  const [productsR, setProductsR] = useState<ProductsRes | null>(null);
  const [expenses, setExpenses] = useState<ExpensesRes | null>(null);
  const [cashiersR, setCashiersR] = useState<CashiersRes | null>(null);
  const [accounts, setAccounts] = useState<AccountsRes | null>(null);
  const [stock, setStock] = useState<StockRes | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const queryStr = useMemo(
    () =>
      buildSearchParams({
        preset,
        from,
        to,
        cashier_id: cashierId,
        payment_type: paymentType,
        expense_category: expenseCategory,
        expense_payment_type: expensePaymentType,
        product_id: productId,
      }),
    [preset, from, to, cashierId, paymentType, expenseCategory, expensePaymentType, productId]
  );

  const loadMeta = useCallback(async () => {
    if (!token) return;
    const [cList, pList] = await Promise.all([
      apiFetch<CashierOpt[]>("/admin/cashiers", { token }),
      apiFetch<ProductOpt[]>("/admin/products", { token }),
    ]);
    setCashiers(cList);
    setProducts(pList);
  }, [token]);

  const loadReport = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const base = `/admin/reports`;
      const qs = queryStr ? `?${queryStr}` : "";
      const [sum, pay, pr, ex, ca, acc, st] = await Promise.all([
        apiFetch<Summary>(`${base}/summary${qs}`, { token }),
        apiFetch<PaymentsRes>(`${base}/payments${qs}`, { token }),
        apiFetch<ProductsRes>(`${base}/products${qs}`, { token }),
        apiFetch<ExpensesRes>(`${base}/expenses${qs}`, { token }),
        apiFetch<CashiersRes>(`${base}/cashiers${qs}`, { token }),
        apiFetch<AccountsRes>(`${base}/accounts${qs}`, { token }),
        apiFetch<StockRes>(`${base}/stock${qs}`, { token }),
      ]);
      setSummary(sum);
      setPayments(pay);
      setProductsR(pr);
      setExpenses(ex);
      setCashiersR(ca);
      setAccounts(acc);
      setStock(st);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [token, queryStr]);

  useEffect(() => {
    void loadMeta().catch(() => {});
  }, [loadMeta]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const onExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      const qs = queryStr ? `?${queryStr}` : "";
      await apiDownloadBlob(`/admin/reports/export${qs}`, {
        token,
        filename: `report_${preset}.xlsx`,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };


  if (!token) return null;

  const cur = summary?.currency || "сомони";

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Отчёт</h1>
        <button
          type="button"
          onClick={() => setShowFilters((x) => !x)}
          className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-600"
        >
          {showFilters ? "Скрыть фильтры" : "Фильтры"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {(
          [
            ["today", "Сегодня"],
            ["yesterday", "Вчера"],
            ["week", "Неделя"],
            ["month", "Месяц"],
            ["custom", "Период"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(k)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              preset === k
                ? "bg-info text-white"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="flex flex-wrap gap-2">
          <label className="flex flex-1 min-w-[140px] flex-col text-xs text-slate-500">
            Дата от
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-0.5 rounded-xl border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-1 min-w-[140px] flex-col text-xs text-slate-500">
            Дата до
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="mt-0.5 rounded-xl border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
            />
          </label>
        </div>
      )}

      {showFilters && (
        <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <label className="text-xs text-slate-500">
            Кассир
            <select
              value={cashierId}
              onChange={(e) => setCashierId(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Все</option>
              {cashiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Способ оплаты (продажи)
            <select
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Все</option>
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
              <option value="transfer">Перевод</option>
              <option value="debt">Долг</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Категория расхода
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Все</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Способ оплаты расхода
            <select
              value={expensePaymentType}
              onChange={(e) => setExpensePaymentType(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Все</option>
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
              <option value="transfer">Перевод</option>
            </select>
          </label>
          <label className="text-xs text-slate-500">
            Товар (таблица товаров)
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">Все</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={exporting}
          onClick={() => void onExport()}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {exporting ? "Файл…" : "Скачать Excel"}
        </button>
        {summary && (
          <Link
            to={`/reports/detail?date=${encodeURIComponent(summary.period.end.slice(0, 10))}`}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium dark:border-slate-600"
          >
            Детальный отчёт дня ({summary.period.end.slice(0, 10)})
          </Link>
        )}
      </div>

      {err && <p className="text-sm text-red-600">{err}</p>}
      {loading && <p className="text-slate-500">Загрузка…</p>}

      {summary && !loading && (
        <>
          <p className="text-xs text-slate-500">
            Период: {summary.period.label} · {new Date(summary.period.start).toLocaleString()} —{" "}
            {new Date(summary.period.end).toLocaleString()}
          </p>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-income/30 bg-income-muted p-3 dark:bg-emerald-950/40">
              <div className="text-xs uppercase text-slate-600 dark:text-slate-400">Выручка</div>
              <div className="text-lg font-bold text-income">
                {formatFixed(summary.revenue, 0)} {cur}
              </div>
            </div>
            <div className="rounded-2xl border border-expense/30 bg-expense-muted p-3 dark:bg-red-950/40">
              <div className="text-xs uppercase text-slate-600">Расходы (касса)</div>
              <div className="text-lg font-bold text-expense">
                {formatFixed(summary.expenses, 0)} {cur}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs uppercase text-slate-500">Зарплата (выплачено)</div>
              <div className="text-lg font-bold">
                {formatFixed(summary.salary_paid, 0)} {cur}
              </div>
            </div>
            <div className="rounded-2xl border border-info/30 bg-info-muted p-3 dark:bg-blue-950/40">
              <div className="text-xs uppercase text-slate-600">Прибыль</div>
              <div className="text-lg font-bold">{formatFixed(summary.profit, 0)} {cur}</div>
              <div className="mt-1 text-[10px] text-slate-500">
                Выручка − расходы − зарплата
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs uppercase text-slate-500">Заказы</div>
              <div className="text-lg font-bold">{summary.order_count}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="text-xs uppercase text-slate-500">Средний чек</div>
              <div className="text-lg font-bold">
                {formatFixed(summary.avg_check, 2)} {cur}
              </div>
            </div>
            <div className="rounded-2xl border border-warn/30 bg-warn-muted p-3 dark:bg-amber-950/30">
              <div className="text-xs uppercase text-warn">Долги</div>
              <div className="text-lg font-bold text-warn">
                {formatFixed(summary.debt_sales_total, 0)} {cur}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="font-semibold text-slate-700 dark:text-slate-200">Чистые деньги</div>
            <div className="mt-1 text-slate-600 dark:text-slate-400">
              Наличные + карта + перевод:{" "}
              <span className="font-bold text-slate-900 dark:text-white">
                {formatFixed(summary.net_cash_card_transfer, 0)} {cur}
              </span>
            </div>
          </div>

          {payments && (
            <section>
              <h2 className="mb-2 font-semibold">По оплатам</h2>
              <ul className="space-y-1 rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                {Object.entries(payments.payments).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span>{PAYMENT_LABEL[k] || k}</span>
                    <span className="font-medium">
                      {formatFixed(v, 0)} {cur}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {productsR?.products?.length ? (
            <section>
              <h2 className="mb-2 font-semibold">Товары</h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[280px] text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2">Товар</th>
                      <th className="px-3 py-2">Кол-во</th>
                      <th className="px-3 py-2">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsR.products.map((r) => (
                      <tr key={r.product_name} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">{r.product_name}</td>
                        <td className="px-3 py-2">{r.qty}</td>
                        <td className="px-3 py-2">
                          {formatFixed(r.sum_total, 0)} {cur}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {expenses?.by_category?.length ? (
            <section>
              <h2 className="mb-2 font-semibold">Расходы по категориям</h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                <table className="w-full min-w-[280px] text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2">Категория</th>
                      <th className="px-3 py-2">Сумма</th>
                      <th className="px-3 py-2">Раз</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.by_category.map((r) => (
                      <tr key={r.category} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-2">{r.category}</td>
                        <td className="px-3 py-2">
                          {formatFixed(r.sum_amount, 0)} {cur}
                        </td>
                        <td className="px-3 py-2">{r.cnt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {cashiersR?.cashiers?.length ? (
            <section>
              <h2 className="mb-2 font-semibold">Кассиры</h2>
              <ul className="space-y-3">
                {cashiersR.cashiers.map((c) => (
                  <li
                    key={c.name}
                    className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="font-semibold">{c.name}</div>
                    <div className="mt-1 text-slate-600 dark:text-slate-400">
                      Заказы: {c.orders}
                    </div>
                    <div>
                      Продажи:{" "}
                      <span className="font-medium text-income">
                        {formatFixed(c.sales_sum, 0)} {cur}
                      </span>
                    </div>
                    <div>
                      Расходы:{" "}
                      <span className="font-medium text-expense">
                        {formatFixed(c.expenses_sum, 0)} {cur}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {accounts?.accounts?.length ? (
            <section>
              <h2 className="mb-2 font-semibold">Счета (движение за период)</h2>
              <ul className="space-y-3">
                {accounts.accounts.map((a) => (
                  <li
                    key={a.code}
                    className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="font-semibold">
                      {a.name}{" "}
                      <span className="text-xs font-normal text-slate-500">({a.code})</span>
                    </div>
                    <div className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-400">
                      <div>
                        + продажи: {formatFixed(a.period?.sales_in, 0)} {cur}
                      </div>
                      <div>
                        − расходы: {formatFixed(a.period?.expenses_out, 0)} {cur}
                      </div>
                      {safeNum(a.period?.transfer_in) + safeNum(a.period?.transfer_out) > 0 && (
                        <div>
                          Переводы: +{formatFixed(a.period?.transfer_in, 0)} / −{formatFixed(a.period?.transfer_out, 0)}
                        </div>
                      )}
                      <div className="font-medium text-slate-900 dark:text-white">
                        Изменение за период: {formatFixed(a.period?.net_change, 0)} {cur}
                      </div>
                      <div className="text-xs">Текущий баланс: {formatFixed(a.current_balance, 0)} {cur}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {stock?.packaging?.length ? (
            <section>
              <h2 className="mb-2 font-semibold">Склад упаковок</h2>
              <ul className="space-y-2 text-sm">
                {stock.packaging.map((p) => (
                  <li
                    key={p.name}
                    className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-slate-600 dark:text-slate-400">
                      Продано: {p.sold_qty} {p.unit}
                    </div>
                    <div>Остаток: {p.stock_qty} {p.unit}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
