import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";

type PayRow = {
  id: string;
  amount: number;
  comment: string | null;
  paid_by: string | null;
  month_ym: string;
  paid_at: string;
  account_name: string;
};

type DetailRes = {
  currency: string;
  month: string;
  cashier: { id: number; name: string; daily_salary_rate: number };
  work_mode: "auto" | "manual";
  work_days: number;
  work_dates: string[];
  work_dates_auto: string[];
  work_dates_manual: string[];
  accrued: number;
  paid: number;
  balance: number;
  status: string;
  payments: PayRow[];
};

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

function parseYm(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return { y, m };
}

function daysInCalendarMonth(ym: string) {
  const { y, m } = parseYm(ym);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return 31;
  return new Date(y, m, 0).getDate();
}

function dateStr(ym: string, day: number) {
  const { y, m } = parseYm(ym);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function SalaryDetail() {
  const { token } = useAuth();
  const { cashierId } = useParams();
  const [search] = useSearchParams();
  const monthParam = search.get("month") || monthNow();
  const [data, setData] = useState<DetailRes | null>(null);
  const [month, setMonth] = useState(monthParam);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Локальный режим редактирования: показываем чекбоксы */
  const [editManual, setEditManual] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    if (!token || !cashierId) return;
    setErr(null);
    const d = await apiFetch<DetailRes>(
      `/admin/salary/${cashierId}?month=${encodeURIComponent(month)}`,
      { token }
    );
    setData(d);
    setEditManual(false);
    setPicked(new Set());
  }, [token, cashierId, month]);

  useEffect(() => {
    setMonth(monthParam);
  }, [monthParam]);

  useEffect(() => {
    if (!token || !cashierId) return;
    void load().catch((e) => {
      setErr(e instanceof Error ? e.message : "Ошибка");
      setData(null);
    });
  }, [token, cashierId, month, load]);

  const lastDay = useMemo(() => daysInCalendarMonth(month), [month]);

  const toggleDay = (day: number) => {
    const key = dateStr(month, day);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveManual = async () => {
    if (!token || !cashierId) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch(`/admin/salary/${cashierId}/work-calendar`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          month,
          mode: "manual",
          dates: Array.from(picked).sort(),
        }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  const setAutoMode = async () => {
    if (!token || !cashierId) return;
    setSaving(true);
    setErr(null);
    try {
      await apiFetch(`/admin/salary/${cashierId}/work-calendar`, {
        method: "PUT",
        token,
        body: JSON.stringify({ month, mode: "auto", dates: [] }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const startManualFromAuto = () => {
    if (!data) return;
    setEditManual(true);
    setPicked(new Set(data.work_dates_auto));
  };

  if (!token) return null;

  const cur = data?.currency || "сомони";

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">{data?.cashier.name || "Кассир"}</h1>
        <Link to="/salary" className="text-sm text-info underline">
          ← Зарплата
        </Link>
      </div>

      <label className="block text-xs text-slate-500">
        Месяц
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="mt-0.5 block rounded-xl border border-slate-200 px-2 py-2 dark:border-slate-600 dark:bg-slate-800"
        />
      </label>

      {err && <p className="text-sm text-expense">{err}</p>}

      {data && (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
            <div>
              Ставка за день:{" "}
              <span className="font-semibold">
                {data.cashier.daily_salary_rate} {cur}
              </span>
            </div>
            <div className="mt-1">
              Режим:{" "}
              <span className="font-semibold">
                {data.work_mode === "manual" ? "Выбранные дни" : "Авто (продажи и расходы)"}
              </span>
            </div>
            <div className="mt-1">
              Рабочих дней: <span className="font-semibold">{data.work_days}</span>
            </div>
            <div className="mt-1">
              Начислено:{" "}
              <span className="font-semibold text-income">
                {data.accrued.toFixed(0)} {cur}
              </span>
            </div>
            <div>Оплачено: <span className="font-semibold">{data.paid.toFixed(0)} {cur}</span></div>
            <div>
              Остаток:{" "}
              <span className="font-semibold text-warn">{data.balance.toFixed(0)} {cur}</span>
            </div>
            <div className="mt-2 text-xs text-slate-500">
              Статус: {STATUS_LABEL[data.status] || data.status}
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-2 font-semibold">Рабочие дни месяца</h2>
            <p className="mb-3 text-xs text-slate-500">
              Авто: день считается рабочим, если была продажа или расход. Вручную: отметьте только те дни, когда
              кассир работал.
            </p>

            {!editManual && data.work_mode === "auto" && (
              <div className="mb-3 space-y-2">
                <div className="flex flex-wrap gap-1 text-xs">
                  {data.work_dates_auto.length === 0 ? (
                    <span className="text-slate-500">Нет дней по кассе</span>
                  ) : (
                    data.work_dates_auto.map((d) => (
                      <span key={d} className="rounded-lg bg-emerald-100 px-2 py-1 dark:bg-emerald-950/50">
                        {d.split("-").reverse().join(".")}
                      </span>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void startManualFromAuto()}
                    className="rounded-xl bg-info px-3 py-2 text-sm font-medium text-white"
                  >
                    Выбрать дни вручную
                  </button>
                </div>
              </div>
            )}

            {!editManual && data.work_mode === "manual" && (
              <div className="mb-3">
                <ul className="mb-2 flex flex-wrap gap-1 text-xs">
                  {data.work_dates_manual.length === 0 ? (
                    <li className="text-slate-500">Дни не выбраны</li>
                  ) : (
                    data.work_dates_manual.map((d) => (
                      <li key={d} className="rounded-lg bg-amber-100 px-2 py-1 dark:bg-amber-950/40">
                        {d.split("-").reverse().join(".")}
                      </li>
                    ))
                  )}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setEditManual(true);
                    setPicked(new Set(data.work_dates_manual));
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-600"
                >
                  Изменить дни
                </button>
              </div>
            )}

            {editManual && (
              <>
                <div className="mb-3 grid grid-cols-7 gap-1 text-center text-[10px] text-slate-500">
                  <span>Пн</span>
                  <span>Вт</span>
                  <span>Ср</span>
                  <span>Чт</span>
                  <span>Пт</span>
                  <span>Сб</span>
                  <span>Вс</span>
                </div>
                <div className="mb-3 grid grid-cols-7 gap-1">
                  {Array.from({ length: lastDay }, (_, i) => i + 1).map((day) => {
                    const ds = dateStr(month, day);
                    const on = picked.has(ds);
                    const { y, m } = parseYm(month);
                    const dow = new Date(y, m - 1, day).getDay();
                    const mondayFirst = (dow + 6) % 7;
                    return (
                      <button
                        key={day}
                        type="button"
                        title={ds}
                        onClick={() => toggleDay(day)}
                        style={{
                          gridColumnStart: day === 1 ? mondayFirst + 1 : undefined,
                        }}
                        className={`flex min-h-[2.25rem] items-center justify-center rounded-lg border text-sm font-medium ${
                          on
                            ? "border-income bg-income-muted text-income dark:bg-emerald-950/40"
                            : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800"
                        }`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
                <p className="mb-2 text-xs text-slate-500">Выбрано дней: {picked.size}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void saveManual()}
                    className="rounded-xl bg-income px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saving ? "…" : "Сохранить выбранные дни"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void setAutoMode()}
                    className="rounded-xl bg-slate-200 px-4 py-2 text-sm dark:bg-slate-700"
                  >
                    Снова авто по кассе
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditManual(false);
                      if (data.work_mode === "manual") {
                        setPicked(new Set(data.work_dates_manual));
                      } else {
                        setPicked(new Set(data.work_dates_auto));
                      }
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm dark:border-slate-600"
                  >
                    Отмена
                  </button>
                </div>
              </>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Итоговые рабочие даты (начисление)</h2>
            <ul className="flex flex-wrap gap-1 text-xs">
              {data.work_dates.length === 0 ? (
                <li className="text-slate-500">Нет</li>
              ) : (
                data.work_dates.map((d) => (
                  <li key={d} className="rounded-lg bg-slate-100 px-2 py-1 dark:bg-slate-800">
                    {d.split("-").reverse().join(".")}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">История выплат</h2>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[480px] text-left text-sm">
                <thead className="bg-slate-50 text-xs dark:bg-slate-800">
                  <tr>
                    <th className="px-2 py-2">Дата</th>
                    <th className="px-2 py-2">Сумма</th>
                    <th className="px-2 py-2">Счёт</th>
                    <th className="px-2 py-2">Комментарий</th>
                    <th className="px-2 py-2">Кто оплатил</th>
                  </tr>
                </thead>
                <tbody>
                  {data.payments.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="whitespace-nowrap px-2 py-2">{new Date(p.paid_at).toLocaleString()}</td>
                      <td className="px-2 py-2">{p.amount.toFixed(0)}</td>
                      <td className="px-2 py-2">{p.account_name}</td>
                      <td className="px-2 py-2">{p.comment || "—"}</td>
                      <td className="px-2 py-2 text-xs">{p.paid_by || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.payments.length === 0 && <p className="text-sm text-slate-500">Выплат пока нет</p>}
          </section>
        </>
      )}
    </div>
  );
}
