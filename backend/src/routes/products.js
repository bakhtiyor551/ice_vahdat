import { Router } from "express";
import { db } from "../db.js";
import { authMiddleware } from "../middleware/auth.js";

export const productsRouter = Router();
productsRouter.use(authMiddleware);

productsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, price, image, category, is_active, updated_at FROM products WHERE is_active = 1 ORDER BY category, name`
    )
    .all();
  res.json(rows);
});
