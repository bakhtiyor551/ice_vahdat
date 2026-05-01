#!/usr/bin/env node
/**
 * Запуск из каталога backend: npm run telegram:test
 * Проверяет токен (getMe) и шлёт тест в TELEGRAM_CHAT_ID.
 */

import "../src/loadEnv.js";
import { sendTelegramMessage, isTelegramConfigured, telegramToken } from "../src/telegram.js";

async function main() {
  console.log("isTelegramConfigured (backend/.env):", isTelegramConfigured());
  const token = telegramToken();
  if (!token) {
    console.error("Ошибка: TELEGRAM_BOT_TOKEN пустой в backend/.env");
    process.exit(1);
  }

  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const me = await meRes.json().catch(() => ({}));
  if (!me.ok) {
    console.error("Telegram getMe — токен неверный или сеть недоступна:", me);
    process.exit(1);
  }
  console.log("getMe OK, бот:", `@${me.result?.username ?? "?"}`);

  const r = await sendTelegramMessage(
    "🧪 Тест backend/scripts/telegram-test.mjs — если это видно, переменные на сервере верные."
  );
  console.log("sendMessage:", r);
  process.exit(r.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
