import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { recordExpenseInLedger } from "../ledger.js";
import { authMiddleware } from "../middleware/auth.js";
import { formatExpenseReceipt, sendTelegramMessage } from "../telegram.js";
import { listExpenseCategoryNames } from "../expenseCategories.js";

export const expensesRouter = Router();
expensesRouter.use(authMiddleware);

expensesRouter.get("/categories", (_req, res) => {
  try {
    res.json(listExpenseCategoryNames());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

function insertExpenseFromPayload(body, cashierId) {
  const localId = body.local_id;
  if (!localId) throw new Error("local_id обязателен");

  const dup = db.prepare("SELECT id FROM expenses WHERE local_id = ?").get(localId);
  if (dup) {
    return { duplicate: true, id: dup.id };
  }

  const id = body.id || uuidv4();
  const amount = Number(body.amount);
  const category = String(body.category || "");
  const paymentType = String(body.payment_type || "cash");
  const comment = body.comment != null ? String(body.comment) : null;
  const photoPath = body.photo_path != null ? String(body.photo_path) : null;
  const createdAt = body.created_at || new Date().toISOString();

  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO expenses (id, local_id, cashier_id, amount, category, payment_type, comment, photo_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, localId, cashierId, amount, category, paymentType, comment, photoPath, createdAt);

    recordExpenseInLedger({
      expenseId: id,
      amount,
      paymentType,
      cashierId,
      createdAt,
      categoryLabel: category,
    });
  });
  run();

  return { duplicate: false, id };
}

expensesRouter.post("/", (req, res) => {
  try {
    const cashierId = req.user.sub;
    const result = insertExpenseFromPayload(req.body, cashierId);
    if (!result.duplicate) {
      void sendTelegramMessage(formatExpenseReceipt(req.body));
    }
    res.status(result.duplicate ? 200 : 201).json({ id: result.id, duplicate: result.duplicate });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

export { insertExpenseFromPayload };
