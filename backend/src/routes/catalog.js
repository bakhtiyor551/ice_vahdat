import { Router } from "express";
import { db } from "../db.js";

/** Публичное чтение каталога для мобильной кассы без JWT (только активные товары). */
export const catalogRouter = Router();

catalogRouter.get("/products", (_req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, price, image, category, is_active, updated_at FROM products WHERE is_active = 1 ORDER BY category, name`
      )
      .all();
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e.message || e) });
  }
});
