import { Router } from "express";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "../db.js";
import { adminAuthMiddleware, signAdminToken } from "../middleware/adminAuth.js";
import { formatExpenseReceipt, sendTelegramMessage } from "../telegram.js";
import { recordExpenseInLedger } from "../ledger.js";
import { registerLedgerRoutes } from "./ledgerAdmin.js";
import { registerRecipeRoutes } from "./recipesAdmin.js";
import { registerReportRoutes } from "./reportsAdmin.js";
import { registerSalaryRoutes } from "./salaryAdmin.js";
import { addExpenseCategory, listExpenseCategoryNames } from "../expenseCategories.js";

export const adminApiRouter = Router();

/** POST /admin/login — без JWT; логин/пароль из backend/.env */
adminApiRouter.post("/login", (req, res) => {
  try {
    const login = String(req.body?.login ?? "").trim();
    const password = String(req.body?.password ?? "");
    const expectedLogin = process.env.ADMIN_LOGIN?.trim() || "admin";
    const hash = process.env.ADMIN_PASSWORD_HASH?.trim();
    const plain = process.env.ADMIN_PASSWORD?.trim();

    if (!hash && !plain) {
      return res.status(503).json({
        error:
          "Вход по паролю не настроен. Задайте ADMIN_PASSWORD или ADMIN_PASSWORD_HASH в backend/.env",
      });
    }
    if (!login || !password) {
      return res.status(400).json({ error: "Укажите логин и пароль" });
    }
    if (login !== expectedLogin) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }
    let ok = false;
    if (hash) {
      ok = bcrypt.compareSync(password, hash);
    } else {
      ok = password === plain;
    }
    if (!ok) {
      return res.status(401).json({ error: "Неверный логин или пароль" });
    }

    const token = signAdminToken({
      sub: "admin-password",
      name: expectedLogin,
    });

    res.json({
      token,
      admin: {
        id: 1,
        name: expectedLogin,
        username: login,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

adminApiRouter.use(adminAuthMiddleware);

/** POST /admin/telegram/ping — тест чата (те же TELEGRAM_* что и для чеков с кассы) */
adminApiRouter.post("/telegram/ping", async (_req, res) => {
  try {
    const r = await sendTelegramMessage("🧪 Ice: тест уведомлений (админка)");
    if (r.ok) return res.json({ ok: true });
    if (r.skipped) {
      return res.status(503).json({
        error:
          r.reason ||
          "Задайте TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в backend/.env на сервере и перезапустите Node.",
      });
    }
    const desc =
      r.data && typeof r.data === "object" && r.data.description
        ? String(r.data.description)
        : "Ошибка Telegram API";
    return res.status(502).json({ error: desc, telegram: r.data });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

function dayBoundsISO(inputDate) {
  const base = inputDate ? new Date(inputDate) : new Date();
  if (Number.isNaN(base.getTime())) {
    const x = new Date();
    const s = new Date(x);
    s.setHours(0, 0, 0, 0);
    const e = new Date(x);
    e.setHours(23, 59, 59, 999);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

function parsePreset(preset) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  let start = new Date();
  start.setHours(0, 0, 0, 0);
  if (preset === "today") {
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    const e = new Date(start);
    e.setHours(23, 59, 59, 999);
    const s = new Date(start);
    s.setHours(0, 0, 0, 0);
    return { start: s.toISOString(), end: e.toISOString() };
  }
  if (preset === "week") {
    start.setDate(start.getDate() - 6);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  if (preset === "month") {
    start.setDate(start.getDate() - 29);
    return { start: start.toISOString(), end: end.toISOString() };
  }
  return null;
}

/** GET /admin/dashboard */
adminApiRouter.get("/dashboard", (req, res) => {
  try {
    const dateStr = req.query.date ? String(req.query.date) : null;
    const { start, end } = dateStr ? dayBoundsISO(dateStr) : dayBoundsISO();

    const revenue =
      db
        .prepare(
          `SELECT COALESCE(SUM(total_amount), 0) as v FROM sales WHERE created_at >= ? AND created_at <= ?`
        )
        .get(start, end).v ?? 0;

    const expensesSum =
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE created_at >= ? AND created_at <= ?`
        )
        .get(start, end).v ?? 0;

    const orderCount = db
      .prepare(`SELECT COUNT(*) as n FROM sales WHERE created_at >= ? AND created_at <= ?`)
      .get(start, end).n;

    const byPayment = {};
    for (const pt of ["cash", "card", "transfer", "debt"]) {
      const row = db
        .prepare(
          `SELECT COALESCE(SUM(total_amount), 0) as v FROM sales WHERE created_at >= ? AND created_at <= ? AND payment_type = ?`
        )
        .get(start, end, pt);
      byPayment[pt] = row.v ?? 0;
    }

    res.json({
      date: (dateStr || new Date().toISOString().slice(0, 10)),
      revenue,
      expenses: expensesSum,
      profit: revenue - expensesSum,
      order_count: orderCount,
      cash: byPayment.cash,
      card: byPayment.card,
      transfer: byPayment.transfer,
      debt: byPayment.debt,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** GET /admin/orders */
adminApiRouter.get("/orders", (req, res) => {
  try {
    let start = req.query.from ? String(req.query.from) : null;
    let end = req.query.to ? String(req.query.to) : null;
    const preset = req.query.preset ? String(req.query.preset) : null;

    if (preset && ["today", "yesterday", "week", "month"].includes(preset)) {
      const b = parsePreset(preset);
      if (b) {
        start = b.start;
        end = b.end;
      }
    }
    if (!start || !end) {
      const b = dayBoundsISO(req.query.date ? String(req.query.date) : null);
      start = b.start;
      end = b.end;
    }

    const cashierId = req.query.cashier_id ? Number(req.query.cashier_id) : null;
    const paymentType = req.query.payment_type ? String(req.query.payment_type) : null;

    let sql = `
      SELECT s.rowid AS order_no,
             s.id,
             s.local_id,
             s.cashier_id,
             s.total_amount,
             s.payment_type,
             s.created_at,
             c.name AS cashier_name
      FROM sales s
      LEFT JOIN cashiers c ON c.id = s.cashier_id
      WHERE s.created_at >= ? AND s.created_at <= ?
    `;
    const params = [start, end];
    if (cashierId) {
      sql += ` AND s.cashier_id = ?`;
      params.push(cashierId);
    }
    if (paymentType) {
      sql += ` AND s.payment_type = ?`;
      params.push(paymentType);
    }
    sql += ` ORDER BY s.created_at DESC LIMIT 500`;

    const rows = db.prepare(sql).all(...params);
    const mapped = rows.map((r) => ({
      ...r,
      sync_status: "сервер",
    }));
    res.json(mapped);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** GET /admin/orders/:id */
adminApiRouter.get("/orders/:id", (req, res) => {
  try {
    const id = String(req.params.id);
    const sale = db
      .prepare(
        `SELECT s.*, c.name AS cashier_name, c.phone AS cashier_phone
         FROM sales s
         LEFT JOIN cashiers c ON c.id = s.cashier_id
         WHERE s.id = ?`
      )
      .get(id);
    if (!sale) {
      return res.status(404).json({ error: "Заказ не найден" });
    }
    const items = db
      .prepare(
        `SELECT product_id, product_name, quantity, price, total FROM sale_items WHERE sale_id = ? ORDER BY id`
      )
      .all(id);
    const created = sale.created_at ? new Date(sale.created_at) : null;
    res.json({
      ...sale,
      items,
      date_display: created
        ? created.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
        : "",
      sync_status: "сервер",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** GET /admin/expenses */
adminApiRouter.get("/expenses", (req, res) => {
  try {
    let start = req.query.from ? String(req.query.from) : null;
    let end = req.query.to ? String(req.query.to) : null;
    const preset = req.query.preset ? String(req.query.preset) : null;

    if (preset === "today" || preset === "week" || preset === "month") {
      const b = parsePreset(preset === "today" ? "today" : preset);
      if (b) {
        start = b.start;
        end = b.end;
      }
    }
    if (!start || !end) {
      const b = dayBoundsISO(null);
      start = b.start;
      end = b.end;
    }

    const cashierId = req.query.cashier_id ? Number(req.query.cashier_id) : null;
    const category = req.query.category ? String(req.query.category) : null;
    const paymentType = req.query.payment_account ? String(req.query.payment_account) : null;

    let sql = `
      SELECT e.*, c.name AS cashier_name
      FROM expenses e
      LEFT JOIN cashiers c ON c.id = e.cashier_id
      WHERE e.created_at >= ? AND e.created_at <= ?
    `;
    const params = [start, end];
    if (cashierId) {
      sql += ` AND e.cashier_id = ?`;
      params.push(cashierId);
    }
    if (category) {
      sql += ` AND e.category = ?`;
      params.push(category);
    }
    if (paymentType) {
      sql += ` AND e.payment_type = ?`;
      params.push(paymentType);
    }
    sql += ` ORDER BY e.created_at DESC LIMIT 500`;

    const rows = db.prepare(sql).all(...params);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** POST /admin/expenses — расход от имени админки (кассир по умолчанию первый активный или из тела) */
adminApiRouter.post("/expenses", (req, res) => {
  try {
    const amount = Number(req.body?.amount);
    const category = String(req.body?.category || "").trim();
    const payment_type = String(req.body?.payment_type || "cash");
    const comment = req.body?.comment != null ? String(req.body.comment) : null;
    const cashier_id = req.body?.cashier_id != null ? Number(req.body.cashier_id) : null;
    const created_at = req.body?.created_at ? String(req.body.created_at) : new Date().toISOString();

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Некорректная сумма" });
    }
    if (!category) {
      return res.status(400).json({ error: "Категория обязательна" });
    }

    let cid = cashier_id;
    if (!cid) {
      const first = db.prepare(`SELECT id FROM cashiers WHERE COALESCE(is_active, 1) = 1 ORDER BY id LIMIT 1`).get();
      if (!first) {
        return res.status(400).json({ error: "Нет кассиров — создайте кассира" });
      }
      cid = first.id;
    }

    const id = uuidv4();
    const localId = uuidv4();

    const run = db.transaction(() => {
      db.prepare(
        `INSERT INTO expenses (id, local_id, cashier_id, amount, category, payment_type, comment, photo_path, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, localId, cid, amount, category, payment_type, comment, null, created_at);

      recordExpenseInLedger({
        expenseId: id,
        amount,
        paymentType: payment_type,
        cashierId: cid,
        createdAt: created_at,
        categoryLabel: category,
      });
    });
    run();

    const body = {
      id,
      local_id: localId,
      cashier_id: cid,
      amount,
      category,
      payment_type,
      comment,
      photo_path: null,
      created_at,
    };

    void sendTelegramMessage(formatExpenseReceipt(body));

    res.status(201).json({ id });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** GET /admin/expense-categories */
adminApiRouter.get("/expense-categories", (_req, res) => {
  try {
    res.json(listExpenseCategoryNames());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** POST /admin/expense-categories — новая категория (упаковка, прочее) */
adminApiRouter.post("/expense-categories", (req, res) => {
  try {
    const name = addExpenseCategory(req.body?.name);
    res.status(201).json({ name });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** GET /admin/products */
adminApiRouter.get("/products", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, price, image, category, is_active, recipe_id, stock_item_id, stock_writeoff_qty, updated_at
       FROM products ORDER BY category, name`
    )
    .all();
  res.json(rows);
});

/** POST /admin/products */
adminApiRouter.post("/products", (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const price = Number(req.body?.price);
    const category = req.body?.category != null ? String(req.body.category).trim() : "";
    const image = req.body?.image != null ? String(req.body.image).trim() : null;
    const is_active = req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1;
    const recipe_id_raw =
      req.body?.recipe_id != null && req.body.recipe_id !== ""
        ? Number(req.body.recipe_id)
        : null;
    const recipe_id =
      recipe_id_raw != null && Number.isFinite(recipe_id_raw) && recipe_id_raw > 0 ? recipe_id_raw : null;

    let stock_item_id = null;
    if (req.body?.stock_item_id != null && req.body.stock_item_id !== "") {
      const s = Number(req.body.stock_item_id);
      if (Number.isFinite(s) && s > 0) stock_item_id = s;
    }
    let stock_writeoff_qty = null;
    if (stock_item_id) {
      const q = Number(req.body?.stock_writeoff_qty);
      stock_writeoff_qty = Number.isFinite(q) && q > 0 ? q : 1;
    }

    if (!name) return res.status(400).json({ error: "Название обязательно" });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Некорректная цена" });

    if (recipe_id != null) {
      const rx = db.prepare(`SELECT id FROM recipes WHERE id = ?`).get(recipe_id);
      if (!rx) return res.status(400).json({ error: "Рецепт не найден" });
    }
    if (stock_item_id != null) {
      const sx = db.prepare(`SELECT id FROM stock_items WHERE id = ?`).get(stock_item_id);
      if (!sx) return res.status(400).json({ error: "Позиция склада не найдена" });
    }

    const r = db
      .prepare(
        `INSERT INTO products (name, price, image, category, is_active, recipe_id, stock_item_id, stock_writeoff_qty, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(name, price, image, category, is_active, recipe_id, stock_item_id, stock_writeoff_qty);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** PUT /admin/products/:id */
adminApiRouter.put("/products/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const cur = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
    if (!cur) return res.status(404).json({ error: "Товар не найден" });

    const name = String(req.body?.name ?? cur.name).trim();
    const price = Number(req.body?.price ?? cur.price);
    const category = req.body?.category != null ? String(req.body.category).trim() : cur.category || "";
    const image =
      req.body?.image !== undefined ? (req.body.image ? String(req.body.image).trim() : null) : cur.image;
    const is_active =
      req.body?.is_active === undefined
        ? cur.is_active
        : req.body?.is_active === false || req.body?.is_active === 0
          ? 0
          : 1;

    let recipe_id = cur.recipe_id;
    if (req.body?.recipe_id !== undefined) {
      if (req.body.recipe_id === null || req.body.recipe_id === "") {
        recipe_id = null;
      } else {
        const n = Number(req.body.recipe_id);
        recipe_id = Number.isFinite(n) && n > 0 ? n : null;
      }
    }

    let stock_item_id = cur.stock_item_id;
    let stock_writeoff_qty = cur.stock_writeoff_qty;
    if (req.body?.stock_item_id !== undefined) {
      if (req.body.stock_item_id === null || req.body.stock_item_id === "") {
        stock_item_id = null;
        stock_writeoff_qty = null;
      } else {
        const s = Number(req.body.stock_item_id);
        stock_item_id = Number.isFinite(s) && s > 0 ? s : null;
        if (!stock_item_id) stock_writeoff_qty = null;
      }
    }
    if (req.body?.stock_writeoff_qty !== undefined && stock_item_id) {
      const q = Number(req.body.stock_writeoff_qty);
      if (req.body.stock_writeoff_qty === null || req.body.stock_writeoff_qty === "") {
        stock_writeoff_qty = 1;
      } else {
        stock_writeoff_qty = Number.isFinite(q) && q > 0 ? q : 1;
      }
    }
    if (!stock_item_id) stock_writeoff_qty = null;

    if (!name) return res.status(400).json({ error: "Название обязательно" });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "Некорректная цена" });

    if (recipe_id != null) {
      const rx = db.prepare(`SELECT id FROM recipes WHERE id = ?`).get(recipe_id);
      if (!rx) return res.status(400).json({ error: "Рецепт не найден" });
    }
    if (stock_item_id != null) {
      const sx = db.prepare(`SELECT id FROM stock_items WHERE id = ?`).get(stock_item_id);
      if (!sx) return res.status(400).json({ error: "Позиция склада не найдена" });
    }

    if (stock_item_id != null && (!Number.isFinite(Number(stock_writeoff_qty)) || Number(stock_writeoff_qty) <= 0)) {
      stock_writeoff_qty = 1;
    }

    db.prepare(
      `UPDATE products SET name = ?, price = ?, category = ?, image = ?, is_active = ?, recipe_id = ?,
       stock_item_id = ?, stock_writeoff_qty = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(name, price, category, image, is_active, recipe_id, stock_item_id, stock_writeoff_qty, id);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** DELETE /admin/products/:id — мягкое отключение */
adminApiRouter.delete("/products/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = db.prepare(`UPDATE products SET is_active = 0, updated_at = datetime('now') WHERE id = ?`).run(id);
    if (r.changes === 0) return res.status(404).json({ error: "Товар не найден" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** GET /admin/products/:id/portion-items — списание на 1 единицу товара (порция) */
adminApiRouter.get("/products/:id/portion-items", (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = db.prepare(`SELECT id FROM products WHERE id = ?`).get(id);
    if (!p) return res.status(404).json({ error: "Товар не найден" });
    const rows = db
      .prepare(
        `SELECT ppi.id, ppi.product_id, ppi.stock_item_id, ppi.ingredient_name, ppi.quantity, ppi.unit, ppi.sort_order,
                s.name AS stock_name, s.unit AS stock_unit
         FROM product_portion_items ppi
         JOIN stock_items s ON s.id = ppi.stock_item_id
         WHERE ppi.product_id = ?
         ORDER BY ppi.sort_order, ppi.id`
      )
      .all(id);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** PUT /admin/products/:id/portion-items — заменить строки списания на порцию */
adminApiRouter.put("/products/:id/portion-items", (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = db.prepare(`SELECT id FROM products WHERE id = ?`).get(id);
    if (!p) return res.status(404).json({ error: "Товар не найден" });

    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM product_portion_items WHERE product_id = ?`).run(id);
      const ins = db.prepare(
        `INSERT INTO product_portion_items (product_id, stock_item_id, ingredient_name, quantity, unit, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
      );
      let ord = 0;
      for (const it of items) {
        const stock_item_id = Number(it.stock_item_id);
        const quantity = Number(it.quantity);
        const unit = String(it.unit || "г").trim() || "г";
        const ingredient_name =
          it.ingredient_name != null && String(it.ingredient_name).trim()
            ? String(it.ingredient_name).trim()
            : null;
        if (!Number.isFinite(stock_item_id) || !Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("Некорректная строка списания");
        }
        const s = db.prepare(`SELECT id FROM stock_items WHERE id = ?`).get(stock_item_id);
        if (!s) throw new Error(`Позиция склада ${stock_item_id} не найдена`);
        ins.run(id, stock_item_id, ingredient_name, quantity, unit, it.sort_order != null ? Number(it.sort_order) : ord);
        ord += 1;
      }
    });

    tx();
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** GET /admin/cashiers */
adminApiRouter.get("/cashiers", (_req, res) => {
  const cashiers = db
    .prepare(
      `SELECT id, phone, name, COALESCE(is_active, 1) AS is_active,
              COALESCE(daily_salary_rate, 45) AS daily_salary_rate,
              created_at FROM cashiers ORDER BY id`
    )
    .all();

  const stats = db.prepare(`
    SELECT cashier_id,
           COUNT(*) AS sale_count,
           COALESCE(SUM(total_amount), 0) AS sale_sum
    FROM sales
    GROUP BY cashier_id
  `).all();

  const map = Object.fromEntries(stats.map((s) => [s.cashier_id, s]));

  const result = cashiers.map((c) => ({
    ...c,
    sale_count: map[c.id]?.sale_count ?? 0,
    sale_sum: map[c.id]?.sale_sum ?? 0,
    pin_preview: "••••",
  }));

  res.json(result);
});

/** POST /admin/cashiers */
adminApiRouter.post("/cashiers", (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    const pin = String(req.body?.pin || "");
    const is_active = req.body?.is_active === false || req.body?.is_active === 0 ? 0 : 1;
    if (!name || !phone || !pin) {
      return res.status(400).json({ error: "Имя, телефон и PIN обязательны" });
    }
    const pin_hash = bcrypt.hashSync(pin, 10);
    const rateRaw = Number(req.body?.daily_salary_rate);
    const daily_salary_rate = Number.isFinite(rateRaw) && rateRaw >= 0 ? rateRaw : 45;
    const r = db
      .prepare(`INSERT INTO cashiers (phone, pin_hash, name, is_active, daily_salary_rate) VALUES (?, ?, ?, ?, ?)`)
      .run(phone, pin_hash, name, is_active, daily_salary_rate);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    if (String(e.message || e).includes("UNIQUE")) {
      return res.status(409).json({ error: "Телефон уже занят" });
    }
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** PUT /admin/cashiers/:id */
adminApiRouter.put("/cashiers/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const cur = db
      .prepare(
        `SELECT id, phone, name, pin_hash, COALESCE(is_active,1) as is_active,
                COALESCE(daily_salary_rate, 45) AS daily_salary_rate
         FROM cashiers WHERE id = ?`
      )
      .get(id);
    if (!cur) return res.status(404).json({ error: "Кассир не найден" });

    const name = req.body?.name != null ? String(req.body.name).trim() : cur.name;
    const phone = req.body?.phone != null ? String(req.body.phone).replace(/\D/g, "") : cur.phone;
    const pin = req.body?.pin != null ? String(req.body.pin) : "";
    const is_active =
      req.body?.is_active === undefined
        ? cur.is_active
        : req.body?.is_active === false || req.body?.is_active === 0
          ? 0
          : 1;

    if (phone !== cur.phone) {
      const clash = db.prepare(`SELECT id FROM cashiers WHERE phone = ? AND id != ?`).get(phone, id);
      if (clash) return res.status(409).json({ error: "Телефон уже занят" });
    }

    const rateRaw =
      req.body?.daily_salary_rate !== undefined ? Number(req.body.daily_salary_rate) : cur.daily_salary_rate;
    const daily_salary_rate =
      Number.isFinite(rateRaw) && rateRaw >= 0 ? rateRaw : Number(cur.daily_salary_rate) || 45;

    if (pin.length > 0) {
      const pin_hash = bcrypt.hashSync(pin, 10);
      db.prepare(
        `UPDATE cashiers SET name = ?, phone = ?, pin_hash = ?, is_active = ?, daily_salary_rate = ? WHERE id = ?`
      ).run(name, phone, pin_hash, is_active, daily_salary_rate, id);
    } else {
      db.prepare(`UPDATE cashiers SET name = ?, phone = ?, is_active = ?, daily_salary_rate = ? WHERE id = ?`).run(
        name,
        phone,
        is_active,
        daily_salary_rate,
        id
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** PUT /admin/cashiers/:id/salary-rate — только ставка за день */
adminApiRouter.put("/cashiers/:id/salary-rate", (req, res) => {
  try {
    const id = Number(req.params.id);
    const rate = Number(req.body?.daily_salary_rate);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: "Некорректный id" });
    if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ error: "Некорректная ставка" });
    const r = db.prepare(`UPDATE cashiers SET daily_salary_rate = ? WHERE id = ?`).run(rate, id);
    if (r.changes === 0) return res.status(404).json({ error: "Кассир не найден" });
    res.json({ ok: true, daily_salary_rate: rate });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** GET /admin/reports/daily */
adminApiRouter.get("/reports/daily", (req, res) => {
  try {
    const { start, end } = dayBoundsISO(req.query.date ? String(req.query.date) : null);

    const revenue =
      db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as v FROM sales WHERE created_at >= ? AND created_at <= ?`).get(start, end)
        .v ?? 0;

    const expensesSum =
      db.prepare(`SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE created_at >= ? AND created_at <= ?`).get(start, end)
        .v ?? 0;

    const orderCount = db.prepare(`SELECT COUNT(*) as n FROM sales WHERE created_at >= ? AND created_at <= ?`).get(start, end).n;

    const avgCheck = orderCount > 0 ? revenue / orderCount : 0;

    const bestProduct = db
      .prepare(
        `SELECT product_name, SUM(quantity) as qty, SUM(total) as sum_total
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= ? AND s.created_at <= ?
         GROUP BY product_name
         ORDER BY sum_total DESC
         LIMIT 1`
      )
      .get(start, end);

    const salesByPayment = {};
    for (const pt of ["cash", "card", "transfer", "debt"]) {
      salesByPayment[pt] =
        db
          .prepare(
            `SELECT COALESCE(SUM(total_amount), 0) as v FROM sales WHERE created_at >= ? AND created_at <= ? AND payment_type = ?`
          )
          .get(start, end, pt).v ?? 0;
    }

    const expensesByCat = db
      .prepare(
        `SELECT category, SUM(amount) as sum_amount FROM expenses WHERE created_at >= ? AND created_at <= ? GROUP BY category`
      )
      .all(start, end);

    res.json({
      date: req.query.date || new Date().toISOString().slice(0, 10),
      revenue,
      expenses: expensesSum,
      profit: revenue - expensesSum,
      order_count: orderCount,
      avg_check: Math.round(avgCheck * 100) / 100,
      best_product: bestProduct || null,
      sales_by_payment: salesByPayment,
      expenses_by_category: expensesByCat,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** GET /admin/reports/monthly — заготовка MVP */
adminApiRouter.get("/reports/monthly", (req, res) => {
  try {
    const ym = req.query.month ? String(req.query.month) : new Date().toISOString().slice(0, 7);
    const [ys, ms] = ym.split("-");
    const y = Number(ys);
    const monthNum = Number(ms);
    const start = new Date(y, monthNum - 1, 1);
    const end = new Date(y, monthNum, 0, 23, 59, 59, 999);

    const revenue =
      db
        .prepare(`SELECT COALESCE(SUM(total_amount), 0) as v FROM sales WHERE created_at >= ? AND created_at <= ?`)
        .get(start.toISOString(), end.toISOString()).v ?? 0;

    const expensesSum =
      db
        .prepare(`SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE created_at >= ? AND created_at <= ?`)
        .get(start.toISOString(), end.toISOString()).v ?? 0;

    const orderCount = db
      .prepare(`SELECT COUNT(*) as n FROM sales WHERE created_at >= ? AND created_at <= ?`)
      .get(start.toISOString(), end.toISOString()).n;

    const topProducts = db
      .prepare(
        `SELECT product_name, SUM(quantity) as qty, SUM(total) as sum_total
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id
         WHERE s.created_at >= ? AND s.created_at <= ?
         GROUP BY product_name
         ORDER BY sum_total DESC
         LIMIT 5`
      )
      .all(start.toISOString(), end.toISOString());

    const bestCashier = db
      .prepare(
        `SELECT c.name, COUNT(*) as cnt, COALESCE(SUM(s.total_amount),0) as sum_total
         FROM sales s
         JOIN cashiers c ON c.id = s.cashier_id
         WHERE s.created_at >= ? AND s.created_at <= ?
         GROUP BY s.cashier_id
         ORDER BY sum_total DESC
         LIMIT 1`
      )
      .get(start.toISOString(), end.toISOString());

    res.json({
      month: ym,
      revenue,
      expenses: expensesSum,
      profit: revenue - expensesSum,
      order_count: orderCount,
      top_products: topProducts,
      best_cashier: bestCashier || null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

const WRITE_OFF_REASONS = ["Испортилось", "Тест рецепта", "Бесплатно", "Ошибка", "Другое"];

function notifyLowStock(item) {
  const msg = [
    "⚠️ Мало на складе",
    `${item.name}: осталось ${item.quantity} ${item.unit}`,
    `Минимум: ${item.min_quantity} ${item.unit}`,
  ].join("\n");
  void sendTelegramMessage(msg);
}

/** PUT /admin/stock/:id — имя, единица, минимум */
adminApiRouter.put("/stock/:id", (req, res) => {
  try {
    const id = Number(req.params.id);
    const cur = db.prepare(`SELECT id FROM stock_items WHERE id = ?`).get(id);
    if (!cur) return res.status(404).json({ error: "Позиция не найдена" });

    const name = req.body?.name != null ? String(req.body.name).trim() : null;
    const unit = req.body?.unit != null ? String(req.body.unit).trim() : null;
    const min_quantity = req.body?.min_quantity != null ? Number(req.body.min_quantity) : null;

    const row = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(id);
    const n = name ?? row.name;
    const u = unit ?? row.unit;
    const m = min_quantity != null && Number.isFinite(min_quantity) ? min_quantity : row.min_quantity;

    db.prepare(`UPDATE stock_items SET name = ?, unit = ?, min_quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(
      n,
      u,
      m,
      id
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** GET /admin/stock */
adminApiRouter.get("/stock", (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, unit, quantity, min_quantity, updated_at,
         CASE WHEN quantity < min_quantity THEN 'low' ELSE 'ok' END AS status
         FROM stock_items ORDER BY name`
      )
      .all();
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** POST /admin/stock/income — приход */
adminApiRouter.post("/stock/income", (req, res) => {
  try {
    const quantity = Number(req.body?.quantity);
    const unit = String(req.body?.unit || "шт").trim() || "шт";
    const unit_price = req.body?.unit_price != null ? Number(req.body.unit_price) : null;
    const supplier = req.body?.supplier != null ? String(req.body.supplier).trim() : null;
    const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;
    const created_at = req.body?.created_at ? String(req.body.created_at) : new Date().toISOString();
    const item_id_in = req.body?.item_id != null ? Number(req.body.item_id) : null;
    const item_name = req.body?.item_name != null ? String(req.body.item_name).trim() : "";

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: "Некорректное количество" });
    }

    let itemId = item_id_in;
    if (!itemId) {
      if (!item_name) {
        return res.status(400).json({ error: "Укажите item_id или item_name" });
      }
      const ex = db.prepare(`SELECT id FROM stock_items WHERE name = ?`).get(item_name);
      if (ex) {
        itemId = ex.id;
      } else {
        const ins = db
          .prepare(
            `INSERT INTO stock_items (name, unit, quantity, min_quantity, updated_at) VALUES (?, ?, 0, 0, datetime('now'))`
          )
          .run(item_name, unit);
        itemId = Number(ins.lastInsertRowid);
      }
    }

    const item = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(itemId);
    if (!item) return res.status(404).json({ error: "Позиция не найдена" });

    const newQty = item.quantity + quantity;
    db.prepare(`UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(newQty, itemId);

    const mid = uuidv4();
    db.prepare(
      `INSERT INTO stock_movements (id, item_id, movement_type, quantity, unit, unit_price, supplier, reason, comment, created_at)
       VALUES (?, ?, 'income', ?, ?, ?, ?, NULL, ?, ?)`
    ).run(mid, itemId, quantity, unit, unit_price, supplier, comment, created_at);

    const updated = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(itemId);
    if (updated.quantity < updated.min_quantity) {
      notifyLowStock(updated);
    }

    res.status(201).json({ id: mid, item_id: itemId, quantity: updated.quantity });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** POST /admin/stock/write-off — списание */
adminApiRouter.post("/stock/write-off", (req, res) => {
  try {
    const item_id = Number(req.body?.item_id);
    const quantity = Number(req.body?.quantity);
    const reason = String(req.body?.reason || "").trim();
    const comment = req.body?.comment != null ? String(req.body.comment).trim() : null;
    const created_at = req.body?.created_at ? String(req.body.created_at) : new Date().toISOString();

    if (!Number.isFinite(item_id)) return res.status(400).json({ error: "item_id обязателен" });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: "Некорректное количество" });
    if (!WRITE_OFF_REASONS.includes(reason)) {
      return res.status(400).json({ error: `Причина: одна из ${WRITE_OFF_REASONS.join(", ")}` });
    }

    const item = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(item_id);
    if (!item) return res.status(404).json({ error: "Позиция не найдена" });
    if (item.quantity < quantity) {
      return res.status(400).json({ error: "Недостаточно остатка" });
    }

    const newQty = item.quantity - quantity;
    db.prepare(`UPDATE stock_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`).run(newQty, item_id);

    const mid = uuidv4();
    db.prepare(
      `INSERT INTO stock_movements (id, item_id, movement_type, quantity, unit, unit_price, supplier, reason, comment, created_at)
       VALUES (?, ?, 'writeoff', ?, ?, NULL, NULL, ?, ?, ?)`
    ).run(mid, item_id, quantity, item.unit, reason, comment, created_at);

    const updated = db.prepare(`SELECT * FROM stock_items WHERE id = ?`).get(item_id);
    if (updated.quantity < updated.min_quantity) {
      notifyLowStock(updated);
    }

    res.status(201).json({ id: mid, item_id, quantity: updated.quantity });
  } catch (e) {
    console.error(e);
    res.status(400).json({ error: String(e.message || e) });
  }
});

/** Счета / ledger: см. registerLedgerRoutes */

/** GET /admin/settings — заглушка */
adminApiRouter.get("/settings", (_req, res) => {
  res.json({ business_name: "Ice Kassa", currency: "сомони" });
});

adminApiRouter.put("/settings", (_req, res) => {
  res.json({ ok: true });
});

registerLedgerRoutes(adminApiRouter);
registerRecipeRoutes(adminApiRouter);
registerReportRoutes(adminApiRouter);
registerSalaryRoutes(adminApiRouter);
