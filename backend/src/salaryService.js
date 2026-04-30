import { db } from "./db.js";
import { dayBoundsISO } from "./reportsService.js";

export function currentMonthYm() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function parseMonthYm(ym) {
  if (!ym || !/^\d{4}-\d{2}$/.test(String(ym))) return null;
  const [ys, ms] = String(ym).split("-");
  const y = Number(ys);
  const mo = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || mo < 1 || mo > 12) return null;
  return { y, m: mo };
}

/** Границы календарного месяца в ISO (локальная полуночь/конец дня через Date). */
export function monthRangeISO(ym) {
  const p = parseMonthYm(ym);
  if (!p) return null;
  const start = new Date(p.y, p.m - 1, 1, 0, 0, 0, 0);
  const end = new Date(p.y, p.m, 0, 23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString(), ym: `${p.y}-${String(p.m).padStart(2, "0")}` };
}

export function getSalaryWorkMode(cashierId, monthYm) {
  const r = db
    .prepare(`SELECT mode FROM cashier_salary_month_mode WHERE cashier_id = ? AND month_ym = ?`)
    .get(cashierId, monthYm);
  return r?.mode === "manual" ? "manual" : "auto";
}

/**
 * Авто: уникальные дни с продажей или расходом.
 */
export function listWorkDatesAuto(cashierId, startISO, endISO) {
  const rows = db
    .prepare(
      `SELECT d FROM (
         SELECT date(created_at, 'localtime') AS d FROM sales
         WHERE cashier_id = ? AND created_at >= ? AND created_at <= ?
         UNION
         SELECT date(created_at, 'localtime') AS d FROM expenses
         WHERE cashier_id = ? AND created_at >= ? AND created_at <= ?
       ) ORDER BY d`
    )
    .all(cashierId, startISO, endISO, cashierId, startISO, endISO);
  return rows.map((r) => r.d).filter(Boolean);
}

export function countWorkDaysAuto(cashierId, startISO, endISO) {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM (
         SELECT date(created_at, 'localtime') AS d FROM sales
         WHERE cashier_id = ? AND created_at >= ? AND created_at <= ?
         UNION
         SELECT date(created_at, 'localtime') AS d FROM expenses
         WHERE cashier_id = ? AND created_at >= ? AND created_at <= ?
       )`
    )
    .get(cashierId, startISO, endISO, cashierId, startISO, endISO);
  return row?.n ?? 0;
}

export function listManualWorkDates(cashierId, monthYm) {
  const rows = db
    .prepare(
      `SELECT work_date FROM cashier_salary_work_days WHERE cashier_id = ? AND month_ym = ? ORDER BY work_date`
    )
    .all(cashierId, monthYm);
  return rows.map((r) => r.work_date).filter(Boolean);
}

/** Локальная дата YYYY-MM-DD */
export function localDateString(isoDate = new Date()) {
  const d = typeof isoDate === "string" ? new Date(isoDate) : isoDate;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Рабочие дни за интервал: при mode=manual для monthYm — только выбранные дни;
 * иначе авто по кассе. Для расчёта без месяца (например только «сегодня») передайте monthYm=null — всегда авто.
 */
export function countWorkDays(cashierId, startISO, endISO, monthYm = null) {
  if (monthYm && getSalaryWorkMode(cashierId, monthYm) === "manual") {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM cashier_salary_work_days WHERE cashier_id = ? AND month_ym = ?`)
      .get(cashierId, monthYm);
    return row?.n ?? 0;
  }
  return countWorkDaysAuto(cashierId, startISO, endISO);
}

export function listWorkDates(cashierId, startISO, endISO, monthYm = null) {
  if (monthYm && getSalaryWorkMode(cashierId, monthYm) === "manual") {
    return listManualWorkDates(cashierId, monthYm);
  }
  return listWorkDatesAuto(cashierId, startISO, endISO);
}

export function paidForMonth(cashierId, monthYm) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS v FROM salary_payments WHERE cashier_id = ? AND month_ym = ?`
    )
    .get(cashierId, monthYm);
  return row?.v ?? 0;
}

export function salaryStatus(accrued, paid) {
  if (accrued <= 0) return "none";
  if (paid <= 0) return "unpaid";
  if (paid + 0.005 < accrued) return "partial";
  return "paid";
}

export function todaySalaryTotal() {
  const { start, end } = dayBoundsISO(null);
  const todayStr = localDateString();
  const ym = currentMonthYm();

  const cashiers = db
    .prepare(`SELECT id, COALESCE(daily_salary_rate, 45) AS rate FROM cashiers WHERE COALESCE(is_active,1) = 1`)
    .all();

  let sum = 0;
  for (const c of cashiers) {
    if (getSalaryWorkMode(c.id, ym) === "manual") {
      const hit = db
        .prepare(
          `SELECT 1 FROM cashier_salary_work_days WHERE cashier_id = ? AND month_ym = ? AND work_date = ?`
        )
        .get(c.id, ym, todayStr);
      if (hit) sum += c.rate;
    } else {
      const wd = countWorkDaysAuto(c.id, start, end);
      if (wd > 0) sum += wd * c.rate;
    }
  }
  return sum;
}
