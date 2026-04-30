import { db } from "../db.js";
import {
  applyDebtPayment,
  applyManualIncome,
  applyManualOutcome,
  applyTransfer,
} from "../ledger.js";

const SYSTEM_CODES = new Set(["cash", "card", "transfer", "debt", "owner"]);

export function registerLedgerRoutes(router) {
  router.get("/accounts", (_req, res) => {
    try {
      const accounts = db
        .prepare(
          `SELECT id, name, code, type, balance, is_active, sort_order, created_at, updated_at
           FROM accounts WHERE is_active = 1 ORDER BY sort_order, id`
        )
        .all();

      const rows = db.prepare(`SELECT code, balance FROM accounts WHERE is_active = 1`).all();
      let totalReal = 0;
      let debtBal = 0;
      for (const r of rows) {
        if (r.code === "debt") debtBal += r.balance;
        else totalReal += r.balance;
      }

      res.json({
        currency: "сомони",
        total_real_balance: Math.round(totalReal * 100) / 100,
        debt_balance: Math.round(debtBal * 100) / 100,
        accounts,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.post("/accounts", (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const type = String(req.body?.type || "other").trim();
      const codeIn = req.body?.code != null ? String(req.body.code).trim() : "";
      if (!name) return res.status(400).json({ error: "Название обязательно" });

      let code = codeIn;
      if (!code) {
        const slug = name
          .toLowerCase()
          .replace(/[^\wа-яё]+/gi, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40);
        code = slug || `acc_${Date.now()}`;
      }
      if (SYSTEM_CODES.has(code)) {
        return res.status(400).json({ error: "Этот код зарезервирован" });
      }

      const exists = db.prepare(`SELECT id FROM accounts WHERE code = ?`).get(code);
      if (exists) return res.status(409).json({ error: "Код счёта уже занят" });

      const r = db
        .prepare(
          `INSERT INTO accounts (name, code, type, balance, is_active, sort_order, updated_at)
           VALUES (?, ?, ?, 0, 1, 99, datetime('now'))`
        )
        .run(name, code, type);
      res.status(201).json({ id: r.lastInsertRowid });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.put("/accounts/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      const cur = db.prepare(`SELECT * FROM accounts WHERE id = ?`).get(id);
      if (!cur) return res.status(404).json({ error: "Счёт не найден" });

      const name = req.body?.name != null ? String(req.body.name).trim() : cur.name;
      const is_active =
        req.body?.is_active === undefined
          ? cur.is_active
          : req.body?.is_active === false || req.body?.is_active === 0
            ? 0
            : 1;

      db.prepare(`UPDATE accounts SET name = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(
        name || cur.name,
        is_active,
        id
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.post("/accounts/transfer", (req, res) => {
    try {
      const from_account_id = Number(req.body?.from_account_id);
      const to_account_id = Number(req.body?.to_account_id);
      const amount = Number(req.body?.amount);
      const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;
      const created_at = req.body?.created_at ? String(req.body.created_at) : new Date().toISOString();

      if (!Number.isFinite(from_account_id) || !Number.isFinite(to_account_id)) {
        return res.status(400).json({ error: "Укажите счета" });
      }
      const tid = applyTransfer({
        fromAccountId: from_account_id,
        toAccountId: to_account_id,
        amount,
        comment,
        createdAt: created_at,
      });
      res.status(201).json({ id: tid });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.post("/accounts/manual-income", (req, res) => {
    try {
      const account_id = Number(req.body?.account_id);
      const amount = Number(req.body?.amount);
      const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;
      const created_at = req.body?.created_at ? String(req.body.created_at) : new Date().toISOString();

      if (!Number.isFinite(account_id)) return res.status(400).json({ error: "account_id обязателен" });

      applyManualIncome({ accountId: account_id, amount, comment, createdAt: created_at });
      res.status(201).json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.post("/accounts/manual-outcome", (req, res) => {
    try {
      const account_id = Number(req.body?.account_id);
      const amount = Number(req.body?.amount);
      const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;
      const created_at = req.body?.created_at ? String(req.body.created_at) : new Date().toISOString();

      if (!Number.isFinite(account_id)) return res.status(400).json({ error: "account_id обязателен" });

      applyManualOutcome({ accountId: account_id, amount, comment, createdAt: created_at });
      res.status(201).json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.post("/accounts/debt-payment", (req, res) => {
    try {
      const amount = Number(req.body?.amount);
      const target_code = String(req.body?.target_code || "cash").trim();
      const client_comment = req.body?.client_comment != null ? String(req.body.client_comment).trim() : "";
      const created_at = req.body?.created_at ? String(req.body.created_at) : new Date().toISOString();

      if (!["cash", "card", "transfer"].includes(target_code)) {
        return res.status(400).json({ error: "target_code: cash, card или transfer" });
      }

      const gid = applyDebtPayment({
        amount,
        targetCode: target_code,
        clientComment: client_comment,
        createdAt: created_at,
      });
      res.status(201).json({ id: gid });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.get("/accounts/:id/transactions", (req, res) => {
    try {
      const accountId = Number(req.params.id);
      const acc = db.prepare(`SELECT id FROM accounts WHERE id = ?`).get(accountId);
      if (!acc) return res.status(404).json({ error: "Счёт не найден" });

      const rows = db
        .prepare(
          `SELECT t.id, t.account_id, t.kind, t.amount, t.direction, t.source_type, t.source_id, t.comment,
                  t.created_by_cashier_id, t.created_at,
                  c.name AS cashier_name
           FROM account_transactions t
           LEFT JOIN cashiers c ON c.id = t.created_by_cashier_id
           WHERE t.account_id = ?
           ORDER BY datetime(t.created_at) DESC
           LIMIT 500`
        )
        .all(accountId);

      res.json(rows);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}
