import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { recordSalaryPaymentInLedger } from "../ledger.js";
import {
  countWorkDays,
  currentMonthYm,
  getSalaryWorkMode,
  listWorkDates,
  listWorkDatesAuto,
  listManualWorkDates,
  monthRangeISO,
  paidForMonth,
  parseMonthYm,
  salaryStatus,
  todaySalaryTotal,
} from "../salaryService.js";

function adminLabel(req) {
  const a = req.admin;
  if (!a) return "Админ";
  return String(a.name || a.sub || a.username || "Админ");
}

function localDateStrFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function registerSalaryRoutes(router) {
  /** GET /salary — сводка и таблица по месяцу */
  router.get("/salary", (req, res) => {
    try {
      const monthYm = req.query.month ? String(req.query.month) : currentMonthYm();
      if (!parseMonthYm(monthYm)) {
        return res.status(400).json({ error: "Некорректный month (ожидается YYYY-MM)" });
      }
      const range = monthRangeISO(monthYm);
      if (!range) return res.status(400).json({ error: "Некорректный месяц" });

      const filterCashier =
        req.query.cashier_id != null && req.query.cashier_id !== ""
          ? Number(req.query.cashier_id)
          : null;
      const statusFilter = req.query.status ? String(req.query.status) : null;

      const cashiers = db
        .prepare(
          `SELECT id, name, COALESCE(daily_salary_rate, 45) AS daily_salary_rate
           FROM cashiers
           WHERE COALESCE(is_active, 1) = 1
           ORDER BY id`
        )
        .all();

      let monthAccrued = 0;
      let monthPaid = 0;
      let monthRemaining = 0;

      const rows = [];

      for (const c of cashiers) {
        if (filterCashier != null && Number.isFinite(filterCashier) && c.id !== filterCashier) continue;

        const workDays = countWorkDays(c.id, range.start, range.end, monthYm);
        const accrued = workDays * c.daily_salary_rate;
        const paid = paidForMonth(c.id, monthYm);
        const balance = accrued - paid;
        const status = salaryStatus(accrued, paid);

        if (statusFilter) {
          if (statusFilter === "unpaid" && status !== "unpaid") continue;
          if (statusFilter === "partial" && status !== "partial") continue;
          if (statusFilter === "paid" && status !== "paid") continue;
          if (statusFilter === "none" && status !== "none") continue;
        }

        monthAccrued += accrued;
        monthPaid += paid;
        monthRemaining += balance;

        rows.push({
          cashier_id: c.id,
          name: c.name,
          work_days: workDays,
          daily_salary_rate: c.daily_salary_rate,
          accrued,
          paid,
          balance,
          status,
        });
      }

      res.json({
        currency: "сомони",
        month: monthYm,
        summary: {
          today: todaySalaryTotal(),
          month_accrued: Math.round(monthAccrued * 100) / 100,
          month_paid: Math.round(monthPaid * 100) / 100,
          month_remaining: Math.round(monthRemaining * 100) / 100,
        },
        cashiers: rows,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  /** GET /salary/payments */
  router.get("/salary/payments", (req, res) => {
    try {
      const monthYm = req.query.month ? String(req.query.month) : null;
      const cid =
        req.query.cashier_id != null && req.query.cashier_id !== "" ? Number(req.query.cashier_id) : null;

      let sql = `
        SELECT sp.id, sp.cashier_id, sp.amount, sp.account_id, sp.comment, sp.paid_by, sp.month_ym, sp.paid_at, sp.created_at,
               c.name AS cashier_name, a.name AS account_name
        FROM salary_payments sp
        JOIN cashiers c ON c.id = sp.cashier_id
        JOIN accounts a ON a.id = sp.account_id
        WHERE 1=1`;
      const params = [];
      if (monthYm) {
        sql += ` AND sp.month_ym = ?`;
        params.push(monthYm);
      }
      if (cid != null && Number.isFinite(cid)) {
        sql += ` AND sp.cashier_id = ?`;
        params.push(cid);
      }
      sql += ` ORDER BY sp.paid_at DESC, sp.created_at DESC`;
      const rows = db.prepare(sql).all(...params);
      res.json({ payments: rows, currency: "сомони" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  /** POST /salary/pay */
  router.post("/salary/pay", (req, res) => {
    try {
      const cashierId = Number(req.body?.cashier_id);
      const amount = Number(req.body?.amount);
      const accountId = Number(req.body?.account_id);
      const comment = req.body?.comment != null ? String(req.body.comment).trim() : "";
      const monthYm = req.body?.month_ym ? String(req.body.month_ym) : currentMonthYm();
      let paidAt = req.body?.paid_at ? String(req.body.paid_at) : new Date().toISOString();

      if (!Number.isFinite(cashierId) || cashierId <= 0) {
        return res.status(400).json({ error: "Некорректный кассир" });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: "Некорректная сумма" });
      }
      if (!Number.isFinite(accountId) || accountId <= 0) {
        return res.status(400).json({ error: "Некорректный счёт" });
      }
      if (!parseMonthYm(monthYm)) {
        return res.status(400).json({ error: "Некорректный month_ym" });
      }

      const acc = db.prepare(`SELECT id, balance FROM accounts WHERE id = ? AND is_active = 1`).get(accountId);
      if (!acc) return res.status(404).json({ error: "Счёт не найден" });
      if (acc.balance + 1e-9 < amount) {
        return res.status(400).json({ error: "Недостаточно средств на счёте" });
      }

      const ch = db.prepare(`SELECT id, name FROM cashiers WHERE id = ?`).get(cashierId);
      if (!ch) return res.status(404).json({ error: "Кассир не найден" });

      if (/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
        paidAt = new Date(paidAt + "T12:00:00").toISOString();
      }

      const id = uuidv4();
      const paidBy = adminLabel(req);

      db.transaction(() => {
        db.prepare(
          `INSERT INTO salary_payments (id, cashier_id, amount, account_id, comment, paid_by, month_ym, paid_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).run(id, cashierId, amount, accountId, comment || null, paidBy, monthYm, paidAt);

        recordSalaryPaymentInLedger({
          accountId,
          amount,
          salaryPaymentId: id,
          cashierName: ch.name,
          comment: comment || undefined,
          createdAt: paidAt,
        });
      })();

      const row = db
        .prepare(
          `SELECT sp.*, c.name AS cashier_name, a.name AS account_name
           FROM salary_payments sp
           JOIN cashiers c ON c.id = sp.cashier_id
           JOIN accounts a ON a.id = sp.account_id
           WHERE sp.id = ?`
        )
        .get(id);

      res.status(201).json(row);
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  /** PUT /salary/:cashierId/work-calendar — выбор рабочих дней месяца */
  router.put("/salary/:cashierId/work-calendar", (req, res) => {
    try {
      const cashierId = Number(req.params.cashierId);
      if (!Number.isFinite(cashierId) || cashierId <= 0) {
        return res.status(400).json({ error: "Некорректный id" });
      }

      const ch = db.prepare(`SELECT id FROM cashiers WHERE id = ?`).get(cashierId);
      if (!ch) return res.status(404).json({ error: "Кассир не найден" });

      const monthYm = req.body?.month != null ? String(req.body.month) : "";
      const mode = String(req.body?.mode || "auto").toLowerCase();
      const dates = Array.isArray(req.body?.dates) ? req.body.dates.map(String) : [];

      if (!parseMonthYm(monthYm)) {
        return res.status(400).json({ error: "Некорректный month (YYYY-MM)" });
      }
      if (mode !== "auto" && mode !== "manual") {
        return res.status(400).json({ error: "mode: auto или manual" });
      }

      const p = parseMonthYm(monthYm);
      if (!p) return res.status(400).json({ error: "Некорректный месяц" });
      const monthStartStr = `${monthYm}-01`;
      const lastDay = new Date(p.y, p.m, 0);
      const monthEndStr = localDateStrFromDate(lastDay);

      db.transaction(() => {
        db.prepare(`DELETE FROM cashier_salary_work_days WHERE cashier_id = ? AND month_ym = ?`).run(
          cashierId,
          monthYm
        );
        db.prepare(`DELETE FROM cashier_salary_month_mode WHERE cashier_id = ? AND month_ym = ?`).run(
          cashierId,
          monthYm
        );

        if (mode === "manual") {
          db.prepare(`INSERT INTO cashier_salary_month_mode (cashier_id, month_ym, mode) VALUES (?, ?, 'manual')`).run(
            cashierId,
            monthYm
          );
          const ins = db.prepare(
            `INSERT OR IGNORE INTO cashier_salary_work_days (cashier_id, month_ym, work_date) VALUES (?, ?, ?)`
          );
          for (const d of dates) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
            if (d < monthStartStr || d > monthEndStr) continue;
            ins.run(cashierId, monthYm, d);
          }
        }
      })();

      res.json({ ok: true, mode, month: monthYm });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  /** GET /salary/:cashierId */
  router.get("/salary/:cashierId", (req, res) => {
    try {
      const cashierId = Number(req.params.cashierId);
      if (!Number.isFinite(cashierId)) {
        return res.status(400).json({ error: "Некорректный id" });
      }

      const monthYm = req.query.month ? String(req.query.month) : currentMonthYm();
      const range = monthRangeISO(monthYm);
      if (!range) return res.status(400).json({ error: "Некорректный месяц" });

      const c = db
        .prepare(`SELECT id, name, COALESCE(daily_salary_rate, 45) AS daily_salary_rate FROM cashiers WHERE id = ?`)
        .get(cashierId);
      if (!c) return res.status(404).json({ error: "Кассир не найден" });

      const workMode = getSalaryWorkMode(cashierId, monthYm);
      const workDatesAuto = listWorkDatesAuto(cashierId, range.start, range.end);
      const workDatesManual = listManualWorkDates(cashierId, monthYm);
      const workDates = listWorkDates(cashierId, range.start, range.end, monthYm);
      const workDays = workDates.length;
      const accrued = workDays * c.daily_salary_rate;
      const paid = paidForMonth(cashierId, monthYm);
      const balance = accrued - paid;

      const payments = db
        .prepare(
          `SELECT sp.id, sp.amount, sp.comment, sp.paid_by, sp.month_ym, sp.paid_at, a.name AS account_name
           FROM salary_payments sp
           JOIN accounts a ON a.id = sp.account_id
           WHERE sp.cashier_id = ?
           ORDER BY sp.paid_at DESC`
        )
        .all(cashierId);

      res.json({
        currency: "сомони",
        month: monthYm,
        cashier: { id: c.id, name: c.name, daily_salary_rate: c.daily_salary_rate },
        work_mode: workMode,
        work_days: workDays,
        work_dates: workDates,
        work_dates_auto: workDatesAuto,
        work_dates_manual: workDatesManual,
        accrued,
        paid,
        balance,
        status: salaryStatus(accrued, paid),
        payments,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}
