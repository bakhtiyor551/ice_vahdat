import { v4 as uuidv4 } from "uuid";
import { db } from "./db.js";
import { convertToStockUnit } from "./recipeUnits.js";
import { sendTelegramMessage } from "./telegram.js";

function notifyLowAfterSale(item) {
  if (item.quantity >= item.min_quantity) return;
  const isPack = item.name.includes("Упаковка мороженого");
  const msg = isPack
    ? `⚠️ Мало упаковки\n${item.name}\nОсталось: ${item.quantity} ${item.unit}`
    : ["⚠️ Мало на складе", `${item.name}: осталось ${item.quantity} ${item.unit}`, `Минимум: ${item.min_quantity} ${item.unit}`].join(
        "\n"
      );
  void sendTelegramMessage(msg);
}

function insertSaleMovement(itemId, qty, unit, saleId, productId, tag) {
  const mid = uuidv4();
  db.prepare(
    `INSERT INTO stock_movements (id, item_id, movement_type, quantity, unit, unit_price, supplier, reason, comment, created_at)
     VALUES (?, ?, 'sale', ?, ?, NULL, NULL, ?, ?, datetime('now'))`
  ).run(mid, itemId, qty, unit, "Продажа", `${tag} sale ${saleId} product ${productId}`);
}

/**
 * Списание склада при продаже:
 * 1) products.stock_item_id × stock_writeoff_qty — упаковка (в минус разрешено)
 * 2) product_portion_items — доп. строки (в минус разрешено)
 */
export function applySaleStockDeductions(saleId, saleItems) {
  const lines = Array.isArray(saleItems) ? saleItems : [];

  for (const line of lines) {
    const productId = line.product_id != null ? Number(line.product_id) : null;
    if (!productId || !Number.isFinite(productId)) continue;

    const mult = Number(line.quantity);
    if (!Number.isFinite(mult) || mult <= 0) continue;

    const prod = db
      .prepare(
        `SELECT id, stock_item_id, stock_writeoff_qty FROM products WHERE id = ?`
      )
      .get(productId);

    if (prod?.stock_item_id != null && Number.isFinite(Number(prod.stock_item_id))) {
      const sid = Number(prod.stock_item_id);
      const perRaw = prod.stock_writeoff_qty;
      const per =
        perRaw != null && Number.isFinite(Number(perRaw)) && Number(perRaw) > 0 ? Number(perRaw) : 1;

      const item = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(sid);
      if (!item) {
        throw new Error(`Склад: позиция товара ${sid} не найдена`);
      }

      const need = convertToStockUnit(mult * per, "шт", item.unit);
      if (need == null || !Number.isFinite(need)) {
        throw new Error(
          `Несовместимы единицы списания упаковки для «${item.name}» (ожидаются шт)`
        );
      }

      const newQty = item.quantity - need;
      db.prepare(`UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(newQty, item.id);

      insertSaleMovement(item.id, need, item.unit, saleId, productId, "packaging");

      const updated = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(item.id);
      notifyLowAfterSale(updated);
    }

    const portions = db
      .prepare(`SELECT * FROM product_portion_items WHERE product_id = ? ORDER BY sort_order, id`)
      .all(productId);

    for (const p of portions) {
      const item = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(p.stock_item_id);
      if (!item) {
        throw new Error(`Склад: позиция ${p.stock_item_id} не найдена`);
      }

      const need = convertToStockUnit(mult * Number(p.quantity), p.unit, item.unit);
      if (need == null || !Number.isFinite(need)) {
        throw new Error(
          `Несовместимы единицы для «${item.name}»: порция ${p.unit}, склад ${item.unit}`
        );
      }

      const newQty = item.quantity - need;
      db.prepare(`UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(newQty, item.id);

      insertSaleMovement(item.id, need, item.unit, saleId, productId, "portion");

      const updated = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(item.id);
      notifyLowAfterSale(updated);
    }
  }
}
