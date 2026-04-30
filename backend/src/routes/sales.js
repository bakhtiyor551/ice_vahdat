import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";
import { recordSaleInLedger, saleCommentFromBody } from "../ledger.js";
import { applySaleStockDeductions } from "../saleStock.js";
import { formatSaleReceipt, sendTelegramMessage } from "../telegram.js";

export const salesRouter = Router();
salesRouter.use(authMiddleware);

function insertSaleFromPayload(body, cashierId) {
  const localId = body.local_id;
  if (!localId) throw new Error("local_id обязателен");

  const dup = db.prepare("SELECT id FROM sales WHERE local_id = ?").get(localId);
  if (dup) {
    return { duplicate: true, id: dup.id };
  }

  const id = body.id || uuidv4();
  const total = Number(body.total_amount);
  const paymentType = String(body.payment_type || "cash");
  const clientAmount =
    body.client_amount != null && body.client_amount !== "" ? Number(body.client_amount) : null;
  const changeAmount =
    body.change_amount != null && body.change_amount !== "" ? Number(body.change_amount) : null;
  const paymentMeta = body.payment_meta != null ? JSON.stringify(body.payment_meta) : null;
  const createdAt = body.created_at || new Date().toISOString();

  const items = Array.isArray(body.items) ? body.items : [];

  const insertAll = db.transaction(() => {
    db.prepare(
      `INSERT INTO sales (id, local_id, cashier_id, total_amount, payment_type, client_amount, change_amount, payment_meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      localId,
      cashierId,
      total,
      paymentType,
      clientAmount,
      changeAmount,
      paymentMeta,
      createdAt
    );

    const insItem = db.prepare(
      `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, total) VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const it of items) {
      insItem.run(
        id,
        it.product_id ?? null,
        String(it.product_name || ""),
        Number(it.quantity),
        Number(it.price),
        Number(it.total)
      );
    }

    applySaleStockDeductions(id, items);

    recordSaleInLedger({
      saleId: id,
      totalAmount: total,
      paymentType,
      cashierId,
      createdAt,
      commentText: saleCommentFromBody(body),
    });
  });

  insertAll();

  return { duplicate: false, id };
}

salesRouter.post("/", (req, res) => {
  try {
    const cashierId = req.user.sub;
    const result = insertSaleFromPayload(req.body, cashierId);
    if (!result.duplicate) {
      const name = db.prepare("SELECT name FROM cashiers WHERE id = ?").get(cashierId)?.name || "";
      void sendTelegramMessage(formatSaleReceipt(req.body, name));
    }
    res.status(result.duplicate ? 200 : 201).json({ id: result.id, duplicate: result.duplicate });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

export { insertSaleFromPayload };
