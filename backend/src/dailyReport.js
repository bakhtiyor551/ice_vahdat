import cron from "node-cron";
import { db } from "./db.js";
import { getSummaryData, parseReportRange, qParams } from "./reportsService.js";
import { isTelegramConfigured, sendTelegramMessage } from "./telegram.js";

function paymentBreakdownForRange(range) {
  const p = qParams(range, {});
  const base = [...p.salesParams];
  const out = { cash: 0, card: 0, transfer: 0, debt: 0 };
  for (const pt of ["cash", "card", "transfer", "debt"]) {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(s.total_amount),0) AS v FROM sales s ${p.salesWhere} AND s.payment_type = ?`
      )
      .get(...base, pt);
    out[pt] = row.v ?? 0;
  }
  return out;
}

/** Текст ежедневного отчёта (плоский, без HTML). */
export function formatDailyTelegramReport() {
  const range = parseReportRange({ preset: "today" });
  const s = getSummaryData(range, {});
  const pay = paymentBreakdownForRange(range);
  return [
    "📊 Отчёт за день",
    "",
    `Выручка: ${s.revenue.toFixed(0)} сомони`,
    `Расходы: ${s.expenses.toFixed(0)} сомони`,
    `Прибыль: ${s.profit.toFixed(0)} сомони`,
    `Заказы: ${s.order_count}`,
    "",
    `Наличные: ${pay.cash.toFixed(0)}`,
    `Карта: ${pay.card.toFixed(0)}`,
    `Перевод: ${pay.transfer.toFixed(0)}`,
    `Долг: ${pay.debt.toFixed(0)}`,
  ].join("\n");
}

export function scheduleDailyReportCron() {
  if (!isTelegramConfigured()) {
    return;
  }
  if (process.env.TELEGRAM_DAILY_REPORT_DISABLED === "1") {
    console.log("Telegram: вечерний отчёт отключён (TELEGRAM_DAILY_REPORT_DISABLED=1)");
    return;
  }
  const expr = process.env.TELEGRAM_DAILY_REPORT_CRON?.trim() || "0 21 * * *";
  cron.schedule(expr, () => {
    const text = formatDailyTelegramReport();
    void sendTelegramMessage(text);
  });
  console.log(`Telegram: ежедневный отчёт по расписанию (${expr}, серверное время)`);
}
