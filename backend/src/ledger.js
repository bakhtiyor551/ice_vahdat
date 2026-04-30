import { v4 as uuidv4 } from "uuid";
import { db } from "./db.js";

/** Маппинг способа оплаты → код счёта */
export const PAYMENT_TO_ACCOUNT_CODE = {
  cash: "cash",
  card: "card",
  transfer: "transfer",
  debt: "debt",
};

export function getAccountIdByCode(code) {
  const r = db.prepare(`SELECT id FROM accounts WHERE code = ? AND is_active = 1`).get(code);
  return r?.id ?? null;
}

function insertTxn({
  accountId,
  kind,
  amount,
  direction,
  sourceType,
  sourceId,
  comment,
  cashierId,
  createdAt,
}) {
  const tid = uuidv4();
  db.prepare(
    `INSERT INTO account_transactions (
       id, account_id, kind, amount, direction, source_type, source_id, comment, created_by_cashier_id, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tid,
    accountId,
    kind,
    amount,
    direction,
    sourceType,
    sourceId ?? null,
    comment ?? null,
    cashierId ?? null,
    createdAt
  );
  const delta = direction === "in" ? amount : -amount;
  db.prepare(`UPDATE accounts SET balance = balance + ?, updated_at = datetime('now') WHERE id = ?`).run(
    delta,
    accountId
  );
  return tid;
}

/** Вызывается внутри общей транзакции с сохранением продажи */
export function recordSaleInLedger({
  saleId,
  totalAmount,
  paymentType,
  cashierId,
  createdAt,
  commentText,
}) {
  const code = PAYMENT_TO_ACCOUNT_CODE[String(paymentType || "cash")] || "cash";
  const accountId = getAccountIdByCode(code);
  if (!accountId) {
    console.warn(`ledger: нет счёта с кодом ${code}`);
    return;
  }
  const amt = Number(totalAmount);
  if (!Number.isFinite(amt) || amt <= 0) return;

  insertTxn({
    accountId,
    kind: "sale",
    amount: amt,
    direction: "in",
    sourceType: "sale",
    sourceId: saleId,
    comment: commentText || "Продажа",
    cashierId,
    createdAt,
  });
}

/** Внутри транзакции БД вместе с expenses INSERT */
export function recordExpenseInLedger({
  expenseId,
  amount,
  paymentType,
  cashierId,
  createdAt,
  categoryLabel,
}) {
  const code = PAYMENT_TO_ACCOUNT_CODE[String(paymentType || "cash")] || "cash";
  const accountId = getAccountIdByCode(code);
  if (!accountId) return;
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) return;

  insertTxn({
    accountId,
    kind: "expense",
    amount: amt,
    direction: "out",
    sourceType: "expense",
    sourceId: expenseId,
    comment: categoryLabel ? `Расход: ${categoryLabel}` : "Расход",
    cashierId,
    createdAt,
  });
}

/** Ручное пополнение (админка), свой txn */
export function applyManualIncome({ accountId, amount, comment, createdAt }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Некорректная сумма");
  insertTxn({
    accountId,
    kind: "manual_income",
    amount: amt,
    direction: "in",
    sourceType: "manual",
    sourceId: null,
    comment: comment || "Ручное пополнение",
    cashierId: null,
    createdAt,
  });
}

export function applyManualOutcome({ accountId, amount, comment, createdAt }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Некорректная сумма");
  insertTxn({
    accountId,
    kind: "manual_outcome",
    amount: amt,
    direction: "out",
    sourceType: "manual",
    sourceId: null,
    comment: comment || "Ручное списание",
    cashierId: null,
    createdAt,
  });
}

export function applyTransfer({ fromAccountId, toAccountId, amount, comment, createdAt }) {
  if (fromAccountId === toAccountId) throw new Error("Разные счета");
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Некорректная сумма");

  return db.transaction(() => {
    const transferId = uuidv4();
    db.prepare(
      `INSERT INTO account_transfers (id, from_account_id, to_account_id, amount, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(transferId, fromAccountId, toAccountId, amt, comment ?? null, createdAt);

    insertTxn({
      accountId: fromAccountId,
      kind: "transfer_out",
      amount: amt,
      direction: "out",
      sourceType: "transfer",
      sourceId: transferId,
      comment: comment ? `Перевод → ${comment}` : "Перевод со счёта",
      cashierId: null,
      createdAt,
    });

    insertTxn({
      accountId: toAccountId,
      kind: "transfer_in",
      amount: amt,
      direction: "in",
      sourceType: "transfer",
      sourceId: transferId,
      comment: comment ? `Перевод ← ${comment}` : "Перевод на счёт",
      cashierId: null,
      createdAt,
    });

    return transferId;
  })();
}

