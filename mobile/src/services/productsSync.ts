import { apiFetch } from "./api";
import { qRun } from "./db";

type ProductRow = {
  id: number;
  name: string;
  price: number;
  image?: string | null;
  category: string | null;
  is_active: number;
  updated_at: string;
};

/** Без токена кассы каталог берётся с публичного GET /catalog/products. */
export async function pullProducts(token: string | null): Promise<void> {
  const path = token ? "/products" : "/catalog/products";
  const rows = (await apiFetch(path, token ? { token } : {})) as ProductRow[];
  for (const p of rows) {
    await qRun(
      `INSERT OR REPLACE INTO products (id, name, price, image, category, is_active, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [p.id, p.name, p.price, p.image ?? null, p.category ?? "", p.is_active, p.updated_at]
    );
  }
}
