import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { batchScaleFactor, convertToStockUnit } from "../recipeUnits.js";
import { sendTelegramMessage } from "../telegram.js";

function notifyLowStock(item) {
  const msg = [
    "⚠️ Мало на складе",
    `${item.name}: осталось ${item.quantity} ${item.unit}`,
    `Минимум: ${item.min_quantity} ${item.unit}`,
  ].join("\n");
  void sendTelegramMessage(msg);
}

function getOutputStockItemId(explicitId) {
  if (explicitId) {
    const r = db.prepare(`SELECT id FROM stock_items WHERE id = ?`).get(explicitId);
    if (r) return r.id;
  }
  const byName = db.prepare(`SELECT id FROM stock_items WHERE name = 'Готовая смесь' LIMIT 1`).get();
  if (byName) return byName.id;
  const ins = db
    .prepare(
      `INSERT INTO stock_items (name, unit, quantity, min_quantity, updated_at) VALUES ('Готовая смесь', 'л', 0, 0, datetime('now'))`
    )
    .run();
  return Number(ins.lastInsertRowid);
}

function lastIncomeForItem(stockItemId) {
  return db
    .prepare(
      `SELECT unit_price, unit, quantity FROM stock_movements
       WHERE item_id = ? AND movement_type = 'income' AND unit_price IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(stockItemId);
}

/** Себестоимость `need` единиц учёта склада (текущая unit позиции). */
function estimateCostForQuantity(stockItemId, needInStockUnits) {
  const m = lastIncomeForItem(stockItemId);
  if (!m || !Number.isFinite(m.unit_price) || m.unit_price < 0) return 0;
  const item = db.prepare(`SELECT id, unit FROM stock_items WHERE id = ?`).get(stockItemId);
  if (!item) return 0;
  const perM = convertToStockUnit(1, m.unit, item.unit);
  if (perM == null || perM <= 0) return 0;
  return needInStockUnits * (m.unit_price / perM);
}

function mapRecipeRow(r) {
  if (!r) return null;
  return { ...r, is_active: r.is_active ? 1 : 0 };
}

function loadRecipeItems(recipeId) {
  return db
    .prepare(
      `SELECT ri.id, ri.recipe_id, ri.stock_item_id, ri.ingredient_name, ri.quantity, ri.unit, ri.created_at,
              s.name AS stock_name, s.unit AS stock_unit
       FROM recipe_items ri
       JOIN stock_items s ON s.id = ri.stock_item_id
       WHERE ri.recipe_id = ?
       ORDER BY ri.id`
    )
    .all(recipeId);
}

function estimateRecipeBatchCost(recipeId, scale = 1) {
  const items = loadRecipeItems(recipeId);
  let total = 0;
  for (const ri of items) {
    const need = convertToStockUnit(Number(ri.quantity) * scale, ri.unit, ri.stock_unit);
    if (need == null) continue;
    total += estimateCostForQuantity(ri.stock_item_id, need);
  }
  return Math.round(total * 10000) / 10000;
}

export function registerRecipeRoutes(router) {
  router.get("/recipes/meta/units", (_req, res) => {
    res.json({
      ingredient_units: ["л", "мл", "кг", "г", "шт", "уп"],
      recipe_types: ["база", "дополнение", "прочее"],
    });
  });

  router.get("/recipes", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT id, name, type, output_quantity, output_unit, output_stock_item_id, comment, is_active, created_at, updated_at
         FROM recipes ORDER BY name`
      )
      .all();
    const out = rows.map((r) => ({
      ...r,
      batch_cost_estimate: estimateRecipeBatchCost(r.id, 1),
    }));
    res.json(out);
  });

  router.get("/recipes/:id", (req, res) => {
    const id = Number(req.params.id);
    const r = db.prepare(`SELECT * FROM recipes WHERE id = ?`).get(id);
    if (!r) return res.status(404).json({ error: "Рецепт не найден" });
    const items = loadRecipeItems(id);
    res.json({
      ...mapRecipeRow(r),
      items,
      batch_cost_estimate: estimateRecipeBatchCost(id, 1),
      cost_per_output_unit:
        r.output_quantity > 0 ? estimateRecipeBatchCost(id, 1) / Number(r.output_quantity) : 0,
    });
  });

  router.post("/recipes", (req, res) => {
    try {
      const name = String(req.body?.name || "").trim();
      const type = String(req.body?.type || "база").trim() || "база";
      const output_quantity = Number(req.body?.output_quantity);
      const output_unit = String(req.body?.output_unit || "л").trim() || "л";
      const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;
      const is_active = req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1;
      const output_stock_item_id =
        req.body?.output_stock_item_id != null ? Number(req.body.output_stock_item_id) : null;
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!name) return res.status(400).json({ error: "Название обязательно" });
      if (!Number.isFinite(output_quantity) || output_quantity <= 0) {
        return res.status(400).json({ error: "Выход готовой смеси должен быть > 0" });
      }

      const outSid = output_stock_item_id && Number.isFinite(output_stock_item_id) ? output_stock_item_id : null;

      const ins = db
        .prepare(
          `INSERT INTO recipes (name, type, output_quantity, output_unit, output_stock_item_id, comment, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .run(name, type, output_quantity, output_unit, outSid, comment, is_active);

      const recipeId = Number(ins.lastInsertRowid);
      const insItem = db.prepare(
        `INSERT INTO recipe_items (recipe_id, stock_item_id, ingredient_name, quantity, unit) VALUES (?, ?, ?, ?, ?)`
      );

      for (const it of rawItems) {
        const stock_item_id = Number(it.stock_item_id);
        const ingredient_name = String(it.ingredient_name || "").trim();
        const quantity = Number(it.quantity);
        const unit = String(it.unit || "").trim() || "г";
        if (!Number.isFinite(stock_item_id) || !ingredient_name || !Number.isFinite(quantity) || quantity <= 0) {
          db.prepare(`DELETE FROM recipes WHERE id = ?`).run(recipeId);
          return res.status(400).json({ error: "Некорректная строка ингредиента" });
        }
        const s = db.prepare(`SELECT id FROM stock_items WHERE id = ?`).get(stock_item_id);
        if (!s) {
          db.prepare(`DELETE FROM recipes WHERE id = ?`).run(recipeId);
          return res.status(400).json({ error: `Склад id=${stock_item_id} не найден` });
        }
        insItem.run(recipeId, stock_item_id, ingredient_name, quantity, unit);
      }

      res.status(201).json({ id: recipeId });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.put("/recipes/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      const cur = db.prepare(`SELECT id FROM recipes WHERE id = ?`).get(id);
      if (!cur) return res.status(404).json({ error: "Рецепт не найден" });

      const name = String(req.body?.name || "").trim();
      const type = String(req.body?.type || "база").trim() || "база";
      const output_quantity = Number(req.body?.output_quantity);
      const output_unit = String(req.body?.output_unit || "л").trim() || "л";
      const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;
      const is_active = req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1;
      const output_stock_item_id =
        req.body?.output_stock_item_id != null ? Number(req.body.output_stock_item_id) : null;
      const rawItems = Array.isArray(req.body?.items) ? req.body.items : null;

      if (!name) return res.status(400).json({ error: "Название обязательно" });
      if (!Number.isFinite(output_quantity) || output_quantity <= 0) {
        return res.status(400).json({ error: "Выход готовой смеси должен быть > 0" });
      }

      const outSid = output_stock_item_id && Number.isFinite(output_stock_item_id) ? output_stock_item_id : null;

      db.prepare(
        `UPDATE recipes SET name = ?, type = ?, output_quantity = ?, output_unit = ?, output_stock_item_id = ?, comment = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`
      ).run(name, type, output_quantity, output_unit, outSid, comment, is_active, id);

      if (rawItems) {
        db.prepare(`DELETE FROM recipe_items WHERE recipe_id = ?`).run(id);
        const insItem = db.prepare(
          `INSERT INTO recipe_items (recipe_id, stock_item_id, ingredient_name, quantity, unit) VALUES (?, ?, ?, ?, ?)`
        );
        for (const it of rawItems) {
          const stock_item_id = Number(it.stock_item_id);
          const ingredient_name = String(it.ingredient_name || "").trim();
          const quantity = Number(it.quantity);
          const unit = String(it.unit || "").trim() || "г";
          if (!Number.isFinite(stock_item_id) || !ingredient_name || !Number.isFinite(quantity) || quantity <= 0) {
            return res.status(400).json({ error: "Некорректная строка ингредиента" });
          }
          const s = db.prepare(`SELECT id FROM stock_items WHERE id = ?`).get(stock_item_id);
          if (!s) return res.status(400).json({ error: `Склад id=${stock_item_id} не найден` });
          insItem.run(id, stock_item_id, ingredient_name, quantity, unit);
        }
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  router.delete("/recipes/:id", (req, res) => {
    try {
      const id = Number(req.params.id);
      const used = db.prepare(`SELECT id FROM products WHERE recipe_id = ? LIMIT 1`).get(id);
      if (used) {
        return res.status(400).json({ error: "Рецепт привязан к товару — сначала отвяжите в карточке товара" });
      }
      const r = db.prepare(`DELETE FROM recipes WHERE id = ?`).run(id);
      if (r.changes === 0) return res.status(404).json({ error: "Рецепт не найден" });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  /** Копия рецепта */
  router.post("/recipes/:id/copy", (req, res) => {
    try {
      const id = Number(req.params.id);
      const src = db.prepare(`SELECT * FROM recipes WHERE id = ?`).get(id);
      if (!src) return res.status(404).json({ error: "Рецепт не найден" });

      const newName = String(req.body?.name || "").trim() || `Копия — ${src.name}`;

      const ins = db
        .prepare(
          `INSERT INTO recipes (name, type, output_quantity, output_unit, output_stock_item_id, comment, is_active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))`
        )
        .run(
          newName,
          src.type,
          src.output_quantity,
          src.output_unit,
          src.output_stock_item_id,
          src.comment
        );
      const newId = Number(ins.lastInsertRowid);

      const items = db.prepare(`SELECT * FROM recipe_items WHERE recipe_id = ?`).all(id);
      const insItem = db.prepare(
        `INSERT INTO recipe_items (recipe_id, stock_item_id, ingredient_name, quantity, unit) VALUES (?, ?, ?, ?, ?)`
      );
      for (const it of items) {
        insItem.run(newId, it.stock_item_id, it.ingredient_name, it.quantity, it.unit);
      }

      res.status(201).json({ id: newId });
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });

  /** Производство смеси по рецепту */
  router.post("/recipes/:id/produce", (req, res) => {
    const id = Number(req.params.id);
    const recipe = db.prepare(`SELECT * FROM recipes WHERE id = ?`).get(id);
    if (!recipe) return res.status(404).json({ error: "Рецепт не найден" });
    if (!recipe.is_active) return res.status(400).json({ error: "Рецепт отключён" });

    const output_quantity = Number(req.body?.output_quantity);
    const output_unit = String(req.body?.output_unit || recipe.output_unit).trim() || recipe.output_unit;
    const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;

    if (!Number.isFinite(output_quantity) || output_quantity <= 0) {
      return res.status(400).json({ error: "Укажите объём партии" });
    }

    const scale = batchScaleFactor(
      recipe.output_quantity,
      recipe.output_unit,
      output_quantity,
      output_unit
    );

    if (scale == null || !Number.isFinite(scale) || scale <= 0) {
      return res.status(400).json({ error: "Несовместимы единицы выхода с рецептом" });
    }

    const items = loadRecipeItems(id);
    if (!items.length) return res.status(400).json({ error: "В рецепте нет ингредиентов" });

    const mixOutId = getOutputStockItemId(recipe.output_stock_item_id);
    const mixItem = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(mixOutId);

    const tx = db.transaction(() => {
      let totalCost = 0;

      for (const ri of items) {
        const need = convertToStockUnit(Number(ri.quantity) * scale, ri.unit, ri.stock_unit);
        if (need == null || !Number.isFinite(need)) {
          throw new Error(`Единицы: ${ri.ingredient_name} (${ri.unit}) ↔ склад ${ri.stock_unit}`);
        }
        const st = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(ri.stock_item_id);
        if (st.quantity < need) {
          throw new Error(`Недостаточно «${st.name}»: нужно ${need.toFixed(3)} ${st.unit}, есть ${st.quantity}`);
        }
        totalCost += estimateCostForQuantity(ri.stock_item_id, need);

        const newQty = st.quantity - need;
        db.prepare(`UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(
          newQty,
          st.id
        );

        const mid = uuidv4();
        db.prepare(
          `INSERT INTO stock_movements (id, item_id, movement_type, quantity, unit, unit_price, supplier, reason, comment, created_at)
           VALUES (?, ?, 'recipe_use', ?, ?, NULL, NULL, 'Производство', ?, datetime('now'))`
        ).run(mid, st.id, need, st.unit, `recipe ${id}`);

        const updated = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(st.id);
        if (updated.quantity < updated.min_quantity) {
          notifyLowStock(updated);
        }
      }

      const outQtyRecipeUnit = Number(recipe.output_quantity) * scale;
      const addToMix = convertToStockUnit(outQtyRecipeUnit, recipe.output_unit, mixItem.unit);
      if (addToMix == null || !Number.isFinite(addToMix)) {
        throw new Error(`Выход смеси: несовместимы ${recipe.output_unit} и единица склада «${mixItem.name}» (${mixItem.unit})`);
      }

      const newMixQty = mixItem.quantity + addToMix;
      db.prepare(`UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(
        newMixQty,
        mixItem.id
      );

      const midIn = uuidv4();
      db.prepare(
        `INSERT INTO stock_movements (id, item_id, movement_type, quantity, unit, unit_price, supplier, reason, comment, created_at)
         VALUES (?, ?, 'recipe_output', ?, ?, NULL, NULL, 'Производство', ?, datetime('now'))`
      ).run(midIn, mixItem.id, addToMix, mixItem.unit, `recipe ${id}`);

      const prodIns = db
        .prepare(
          `INSERT INTO recipe_productions (recipe_id, output_quantity, output_unit, total_cost, comment)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(id, output_quantity, output_unit, Math.round(totalCost * 100) / 100, comment);

      return {
        production_id: Number(prodIns.lastInsertRowid),
        total_cost: Math.round(totalCost * 100) / 100,
        mix_quantity: newMixQty,
      };
    });

    try {
      const result = tx();
      res.status(201).json(result);
    } catch (e) {
      console.error(e);
      res.status(400).json({ error: String(e.message || e) });
    }
  });
}
