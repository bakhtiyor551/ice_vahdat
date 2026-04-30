import crypto from "crypto";

/**
 * Проверка initData от Telegram Web App.
 * @see https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
export function verifyTelegramWebAppInitData(initData, botToken) {
  if (!initData || !botToken) {
    throw new Error("initData и токен бота обязательны");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Нет hash в initData");

  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push([k, v]);
  }
  pairs.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (calculated !== hash) {
    throw new Error("Подпись Telegram недействительна");
  }

  const authDate = params.get("auth_date");
  if (authDate) {
    const ageSec = Math.floor(Date.now() / 1000) - Number(authDate);
    if (ageSec > 86400) {
      throw new Error("initData устарел (больше 24 ч)");
    }
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Нет user в initData");
  const user = JSON.parse(userRaw);
  return { user, authDate: authDate ? Number(authDate) : null };
}
