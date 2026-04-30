import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, db } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

initDb();

const pin = process.env.SEED_PIN || "1234";
const phone = process.env.SEED_PHONE || "900000001";
const name = process.env.SEED_NAME || "Али";
const hash = bcrypt.hashSync(pin, 10);

const exists = db.prepare("SELECT id FROM cashiers WHERE phone = ?").get(phone);
if (!exists) {
  db.prepare("INSERT INTO cashiers (phone, pin_hash, name) VALUES (?, ?, ?)").run(phone, hash, name);
  console.log("Создан кассир:", phone, "PIN:", pin, "Имя:", name);
} else {
  console.log("Кассир уже есть:", phone);
}

const products = [
  ["Ваниль", 10, "Классика"],
  ["Шоколад", 10, "Классика"],
  ["Клубника", 12, "Фрукты"],
  ["Фисташка", 15, "Премиум"],
];

const ins = db.prepare(
  `INSERT INTO products (name, price, category, is_active, updated_at) VALUES (?, ?, ?, 1, datetime('now'))`
);
for (const [n, p, c] of products) {
  const row = db.prepare("SELECT id FROM products WHERE name = ?").get(n);
  if (!row) ins.run(n, p, c);
}

console.log("Готово. БД:", path.join(__dirname, "..", "data", "server.sqlite"));
