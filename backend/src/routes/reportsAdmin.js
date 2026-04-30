import ExcelJS from "exceljs";
import { db } from "../db.js";
import { getSummaryData, parseReportRange, qParams } from "../reportsService.js";

export function registerReportRoutes(router) {
  router.get("/reports/summary", (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const extra = {
        cashier_id: req.query.cashier_id ? Number(req.query.cashier_id) : null,
        payment_type: req.query.payment_type ? String(req.query.payment_type) : null,
        expense_category: req.query.expense_category ? String(req.query.expense_category) : null,
        expense_payment_type: req.query.expense_payment_type ? String(req.query.expense_payment_type) : null,
      };
      res.json(getSummaryData(range, extra));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/payments", (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const p = qParams(range, {
        cashier_id: req.query.cashier_id ? Number(req.query.cashier_id) : null,
        payment_type: req.query.payment_type ? String(req.query.payment_type) : null,
      });
      const out = { cash: 0, card: 0, transfer: 0, debt: 0 };
      const base = [...p.salesParams];
      for (const pt of ["cash", "card", "transfer", "debt"]) {
        const row = db
          .prepare(
            `SELECT COALESCE(SUM(s.total_amount),0) AS v FROM sales s ${p.salesWhere} AND s.payment_type = ?`
          )
          .get(...base, pt);
        out[pt] = row.v ?? 0;
      }
      res.json({ currency: "сомони", payments: out });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/products", (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const p = qParams(range, {
        cashier_id: req.query.cashier_id ? Number(req.query.cashier_id) : null,
        payment_type: req.query.payment_type ? String(req.query.payment_type) : null,
      });
      const productId = req.query.product_id ? Number(req.query.product_id) : null;
      let sql = `
        SELECT si.product_name, SUM(si.quantity) AS qty, SUM(si.total) AS sum_total
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id
        ${p.salesWhere}`;
      const sp = [...p.salesParams];
      if (productId && Number.isFinite(productId)) {
        sql += ` AND si.product_id = ?`;
        sp.push(productId);
      }
      sql += ` GROUP BY si.product_name ORDER BY sum_total DESC`;
      const rows = db.prepare(sql).all(...sp);
      res.json({ products: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/expenses", (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const p = qParams(range, {
        cashier_id: req.query.cashier_id ? Number(req.query.cashier_id) : null,
        expense_category: req.query.expense_category ? String(req.query.expense_category) : null,
        expense_payment_type: req.query.expense_payment_type ? String(req.query.expense_payment_type) : null,
      });
      const rows = db
        .prepare(
          `SELECT e.category, SUM(e.amount) AS sum_amount, COUNT(*) AS cnt
           FROM expenses e ${p.expWhere}
           GROUP BY e.category
           ORDER BY sum_amount DESC`
        )
        .all(...p.expParams);

      const salarySum =
        db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) AS v, COUNT(*) AS n
             FROM salary_payments WHERE paid_at >= ? AND paid_at <= ?`
          )
          .get(range.start, range.end);
      const sv = salarySum?.v ?? 0;
      const sn = salarySum?.n ?? 0;
      if (sv > 0.005) {
        rows.push({ category: "Зарплата", sum_amount: sv, cnt: sn });
        rows.sort((a, b) => b.sum_amount - a.sum_amount);
      }

      res.json({ by_category: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/cashiers", (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const { start, end } = range;
      const filterCid = req.query.cashier_id != null && req.query.cashier_id !== "" ? Number(req.query.cashier_id) : null;
      const cidOk = filterCid != null && Number.isFinite(filterCid);

      let salesSql = `SELECT s.cashier_id,
                  COUNT(*) AS orders,
                  COALESCE(SUM(s.total_amount), 0) AS sales_sum
           FROM sales s
           WHERE s.created_at >= ? AND s.created_at <= ?`;
      const salesParams = [start, end];
      if (cidOk) {
        salesSql += ` AND s.cashier_id = ?`;
        salesParams.push(filterCid);
      }
      salesSql += ` GROUP BY s.cashier_id`;
      const salesRows = db.prepare(salesSql).all(...salesParams);

      let expSql = `SELECT e.cashier_id,
                  COUNT(*) AS exp_cnt,
                  COALESCE(SUM(e.amount), 0) AS expenses_sum
           FROM expenses e
           WHERE e.created_at >= ? AND e.created_at <= ?`;
      const expParams = [start, end];
      if (cidOk) {
        expSql += ` AND e.cashier_id = ?`;
        expParams.push(filterCid);
      }
      expSql += ` GROUP BY e.cashier_id`;
      const expRows = db.prepare(expSql).all(...expParams);

      const expMap = Object.fromEntries(expRows.map((r) => [r.cashier_id, r]));
      let cashiers = db.prepare(`SELECT id, name FROM cashiers ORDER BY id`).all();
      if (cidOk) {
        cashiers = cashiers.filter((c) => c.id === filterCid);
      }

      const out = cashiers.map((c) => {
        const sr = salesRows.find((x) => x.cashier_id === c.id);
        const er = expMap[c.id];
        return {
          cashier_id: c.id,
          name: c.name,
          orders: sr?.orders ?? 0,
          sales_sum: sr?.sales_sum ?? 0,
          expenses_sum: er?.expenses_sum ?? 0,
          expense_count: er?.exp_cnt ?? 0,
        };
      });

      res.json({ cashiers: out.filter((x) => x.orders > 0 || x.expenses_sum > 0) });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/accounts", (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const { start, end } = range;

      const accounts = db
        .prepare(`SELECT id, name, code, balance FROM accounts WHERE is_active = 1 ORDER BY sort_order, id`)
        .all();

      const details = accounts.map((acc) => {
        const rows = db
          .prepare(
            `SELECT kind, direction, COALESCE(SUM(amount),0) AS s
             FROM account_transactions
             WHERE account_id = ? AND created_at >= ? AND created_at <= ?
             GROUP BY kind, direction`
          )
          .all(acc.id, start, end);

        let salesIn = 0;
        let expensesOut = 0;
        let transferIn = 0;
        let transferOut = 0;
        let otherIn = 0;
        let otherOut = 0;

        for (const r of rows) {
          const v = r.s;
          if (r.kind === "sale" && r.direction === "in") salesIn += v;
          else if (r.kind === "expense" && r.direction === "out") expensesOut += v;
          else if (r.kind === "salary" && r.direction === "out") expensesOut += v;
          else if (r.kind === "transfer_in" && r.direction === "in") transferIn += v;
          else if (r.kind === "transfer_out" && r.direction === "out") transferOut += v;
          else if (r.direction === "in") otherIn += v;
          else if (r.direction === "out") otherOut += v;
        }

        const delta =
          salesIn - expensesOut + transferIn - transferOut + otherIn - otherOut;

        return {
          id: acc.id,
          name: acc.name,
          code: acc.code,
          current_balance: acc.balance,
          period: {
            sales_in: salesIn,
            expenses_out: expensesOut,
            transfer_in: transferIn,
            transfer_out: transferOut,
            other_in: otherIn,
            other_out: otherOut,
            net_change: Math.round(delta * 100) / 100,
          },
        };
      });

      res.json({ accounts: details, currency: "сомони" });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/stock", (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const { start, end } = range;

      const items = db
        .prepare(
          `SELECT id, name, unit, quantity FROM stock_items WHERE name LIKE '%Упаковка мороженого%' ORDER BY name`
        )
        .all();

      const rows = items.map((it) => {
        const sold =
          db
            .prepare(
              `SELECT COALESCE(SUM(quantity), 0) AS v FROM stock_movements
               WHERE item_id = ? AND movement_type = 'sale' AND created_at >= ? AND created_at <= ?`
            )
            .get(it.id, start, end).v ?? 0;

        return {
          stock_item_id: it.id,
          name: it.name,
          unit: it.unit,
          sold_qty: sold,
          stock_qty: it.quantity,
        };
      });

      res.json({ packaging: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/day-detail", (req, res) => {
    try {
      const dateStr = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);
      const range = parseReportRange({ date: dateStr });
      const { start, end } = range;

      const orders = db
        .prepare(
          `SELECT s.*, c.name AS cashier_name
           FROM sales s
           LEFT JOIN cashiers c ON c.id = s.cashier_id
           WHERE s.created_at >= ? AND s.created_at <= ?
           ORDER BY s.created_at DESC`
        )
        .all(start, end);

      const orderIds = orders.map((o) => o.id);
      const itemsBySale = {};
      if (orderIds.length) {
        const placeholders = orderIds.map(() => "?").join(",");
        const items = db
          .prepare(`SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`)
          .all(...orderIds);
        for (const it of items) {
          if (!itemsBySale[it.sale_id]) itemsBySale[it.sale_id] = [];
          itemsBySale[it.sale_id].push(it);
        }
      }

      const expenses = db
        .prepare(
          `SELECT e.*, c.name AS cashier_name
           FROM expenses e
           LEFT JOIN cashiers c ON c.id = e.cashier_id
           WHERE e.created_at >= ? AND e.created_at <= ?
           ORDER BY e.created_at DESC`
        )
        .all(start, end);

      const summary = getSummaryData(range, {});
      const payments = {};
      for (const pt of ["cash", "card", "transfer", "debt"]) {
        const row = db
          .prepare(
            `SELECT COALESCE(SUM(total_amount),0) AS v FROM sales WHERE created_at >= ? AND created_at <= ? AND payment_type = ?`
          )
          .get(start, end, pt);
        payments[pt] = row.v ?? 0;
      }

      const products = db
        .prepare(
          `SELECT si.product_name, SUM(si.quantity) AS qty, SUM(si.total) AS sum_total
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           WHERE s.created_at >= ? AND s.created_at <= ?
           GROUP BY si.product_name`
        )
        .all(start, end);

      const cashiers = db
        .prepare(
          `SELECT c.id AS cashier_id, c.name, COUNT(s.id) AS orders, COALESCE(SUM(s.total_amount),0) AS sales_sum
           FROM cashiers c
           LEFT JOIN sales s ON s.cashier_id = c.id AND s.created_at >= ? AND s.created_at <= ?
           GROUP BY c.id`
        )
        .all(start, end);

      const expByCashierDay = db
        .prepare(
          `SELECT cashier_id, COALESCE(SUM(amount),0) AS expenses_sum
           FROM expenses
           WHERE created_at >= ? AND created_at <= ?
           GROUP BY cashier_id`
        )
        .all(start, end);
      const expDayMap = Object.fromEntries(
        expByCashierDay.filter((x) => x.cashier_id != null).map((x) => [x.cashier_id, x.expenses_sum])
      );

      const cashiersWithExp = cashiers.map((c) => ({
        ...c,
        expenses_sum: expDayMap[c.cashier_id] ?? 0,
      }));

      res.json({
        date: dateStr,
        summary,
        payments,
        orders: orders.map((o) => ({ ...o, items: itemsBySale[o.id] || [] })),
        expenses,
        products,
        cashiers: cashiersWithExp,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });

  router.get("/reports/export", async (req, res) => {
    try {
      const range = parseReportRange(req.query);
      const extra = {
        cashier_id: req.query.cashier_id ? Number(req.query.cashier_id) : null,
        payment_type: req.query.payment_type ? String(req.query.payment_type) : null,
        expense_category: req.query.expense_category ? String(req.query.expense_category) : null,
        expense_payment_type: req.query.expense_payment_type ? String(req.query.expense_payment_type) : null,
      };

      const summary = getSummaryData(range, extra);
      const p = qParams(range, extra);

      const payments = {};
      const base = [...p.salesParams];
      for (const pt of ["cash", "card", "transfer", "debt"]) {
        payments[pt] =
          db
            .prepare(
              `SELECT COALESCE(SUM(s.total_amount),0) AS v FROM sales s ${p.salesWhere} AND s.payment_type = ?`
            )
            .get(...base, pt).v ?? 0;
      }

      const products = db
        .prepare(
          `SELECT si.product_name, SUM(si.quantity) AS qty, SUM(si.total) AS sum_total
           FROM sale_items si JOIN sales s ON s.id = si.sale_id ${p.salesWhere}
           GROUP BY si.product_name`
        )
        .all(...p.salesParams);

      const expByCat = db
        .prepare(
          `SELECT e.category, SUM(e.amount) AS sum_amount, COUNT(*) AS cnt FROM expenses e ${p.expWhere} GROUP BY e.category`
        )
        .all(...p.expParams);

      const salaryAgg =
        db
          .prepare(
            `SELECT COALESCE(SUM(amount), 0) AS v, COUNT(*) AS n FROM salary_payments WHERE paid_at >= ? AND paid_at <= ?`
          )
          .get(range.start, range.end);
      const expRowsForExcel = [...expByCat];
      if ((salaryAgg?.v ?? 0) > 0.005) {
        expRowsForExcel.push({
          category: "Зарплата",
          sum_amount: salaryAgg.v,
          cnt: salaryAgg.n,
        });
      }

      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Ice Kassa";

      const salesList = db
        .prepare(
          `SELECT s.id, s.created_at, s.total_amount, s.payment_type, c.name AS cashier
           FROM sales s LEFT JOIN cashiers c ON c.id = s.cashier_id ${p.salesWhere} ORDER BY s.created_at`
        )
        .all(...p.salesParams);

      const cashiersAgg = db
        .prepare(
          `SELECT c.id AS cashier_id, c.name, COUNT(s.id) AS orders, COALESCE(SUM(s.total_amount),0) AS sales_sum
           FROM cashiers c
           LEFT JOIN sales s ON s.cashier_id = c.id AND s.created_at >= ? AND s.created_at <= ?
           GROUP BY c.id`
        )
        .all(p.start, p.end);

      const expByCashier = db
        .prepare(
          `SELECT cashier_id, COUNT(*) AS n, COALESCE(SUM(amount),0) AS s FROM expenses
           WHERE created_at >= ? AND created_at <= ? GROUP BY cashier_id`
        )
        .all(p.start, p.end);
      const expMap = Object.fromEntries(expByCashier.map((x) => [x.cashier_id, x]));

      const sh1 = workbook.addWorksheet("Итог");
      sh1.addRow(["Показатель", "Значение"]);
      sh1.addRow(["Выручка", summary.revenue]);
      sh1.addRow(["Расходы (касса без зарплаты)", summary.expenses]);
      sh1.addRow(["Выплаченная зарплата", summary.salary_paid ?? 0]);
      sh1.addRow(["Прибыль", summary.profit]);
      sh1.addRow(["Заказы", summary.order_count]);
      sh1.addRow(["Средний чек", summary.avg_check]);
      sh1.addRow(["Долги (продажи в долг)", summary.debt_sales_total]);
      sh1.addRow(["Чистые деньги (нал+карта+перевод)", summary.net_cash_card_transfer]);
      sh1.addRow([]);
      sh1.addRow(["По оплатам", ""]);
      sh1.addRow(["Наличные", payments.cash]);
      sh1.addRow(["Карта", payments.card]);
      sh1.addRow(["Перевод", payments.transfer]);
      sh1.addRow(["Долг", payments.debt]);
      sh1.addRow([]);
      sh1.addRow(["Период", summary.period.label]);
      sh1.addRow(["С", summary.period.start]);
      sh1.addRow(["По", summary.period.end]);

      const shS = workbook.addWorksheet("Продажи");
      shS.addRow(["ID", "Дата", "Сумма", "Оплата", "Кассир"]);
      for (const r of salesList) {
        shS.addRow([r.id, r.created_at, r.total_amount, r.payment_type, r.cashier]);
      }

      const shE = workbook.addWorksheet("Расходы");
      shE.addRow(["Категория", "Сумма", "Количество"]);
      for (const r of expRowsForExcel) {
        shE.addRow([r.category, r.sum_amount, r.cnt]);
      }

      const shPr = workbook.addWorksheet("Товары");
      shPr.addRow(["Товар", "Кол-во", "Сумма"]);
      for (const r of products) {
        shPr.addRow([r.product_name, r.qty, r.sum_total]);
      }

      const shC = workbook.addWorksheet("Кассиры");
      shC.addRow(["Кассир", "Заказы", "Продажи", "Расходы"]);
      const allC = db.prepare(`SELECT id, name FROM cashiers`).all();
      for (const c of allC) {
        const sr = cashiersAgg.find((x) => x.cashier_id === c.id);
        const er = expMap[c.id];
        shC.addRow([c.name, sr?.orders ?? 0, sr?.sales_sum ?? 0, er?.s ?? 0]);
      }

      const accData = db
        .prepare(`SELECT id, name, code, balance FROM accounts WHERE is_active = 1 ORDER BY sort_order`)
        .all();
      const shA = workbook.addWorksheet("Счета");
      shA.addRow(["Счёт", "Код", "Текущий баланс"]);
      for (const a of accData) {
        shA.addRow([a.name, a.code, a.balance]);
      }

      const packItems = db
        .prepare(`SELECT id, name, quantity FROM stock_items WHERE name LIKE '%Упаковка мороженого%' ORDER BY name`)
        .all();
      const shSt = workbook.addWorksheet("Склад");
      shSt.addRow(["Упаковка", "Продано за период", "Остаток"]);
      for (const x of packItems) {
        const sold =
          db
            .prepare(
              `SELECT COALESCE(SUM(quantity), 0) AS v FROM stock_movements
               WHERE item_id = ? AND movement_type = 'sale' AND created_at >= ? AND created_at <= ?`
            )
            .get(x.id, p.start, p.end).v ?? 0;
        shSt.addRow([x.name, sold, x.quantity]);
      }

      const buf = await workbook.xlsx.writeBuffer();
      const fname = `report_${range.preset_label || "export"}.xlsx`.replace(/[^\w.\-]+/g, "_");

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);
      res.send(Buffer.from(buf));
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: String(e.message || e) });
    }
  });
}
