import { db } from "./db.js";

export function qParams(range, extra) {
  const sf = salesFilterClause({
    cashier_id: extra.cashier_id,
    payment_type: extra.payment_type,
  });
  const ef = expenseFilterClause({
    cashier_id: extra.cashier_id,
    expense_category: extra.expense_category,
    expense_payment_type: extra.expense_payment_type,
  });
  return {
    start: range.start,
    end: range.end,
    salesWhere: ` WHERE s.created_at >= ? AND s.created_at <= ? ${sf.sql}`,
    salesParams: [range.start, range.end, ...sf.params],
    expWhere: ` WHERE e.created_at >= ? AND e.created_at <= ? ${ef.sql}`,
    expParams: [range.start, range.end, ...ef.params],
  };
}

export function getSummaryData(range, extra) {
  const p = qParams(range, extra);

  const revenue =
    db.prepare(`SELECT COALESCE(SUM(s.total_amount), 0) AS v FROM sales s ${p.salesWhere}`).get(...p.salesParams)
      .v ?? 0;
  const orderCount = db.prepare(`SELECT COUNT(*) AS n FROM sales s ${p.salesWhere}`).get(...p.salesParams).n ?? 0;

  const debtWhere = `${p.salesWhere} AND s.payment_type = 'debt'`;
  const debtSum =
    db.prepare(`SELECT COALESCE(SUM(s.total_amount), 0) AS v FROM sales s ${debtWhere}`).get(...p.salesParams).v ??
    0;

  const netWhere = `${p.salesWhere} AND s.payment_type IN ('cash','card','transfer')`;
  const netReal =
    db.prepare(`SELECT COALESCE(SUM(s.total_amount), 0) AS v FROM sales s ${netWhere}`).get(...p.salesParams).v ??
    0;

  const expSum =
    db.prepare(`SELECT COALESCE(SUM(e.amount), 0) AS v FROM expenses e ${p.expWhere}`).get(...p.expParams).v ?? 0;

  const salaryPaid =
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS v FROM salary_payments WHERE paid_at >= ? AND paid_at <= ?`
      )
      .get(range.start, range.end).v ?? 0;

  const profit = revenue - expSum - salaryPaid;
  const avgCheck = orderCount > 0 ? revenue / orderCount : 0;

  return {
    revenue,
    expenses: expSum,
    salary_paid: Math.round(salaryPaid * 100) / 100,
    profit,
    order_count: orderCount,
    avg_check: Math.round(avgCheck * 100) / 100,
    debt_sales_total: debtSum,
    net_cash_card_transfer: netReal,
    currency: "сомони",
    period: { start: range.start, end: range.end, label: range.preset_label || "" },
  };
}

export function dayBoundsISO(dateStr) {
  const base = dateStr ? new Date(dateStr) : new Date();
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

export function parsePreset(preset) {
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

export function parseReportRange(query) {
  const from = query.from ? String(query.from) : null;
  const to = query.to ? String(query.to) : null;
  const preset = query.preset ? String(query.preset) : null;
  const date = query.date ? String(query.date) : null;

  if (from && to) {
    const s = new Date(from);
    const e = new Date(to);
    if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s.toISOString(), end: e.toISOString(), preset_label: `${from}–${to}` };
    }
  }

  if (preset && parsePreset(preset)) {
    const r = parsePreset(preset);
    return { ...r, preset_label: preset };
  }

  if (date) {
    const r = dayBoundsISO(date);
    return { ...r, preset_label: date };
  }

  const r = dayBoundsISO(null);
  return { ...r, preset_label: "today" };
}

/** Доп. фильтры продаж — только условия после дат (параметры подставляет вызывающий после start,end). */
export function salesFilterClause(extra = {}) {
  let sql = "";
  const params = [];
  const cid = extra.cashier_id ?? extra.cashierId;
  const pt = extra.payment_type ?? extra.paymentType;
  if (cid != null && Number.isFinite(Number(cid))) {
    sql += " AND s.cashier_id = ? ";
    params.push(Number(cid));
  }
  if (pt && ["cash", "card", "transfer", "debt"].includes(String(pt))) {
    sql += " AND s.payment_type = ? ";
    params.push(String(pt));
  }
  return { sql, params };
}

export function expenseFilterClause(extra = {}) {
  let sql = "";
  const params = [];
  const cid = extra.cashier_id ?? extra.cashierId;
  const cat = extra.expense_category ?? extra.expenseCategory;
  const ep = extra.expense_payment_type ?? extra.expensePaymentType;
  if (cid != null && Number.isFinite(Number(cid))) {
    sql += " AND e.cashier_id = ? ";
    params.push(Number(cid));
  }
  if (cat && String(cat).trim()) {
    sql += " AND e.category = ? ";
    params.push(String(cat).trim());
  }
  if (ep && ["cash", "card", "transfer"].includes(String(ep))) {
    sql += " AND e.payment_type = ? ";
    params.push(String(ep));
  }
  return { sql, params };
}
