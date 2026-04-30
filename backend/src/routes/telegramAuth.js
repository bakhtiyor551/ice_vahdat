import { Router } from "express";
import { verifyTelegramWebAppInitData } from "../lib/telegramWebAppAuth.js";
import { signAdminToken } from "../middleware/adminAuth.js";

export const telegramAuthRouter = Router();

telegramAuthRouter.post("/auth", (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return res.status(503).json({ error: "TELEGRAM_BOT_TOKEN не задан в .env" });
  }

  const initData = req.body?.initData;
  if (!initData || typeof initData !== "string") {
    return res.status(400).json({ error: "Передайте initData в теле запроса" });
  }

  try {
    const { user } = verifyTelegramWebAppInitData(initData, botToken);
    const tgId = user?.id;
    if (!tgId) {
      return res.status(400).json({ error: "Нет id пользователя Telegram" });
    }

    const allowed = parseAdminIds();
    if (allowed.length > 0 && !allowed.includes(Number(tgId))) {
      return res.status(403).json({ error: "Доступ только для указанных администраторов (TELEGRAM_ADMIN_IDS)" });
    }

    const token = signAdminToken({
      sub: String(tgId),
      tg_id: tgId,
      name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Admin",
    });

    res.json({
      token,
      admin: {
        id: tgId,
        name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Admin",
        username: user.username ?? null,
      },
    });
  } catch (e) {
    console.error("[telegram auth]", e);
    res.status(401).json({ error: String(e.message || e) });
  }
});

function parseAdminIds() {
  const raw = process.env.TELEGRAM_ADMIN_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}
