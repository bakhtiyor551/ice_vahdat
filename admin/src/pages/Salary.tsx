import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";
import { ensureArray } from "../guards";

type SalaryRow = {
  cashier_id: number;
  name: string;
  work_days: number;
  daily_salary_rate: number;
  accrued: number;
  paid: number;
  balance: number;
  status: string;
};

type SalaryListRes = {
  currency: string;
  month: string;
  summary: {
    today: number;
    month_accrued: number;
    month_paid: number;
    month_remaining: number;
  };
  cashiers: SalaryRow[];
};

type AccountOpt = { id: number; name: string; code: string; balance: number };

const STATUS_LABEL: Record<string, string> = {
  none: "Нет начислений",
  unpaid: "Не оплачено",
  partial: "Частично оплачено",
  paid: "Оплачено",
};

function monthNow() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Salary() {
  const { token } = useAuth();
  const [month, setMonth] = useState(monthNow);
  const [filterCashier, setFilterCashier] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [data, setData] = useState<SalaryListRes | null>(null);
  const [accounts, setAccounts] = useState<AccountOpt[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payCashier, setPayCashier] = useState<number | "">("");
  const [payAmount, setPayAmount] = useState("");
  const [payAccount, setPayAccount] = useState<number | "">("");
  const [payComment, setPayComment] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMonthYm, setPayMonthYm] = useState(monthNow);
  const [payBusy, setPayBusy] = useState(false);
  const [cashierOptions, setCashierOptions] = useState<{ id: number; name: string }[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    const q = new URLSearchParams();
    q.set("month", month);
    if (filterCashier) q.set("cashier_id", filterCashier);
    if (filterStatus) q.set("status", filterStatus);
    const res = await apiFetch<SalaryListRes>(`/admin/salary?${q.toString()}`, { token });
    setData({
      ...res,
      cashiers: ensureArray(res?.cashiers),
    });
  }, [token, month, filterCashier, filterStatus]);

  useEffect(() => {
    if (!token) return;
    void load().catch((e) => setErr(String(e.message)));
  }, [token, load]);

  useEffect(() => {
    if (!token) return;
    void apiFetch<{ accounts: AccountOpt[] }>("/admin/accounts", { token })
      .then((r) => setAccounts(r.accounts || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void apiFetch<{ id: number; name: string }[]>("/admin/cashiers", { token })
      .then((rows) =>
        setCashierOptions(
          ensureArray<{ id: number; name: string }>(rows).map((c) => ({ id: c.id, name: c.name }))
        )
      )
      .catch(() => {});
  }, [token]);

  const submitPay = async () => {
    if (!token || payCashier === "" || payAccount === "") return;
    const amount = Number(payAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setErr("Укажите сумму");
      return;
    }
    setPayBusy(true);
    setErr(null);
    try {
      await apiFetch("/admin/salary/pay", {
        method: "POST",
        token,
        body: JSON.stringify({
          cashier_id: payCashier,
          amount,
          account_id: payAccount,
          comment: payComment,
          paid_at: payDate,
          month_ym: payMonthYm,
        }),
      });
      setPayOpen(false);
      setPayAmount("");
      setPayComment("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка выплаты");
    } finally {
      setPayBusy(false);
    }
  };

  if (!token) return null;

  const cur = data?.currency || "сомони";

  return (
    <div className="space-y-4 pb-6">
      <h1 className="text-xl font-bold">Зарплата</h1>
      {err && <p className="text-sm text-expense">{err}</p>}

      <div className="flex flex-wrap gap-2">
        <label className="text-xs text-slate-500">
          Месяц
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="mt-0.5 block rounded-xl border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
        </label>
        <label className="text-xs text-slate-500">
          Кассир
          <select
            value={filterCashier}
            onChange={(e) => setFilterCashier(e.target.value)}
            className="mt-0.5 block min-w-[140px] rounded-xl border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Все</option>
            {cashierOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Статус
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="mt-0.5 block rounded-xl border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">Все</option>
            <option value="unpaid">Не оплачено</option>
            <option value="partial">Частично</option>
            <option value="paid">Оплачено</option>
            <option value="none">Без начислений</option>
          </select>
        </label>
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="text-xs text-slate-500">За сегодня</div>
            <div className="text-lg font-bold">{formatFixed(data.summary.today, 0)} {cur}</div>
          </div>
          <div className="rounded-2xl border border-income/30 bg-income-muted p-3 dark:bg-emerald-950/40">
            <div className="text-xs text-slate-600">За месяц (начислено)</div>
            <div className="text-lg font-bold text-income">{formatFixed(data.summary.month_accrued, 0)} {cur}</div>
          </div>
          <div className="rounded-2xl border border-info/30 bg-info-muted p-3 dark:bg-blue-950/40">
            <div className="text-xs text-slate-600">Оплачено</div>
            <div className="text-lg font-bold">{formatFixed(data.summary.month_paid, 0)} {cur}</div>
          </div>
          <div className="rounded-2xl border border-warn/30 bg-warn-muted p-3 dark:bg-amber-950/30">
            <div className="text-xs text-warn">Осталось</div>
            <div className="text-lg font-bold text-warn">{formatFixed(data.summary.month_remaining, 0)} {cur}</div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setPayMonthYm(month);
          setPayOpen(true);
        }}
        className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white dark:bg-slate-100 dark:text-slate-900"
      >
        Выплатить зарплату
      </button>

      {payOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900">
            <h2 className="mb-3 font-semibold">Выплата зарплаты</h2>
            <div className="space-y-2 text-sm">
              <label className="block text-xs text-slate-500">
                Кассир
                <select
                  value={payCashier === "" ? "" : payCashier}
                  onChange={(e) => setPayCashier(e.target.value ? Number(e.target.value) : "")}
                  className="mt-0.5 w-full rounded-xl border px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="">—</option>
                  {cashierOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-500">
                Сумма ({cur})
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-0.5 w-full rounded-xl border px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Списать из счёта
                <select
                  value={payAccount === "" ? "" : payAccount}
                  onChange={(e) => setPayAccount(e.target.value ? Number(e.target.value) : "")}
                  className="mt-0.5 w-full rounded-xl border px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatFixed(a.balance, 0)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-slate-500">
                Месяц начисления (за какой месяц зачесть оплату)
                <input
                  type="month"
                  value={payMonthYm}
                  onChange={(e) => setPayMonthYm(e.target.value)}
                  className="mt-0.5 w-full rounded-xl border px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Дата операции
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="mt-0.5 w-full rounded-xl border px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
              <label className="block text-xs text-slate-500">
                Комментарий
                <input
                  value={payComment}
                  onChange={(e) => setPayComment(e.target.value)}
                  placeholder="напр. часть зарплаты"
                  className="mt-0.5 w-full rounded-xl border px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={payBusy}
                onClick={() => void submitPay()}
                className="flex-1 rounded-xl bg-income py-2 font-semibold text-white disabled:opacity-50"
              >
                {payBusy ? "…" : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={() => setPayOpen(false)}
                className="rounded-xl bg-slate-200 px-4 dark:bg-slate-700"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs dark:bg-slate-800">
              <tr>
                <th className="px-2 py-2">Кассир</th>
                <th className="px-2 py-2">Дни</th>
                <th className="px-2 py-2">Ставка</th>
                <th className="px-2 py-2">Начислено</th>
                <th className="px-2 py-2">Оплачено</th>
                <th className="px-2 py-2">Остаток</th>
                <th className="px-2 py-2">Статус</th>
              </tr>
            </thead>
            <tbody>
              {data.cashiers.map((c) => (
                <tr key={c.cashier_id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-2">
                    <Link to={`/salary/${c.cashier_id}?month=${encodeURIComponent(month)}`} className="font-medium text-info underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{c.work_days}</td>
                  <td className="px-2 py-2">{c.daily_salary_rate}</td>
                  <td className="px-2 py-2">{formatFixed(c.accrued, 0)}</td>
                  <td className="px-2 py-2">{formatFixed(c.paid, 0)}</td>
                  <td className="px-2 py-2">{formatFixed(c.balance, 0)}</td>
                  <td className="px-2 py-2 text-xs">{STATUS_LABEL[c.status] || c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
