import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";
import { ensureArray } from "../guards";

type TxRow = {
  id: string;
  kind: string;
  amount: number;
  direction: string;
  comment: string | null;
  created_at: string;
  cashier_name: string | null;
};

const KIND_RU: Record<string, string> = {
  sale: "Продажа",
  expense: "Расход",
  transfer_in: "Перевод (вход)",
  transfer_out: "Перевод (выход)",
  manual_income: "Ручное пополнение",
  manual_outcome: "Ручное списание",
  debt_payment: "Оплата долга",
  correction: "Корректировка",
};

function rowColorClass(kind: string, direction: string): string {
  if (kind === "correction") return "text-slate-500";
  if (kind.includes("transfer")) return "text-info dark:text-blue-400";
  if (kind === "debt_payment") return "text-amber-600 dark:text-amber-400";
  if (direction === "in") return "text-income";
  return "text-expense";
}

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [accName, setAccName] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [outAmount, setOutAmount] = useState("");
  const [outComment, setOutComment] = useState("");

  useEffect(() => {
    if (!token || !id) return;
    void (async () => {
      try {
        const list = await apiFetch<{
          accounts: { id: number; name: string; balance: number }[];
        }>("/admin/accounts", { token });
        const me = list.accounts.find((a) => a.id === Number(id));
        setAccName(me?.name ?? `Счёт #${id}`);
        setBalance(me?.balance ?? null);

        const tx = await apiFetch<TxRow[]>(`/admin/accounts/${id}/transactions`, { token });
        setRows(ensureArray(tx));
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Ошибка");
      }
    })();
  }, [token, id]);

  const manualOut = async () => {
    if (!token || !id) return;
    setErr(null);
    try {
      await apiFetch("/admin/accounts/manual-outcome", {
        method: "POST",
        token,
        body: JSON.stringify({
          account_id: Number(id),
          amount: Number(String(outAmount).replace(",", ".")),
          comment: outComment.trim() || undefined,
        }),
      });
      setOutAmount("");
      setOutComment("");
      const list = await apiFetch<{ accounts: { id: number; balance: number }[] }>("/admin/accounts", { token });
      const me = list.accounts.find((a) => a.id === Number(id));
      setBalance(me?.balance ?? null);
      const tx = await apiFetch<TxRow[]>(`/admin/accounts/${id}/transactions`, { token });
      setRows(ensureArray(tx));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (!token) return null;

  return (
    <div className="space-y-4">
      <Link to="/accounts" className="text-sm text-info">
        ← Все счета
      </Link>
      <h1 className="text-xl font-bold">{accName}</h1>
      {balance != null && (
        <p className="text-lg font-semibold text-income">
          Текущий баланс: {formatFixed(balance, 2)} сомони
        </p>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">Ручное списание с этого счёта</h2>
        <div className="grid gap-2">
          <input
            placeholder="Сумма"
            value={outAmount}
            onChange={(e) => setOutAmount(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Комментарий"
            value={outComment}
            onChange={(e) => setOutComment(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={() => void manualOut()}
            className="rounded-xl bg-expense py-2 font-semibold text-white"
          >
            Списать
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-expense">{err}</p>}

      <div>
        <h2 className="mb-2 text-sm font-semibold">История</h2>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-2">Дата</th>
                <th className="px-2 py-2">Тип</th>
                <th className="px-2 py-2">Сумма</th>
                <th className="px-2 py-2">Комментарий</th>
                <th className="px-2 py-2">Кто</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 dark:border-slate-700">
                  <td className="whitespace-nowrap px-2 py-2 text-slate-600 dark:text-slate-400">
                    {new Date(t.created_at).toLocaleString("ru-RU")}
                  </td>
                  <td className="px-2 py-2">{KIND_RU[t.kind] ?? t.kind}</td>
                  <td className={`px-2 py-2 font-medium ${rowColorClass(t.kind, t.direction)}`}>
                    {t.direction === "in" ? "+" : "−"}
                    {formatFixed(t.amount, 2)}
                  </td>
                  <td className="max-w-[200px] truncate px-2 py-2 text-slate-600" title={t.comment ?? ""}>
                    {t.comment ?? "—"}
                  </td>
                  <td className="px-2 py-2 text-slate-500">{t.cashier_name ?? "Админ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="p-4 text-center text-slate-500">Пока нет операций</p>}
        </div>
      </div>
    </div>
  );
}
