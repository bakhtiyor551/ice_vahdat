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

/**
 * Подтягивает каталог с сервера и заменяет локальную таблицу — меню = актуальный ответ API.
 * Без токена: GET /catalog/products; с JWT кассы: GET /products.
 * При ошибке сети локальные строки не трогаем.
 */
export async function pullProducts(token: string | null): Promise<number> {
  const path = token ? "/products" : "/catalog/products";
  const rows = (await apiFetch(path, token ? { token } : {})) as ProductRow[];
  await qRun(`DELETE FROM products`);
  for (const p of rows) {
    await qRun(
      `INSERT INTO products (id, name, price, image, category, is_active, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [p.id, p.name, p.price, p.image ?? null, p.category ?? "", p.is_active, p.updated_at]
    );
  }
  return rows.length;
}
