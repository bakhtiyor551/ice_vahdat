import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const phone = String(req.body?.phone || "").replace(/\D/g, "");
  const pin = String(req.body?.pin || "");
  if (!phone || !pin) {
    return res.status(400).json({ error: "Телефон и PIN обязательны" });
  }
  const row = db.prepare(
    "SELECT id, phone, pin_hash, name, COALESCE(is_active, 1) as is_active FROM cashiers WHERE phone = ?"
  ).get(phone);
  if (!row || !bcrypt.compareSync(pin, row.pin_hash)) {
    return res.status(401).json({ error: "Неверный телефон или PIN" });
  }
  if (row.is_active === 0) {
    return res.status(403).json({ error: "Кассир отключён" });
  }
  const token = signToken({ sub: row.id, phone: row.phone, name: row.name });
  res.json({
    token,
    cashier: { id: row.id, phone: row.phone, name: row.name },
  });
});
