import { Router } from "express";
import { db } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { formatExpenseReceipt, formatSaleReceipt, sendTelegramMessage } from "../telegram.js";
import { insertSaleFromPayload } from "./sales.js";
import { insertExpenseFromPayload } from "./expenses.js";

export const syncRouter = Router();
syncRouter.use(authMiddleware);

syncRouter.post("/push", async (req, res) => {
  const cashierId = req.user.sub;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const results = [];

  for (const row of items) {
    const type = row.entity_type;
    const payload = row.payload || {};
    try {
      if (type === "sale") {
        const full = { ...payload, local_id: payload.local_id || row.entity_id };
        const r = insertSaleFromPayload(full, cashierId);
        let telegram = null;
        if (!r.duplicate) {
          const name = db.prepare("SELECT name FROM cashiers WHERE id = ?").get(cashierId)?.name || "";
          telegram = await sendTelegramMessage(formatSaleReceipt(full, name));
        }
        const rowResult = { entity_type: type, entity_id: row.entity_id, ok: true, duplicate: r.duplicate, id: r.id };
        if (!r.duplicate && telegram) {
          rowResult.telegram_sent = telegram.ok;
          if (!telegram.ok) {
            rowResult.telegram_error = telegram.skipped
              ? "missing_env"
              : String(telegram.data?.description || telegram.error || "send_failed");
          }
        }
        results.push(rowResult);
      } else if (type === "expense") {
        const full = { ...payload, local_id: payload.local_id || row.entity_id };
        const r = insertExpenseFromPayload(full, cashierId);
        let telegram = null;
        if (!r.duplicate) {
          telegram = await sendTelegramMessage(formatExpenseReceipt(full));
        }
        const rowResult = { entity_type: type, entity_id: row.entity_id, ok: true, duplicate: r.duplicate, id: r.id };
        if (!r.duplicate && telegram) {
          rowResult.telegram_sent = telegram.ok;
          if (!telegram.ok) {
            rowResult.telegram_error = telegram.skipped
              ? "missing_env"
              : String(telegram.data?.description || telegram.error || "send_failed");
          }
        }
        results.push(rowResult);
      } else {
        results.push({ entity_type: type, entity_id: row.entity_id, ok: false, error: "unknown entity_type" });
      }
    } catch (e) {
      results.push({ entity_type: type, entity_id: row.entity_id, ok: false, error: String(e.message || e) });
    }
  }

  res.json({ results });
});

syncRouter.get("/pull", (req, res) => {
  const since = req.query.products_since ? String(req.query.products_since) : null;
  let products;
  if (since) {
    products = db
      .prepare(
        `SELECT id, name, price, image, category, is_active, updated_at FROM products
         WHERE datetime(updated_at) > datetime(?) ORDER BY id`
      )
      .all(since);
  } else {
    products = db
      .prepare(`SELECT id, name, price, image, category, is_active, updated_at FROM products ORDER BY category, name`)
      .all();
  }
  res.json({ products, server_time: new Date().toISOString() });
});
