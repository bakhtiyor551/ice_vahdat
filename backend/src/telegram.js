/**
 * Уведомления в Telegram. Нужны переменные в файле backend/.env (не только .env.example):
 * TELEGRAM_BOT_TOKEN — токен от @BotFather
 * TELEGRAM_CHAT_ID — ваш id (например у @userinfobot) или id группы (со знаком минус)
 * Бот должен иметь возможность писать: в личке нажмите /start у бота.
 */

function normalizeEnvStr(value) {
  if (value == null || value === "") return "";
  let s = String(value).trim();
  if (
    s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Тот же токен, что для sendMessage и проверки initData (кавычки в .env снимаются). */
export function telegramToken() {
  return normalizeEnvStr(process.env.TELEGRAM_BOT_TOKEN);
}

function telegramChatIdRaw() {
  return normalizeEnvStr(process.env.TELEGRAM_CHAT_ID);
}

export function formatSaleReceipt(body, cashierName) {
  const total = Number(body.total_amount);
  const items = Array.isArray(body.items) ? body.items : [];
  const lines = [
    "🧾 Продажа",
    `Итого: ${total} сомони`,
    `Тип оплаты: ${body.payment_type || "cash"}`,
    `Кассир: ${cashierName}`,
  ];
  if (items.length) {
    lines.push("");
    lines.push("Позиции:");
    for (const it of items) {
      const name = String(it.product_name || "");
      const q = Number(it.quantity);
      const t = Number(it.total);
      lines.push(`• ${name} ×${q} = ${t} сомони`);
    }
  }
  if (body.payment_type === "cash") {
    if (body.client_amount != null && body.client_amount !== "") {
      lines.push(`От клиента: ${Number(body.client_amount)} сомони`);
    }
    if (body.change_amount != null && body.change_amount !== "") {
      lines.push(`Сдача: ${Number(body.change_amount)} сомони`);
    }
  }
  if (body.payment_type === "debt" && body.payment_meta) {
    try {
      const meta = typeof body.payment_meta === "string" ? JSON.parse(body.payment_meta) : body.payment_meta;
      if (meta?.debt_comment) {
        lines.push(`Долг / комментарий: ${String(meta.debt_comment)}`);
      }
    } catch {
      /* ignore */
    }
  }
  return lines.join("\n");
}

export function formatExpenseReceipt(body) {
  const amt = Number(body.amount);
  const cat = String(body.category || "");
  return [`💸 Расход`, `Сумма: ${amt} сомони`, `Категория: ${cat}`].join("\n");
}

export async function sendTelegramMessage(text) {
  const token = telegramToken();
  const chatIdRaw = telegramChatIdRaw();
  if (!token || !chatIdRaw) {
    const reason =
      "TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы в backend/.env (на сервере, где запущен Node). После правки перезапустите процесс.";
    console.warn("[telegram]", reason);
    return { ok: false, skipped: true, reason };
  }

  const chatId = /^-?\d+$/.test(chatIdRaw) ? Number(chatIdRaw) : chatIdRaw;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
  } catch (e) {
    console.error("[telegram] fetch failed:", e);
    return { ok: false, error: String(e) };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    console.error(
      "[telegram] sendMessage:",
      data.description || res.statusText,
      data.error_code != null ? `(code ${data.error_code})` : "",
      data
    );
    return { ok: false, data };
  }
  console.log("[telegram] сообщение доставлено в Telegram");
  return { ok: true };
}

/** @deprecated используйте sendTelegramMessage */
export async function notifyTelegram(text) {
  return sendTelegramMessage(text);
}

export function isTelegramConfigured() {
  return Boolean(telegramToken() && telegramChatIdRaw());
}