/** Закрытие долга: меньше «Долги клиентов», больше cash/card/transfer */
export function applyDebtPayment({ amount, targetCode, clientComment, createdAt }) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Некорректная сумма");
  const debtId = getAccountIdByCode("debt");
  const targetId = getAccountIdByCode(targetCode);
  if (!debtId) throw new Error("Счёт долгов не найден");
  if (!targetId) throw new Error("Счёт зачисления не найден");

  return db.transaction(() => {
    const gid = uuidv4();
    const note = clientComment?.trim() || "Оплата долга";

    insertTxn({
      accountId: debtId,
      kind: "debt_payment",
      amount: amt,
      direction: "out",
      sourceType: "debt_settlement",
      sourceId: gid,
      comment: `${note} (уменьшение долга)`,
      cashierId: null,
      createdAt,
    });

    insertTxn({
      accountId: targetId,
      kind: "debt_payment",
      amount: amt,
      direction: "in",
      sourceType: "debt_settlement",
      sourceId: gid,
      comment: `${note} (поступление)`,
      cashierId: null,
      createdAt,
    });

    return gid;
  })();
}

/** Выплата зарплаты: списание со счёта (админ). */
export function recordSalaryPaymentInLedger({
  accountId,
  amount,
  salaryPaymentId,
  cashierName,
  comment,
  createdAt,
}) {
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) throw new Error("Некорректная сумма зарплаты");
  insertTxn({
    accountId,
    kind: "salary",
    amount: amt,
    direction: "out",
    sourceType: "salary_payment",
    sourceId: salaryPaymentId,
    comment: comment ? `Зарплата (${cashierName}): ${comment}` : `Зарплата: ${cashierName}`,
    cashierId: null,
    createdAt,
  });
}

export function saleCommentFromBody(body) {
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return `Продажа ${body?.total_amount ?? ""} сом`;
  return items
    .map((i) => `${i.product_name || "Товар"} ×${i.quantity}`)
    .slice(0, 6)
    .join(", ");
}

/** Одноразовый импорт из sales/expenses если таблица движений пуста */
export function backfillLedgerFromLegacyIfEmpty() {
  const n = db.prepare(`SELECT COUNT(*) AS c FROM account_transactions`).get().c;
  if (n > 0) return;

  const tx = db.transaction(() => {
    const sales = db.prepare(`SELECT * FROM sales ORDER BY created_at`).all();
    for (const s of sales) {
      recordSaleInLedger({
        saleId: s.id,
        totalAmount: s.total_amount,
        paymentType: s.payment_type,
        cashierId: s.cashier_id,
        createdAt: s.created_at,
        commentText: `Импорт продажи (${s.payment_type})`,
      });
    }

    const expenses = db.prepare(`SELECT * FROM expenses ORDER BY created_at`).all();
    for (const e of expenses) {
      recordExpenseInLedger({
        expenseId: e.id,
        amount: e.amount,
        paymentType: e.payment_type,
        cashierId: e.cashier_id,
        createdAt: e.created_at,
        categoryLabel: e.category,
      });
    }
  });

  try {
    tx();
  } catch (err) {
    console.error("ledger backfill:", err);
  }
}
