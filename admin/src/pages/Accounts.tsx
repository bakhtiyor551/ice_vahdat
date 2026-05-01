import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ensureArray } from "../guards";

type AccountRow = {
  id: number;
  name: string;
  code: string;
  type: string;
  balance: number;
  is_active: number;
  sort_order: number;
};

type AccRes = {
  currency: string;
  total_real_balance: number;
  debt_balance: number;
  accounts: AccountRow[];
};

export default function Accounts() {
  const { token } = useAuth();
  const [data, setData] = useState<AccRes | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [fromId, setFromId] = useState<number | "">("");
  const [toId, setToId] = useState<number | "">("");
  const [trAmount, setTrAmount] = useState("");
  const [trComment, setTrComment] = useState("");

  const [debtAmount, setDebtAmount] = useState("");
  const [debtClient, setDebtClient] = useState("");
  const [debtTarget, setDebtTarget] = useState<"cash" | "card" | "transfer">("cash");

  const [manAccount, setManAccount] = useState<number | "">("");
  const [manAmount, setManAmount] = useState("");
  const [manComment, setManComment] = useState("");

  const load = async () => {
    if (!token) return;
    const res = await apiFetch<AccRes>("/admin/accounts", { token });
    setData({
      currency: res.currency ?? "сомони",
      total_real_balance: res.total_real_balance ?? 0,
      debt_balance: res.debt_balance ?? 0,
      accounts: ensureArray(res?.accounts),
    });
  };

  useEffect(() => {
    if (!token) return;
    void load().catch((e) => setErr(String(e.message)));
  }, [token]);

  const transfer = async () => {
    if (!token || fromId === "" || toId === "") return;
    setErr(null);
    try {
      await apiFetch("/admin/accounts/transfer", {
        method: "POST",
        token,
        body: JSON.stringify({
          from_account_id: Number(fromId),
          to_account_id: Number(toId),
          amount: Number(String(trAmount).replace(",", ".")),
          comment: trComment.trim() || undefined,
        }),
      });
      setTrAmount("");
      setTrComment("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const debtPay = async () => {
    if (!token) return;
    setErr(null);
    try {
      await apiFetch("/admin/accounts/debt-payment", {
        method: "POST",
        token,
        body: JSON.stringify({
          amount: Number(String(debtAmount).replace(",", ".")),
          client_comment: debtClient.trim(),
          target_code: debtTarget,
        }),
      });
      setDebtAmount("");
      setDebtClient("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const manualIn = async () => {
    if (!token || manAccount === "") return;
    setErr(null);
    try {
      await apiFetch("/admin/accounts/manual-income", {
        method: "POST",
        token,
        body: JSON.stringify({
          account_id: Number(manAccount),
          amount: Number(String(manAmount).replace(",", ".")),
          comment: manComment.trim() || undefined,
        }),
      });
      setManAmount("");
      setManComment("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (!token) return null;
  if (!data) return <p className="text-slate-500">Загрузка…</p>;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Счета</h1>
      <p className="text-sm text-slate-500">
        Внутренний учёт: откуда пришли деньги, куда ушли, остаток по счетам. Это не банк — только ваши операции в системе.
      </p>

      {err && <p className="text-sm text-expense">{err}</p>}

      <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">Сводка</div>
        <div className="flex flex-wrap gap-4 text-sm">
          <div>
            <span className="text-slate-500">Операционный баланс</span>
            <div className="text-lg font-bold text-income">{Number(data?.total_real_balance ?? 0).toFixed(2)} {data.currency}</div>
            <span className="text-xs text-slate-400">все счета, кроме «Долги клиентов»</span>
          </div>
          <div>
            <span className="text-slate-500">Долги клиентов</span>
            <div className="text-lg font-bold text-amber-600 dark:text-amber-400">
              {Number(data?.debt_balance ?? 0).toFixed(2)} {data.currency}
            </div>
            <span className="text-xs text-slate-400">ещё не реальные деньги</span>
          </div>
        </div>
      </div>

      <ul className="space-y-2">
        {data.accounts.map((a) => (
          <li key={a.id}>
            <Link
              to={`/accounts/${a.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="font-semibold">{a.name}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{a.code}</div>
              <div
                className={`mt-2 text-xl font-bold ${
                  a.code === "debt" ? "text-amber-600 dark:text-amber-400" : "text-income"
                }`}
              >
                Баланс: {Number(a?.balance ?? 0).toFixed(2)} {data.currency}
              </div>
              <div className="mt-1 text-xs text-info">История →</div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">Перевод между счетами</h2>
        <div className="grid gap-2">
          <select
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            value={fromId}
            onChange={(e) => setFromId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Из счёта…</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            value={toId}
            onChange={(e) => setToId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">В счёт…</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Сумма"
            value={trAmount}
            onChange={(e) => setTrAmount(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Комментарий"
            value={trComment}
            onChange={(e) => setTrComment(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={() => void transfer()}
            className="rounded-xl bg-info py-2 font-semibold text-white dark:bg-blue-700"
          >
            Перевести
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">Оплата долга клиентом</h2>
        <p className="mb-2 text-xs text-slate-500">Уменьшает «Долги клиентов», зачисляет на выбранный счёт.</p>
        <div className="grid gap-2">
          <input
            placeholder="Клиент / комментарий"
            value={debtClient}
            onChange={(e) => setDebtClient(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Сумма"
            value={debtAmount}
            onChange={(e) => setDebtAmount(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <select
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            value={debtTarget}
            onChange={(e) => setDebtTarget(e.target.value as "cash" | "card" | "transfer")}
          >
            <option value="cash">Наличная касса</option>
            <option value="card">Карта</option>
            <option value="transfer">Перевод</option>
          </select>
          <button
            type="button"
            onClick={() => void debtPay()}
            className="rounded-xl bg-amber-600 py-2 font-semibold text-white"
          >
            Зафиксировать оплату долга
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">Ручное пополнение счёта</h2>
        <div className="grid gap-2">
          <select
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            value={manAccount}
            onChange={(e) => setManAccount(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Счёт…</option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Сумма"
            value={manAmount}
            onChange={(e) => setManAmount(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Комментарий"
            value={manComment}
            onChange={(e) => setManComment(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={() => void manualIn()}
            className="rounded-xl bg-income py-2 font-semibold text-white"
          >
            Пополнить
          </button>
        </div>
      </div>
    </div>
  );
}
