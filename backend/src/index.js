import "./loadEnv.js";
import fs from "fs";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initDb } from "./db.js";
import { backfillLedgerFromLegacyIfEmpty } from "./ledger.js";
import { isTelegramConfigured } from "./telegram.js";
import { scheduleDailyReportCron } from "./dailyReport.js";
import { authRouter } from "./routes/auth.js";
import { productsRouter } from "./routes/products.js";
import { salesRouter } from "./routes/sales.js";
import { expensesRouter } from "./routes/expenses.js";
import { syncRouter } from "./routes/sync.js";
import { telegramAuthRouter } from "./routes/telegramAuth.js";
import { adminApiRouter } from "./routes/adminApi.js";
import { catalogRouter } from "./routes/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

initDb();
backfillLedgerFromLegacyIfEmpty();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/catalog", catalogRouter);

app.use("/telegram", telegramAuthRouter);
app.use("/admin", adminApiRouter);

app.use("/auth", authRouter);
app.use("/products", productsRouter);
app.use("/sales", salesRouter);
app.use("/expenses", expensesRouter);
app.use("/sync", syncRouter);

const port = Number(process.env.PORT || 3847);
const envPath = path.join(__dirname, "..", ".env");

app.listen(port, () => {
  console.log(`API http://localhost:${port}`);
  const pwdOk =
    !!(process.env.ADMIN_PASSWORD_HASH?.trim() || process.env.ADMIN_PASSWORD?.trim());
  console.log(
    pwdOk
      ? "Админ: вход по паролю включён (ADMIN_LOGIN / ADMIN_PASSWORD или HASH)"
      : "Админ: вход по паролю выключен — задайте ADMIN_PASSWORD или ADMIN_PASSWORD_HASH в .env и перезапустите"
  );
  const envExists = fs.existsSync(envPath);
  if (isTelegramConfigured()) {
    console.log("Telegram: уведомления включены");
  } else if (!envExists) {
    console.log(
      "Telegram: выключено — нет файла backend/.env. Создайте его: скопируйте .env.example в .env и заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID"
    );
  } else {
    console.log(
      "Telegram: выключено — в backend/.env задайте непустые TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID (без пробелов по краям; в личке с ботом выполните /start)"
    );
  }
  console.log(`       .env: ${envPath}`);
  scheduleDailyReportCron();
});
