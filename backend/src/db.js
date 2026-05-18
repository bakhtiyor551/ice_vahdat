import "./loadEnv.js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initExpenseCategories } from "./expenseCategories.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "..", "data", "server.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS cashiers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      pin_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      local_id TEXT UNIQUE NOT NULL,
      cashier_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      payment_type TEXT NOT NULL,
      client_amount REAL,
      change_amount REAL,
      payment_meta TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id TEXT NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      local_id TEXT UNIQUE NOT NULL,
      cashier_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      comment TEXT,
      photo_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
    );

    CREATE TABLE IF NOT EXISTS stock_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      unit TEXT NOT NULL DEFAULT 'шт',
      quantity REAL NOT NULL DEFAULT 0,
      min_quantity REAL NOT NULL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      unit_price REAL,
      supplier TEXT,
      reason TEXT,
      comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES stock_items(id)
    );
  `);

  seedStockItemsIfEmpty();

  try {
    db.exec(`ALTER TABLE products ADD COLUMN image TEXT`);
  } catch {
    /* колонка уже есть */
  }

  try {
    db.exec(`ALTER TABLE cashiers ADD COLUMN is_active INTEGER DEFAULT 1`);
  } catch {
    /* колонка уже есть */
  }

  try {
    db.exec(`ALTER TABLE cashiers ADD COLUMN daily_salary_rate REAL DEFAULT 45`);
  } catch {
    /* колонка уже есть */
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      id TEXT PRIMARY KEY,
      cashier_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      account_id INTEGER NOT NULL,
      comment TEXT,
      paid_by TEXT,
      month_ym TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (cashier_id) REFERENCES cashiers(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS cashier_salary_month_mode (
      cashier_id INTEGER NOT NULL,
      month_ym TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('auto', 'manual')),
      PRIMARY KEY (cashier_id, month_ym),
      FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
    );

    CREATE TABLE IF NOT EXISTS cashier_salary_work_days (
      cashier_id INTEGER NOT NULL,
      month_ym TEXT NOT NULL,
      work_date TEXT NOT NULL,
      PRIMARY KEY (cashier_id, month_ym, work_date),
      FOREIGN KEY (cashier_id) REFERENCES cashiers(id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'база',
      output_quantity REAL NOT NULL,
      output_unit TEXT NOT NULL,
      output_stock_item_id INTEGER,
      comment TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (output_stock_item_id) REFERENCES stock_items(id)
    );

    CREATE TABLE IF NOT EXISTS recipe_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      stock_item_id INTEGER NOT NULL,
      ingredient_name TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
    );

    CREATE TABLE IF NOT EXISTS recipe_productions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipe_id INTEGER NOT NULL,
      output_quantity REAL NOT NULL,
      output_unit TEXT NOT NULL,
      total_cost REAL,
      created_at TEXT DEFAULT (datetime('now')),
      comment TEXT,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id)
    );

    CREATE TABLE IF NOT EXISTS product_portion_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      stock_item_id INTEGER NOT NULL,
      ingredient_name TEXT,
      quantity REAL NOT NULL,
      unit TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (stock_item_id) REFERENCES stock_items(id)
    );
  `);

  try {
    db.exec(`ALTER TABLE products ADD COLUMN recipe_id INTEGER REFERENCES recipes(id)`);
  } catch {
    /* колонка уже есть */
  }

  try {
    db.exec(`ALTER TABLE products ADD COLUMN stock_item_id INTEGER REFERENCES stock_items(id)`);
  } catch {
    /* колонка уже есть */
  }

  try {
    db.exec(`ALTER TABLE products ADD COLUMN stock_writeoff_qty REAL`);
  } catch {
    /* колонка уже есть */
  }

  seedExtraStockItems();
  seedPackagingStock();

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      balance REAL NOT NULL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS account_transactions (
      id TEXT PRIMARY KEY,
      account_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      amount REAL NOT NULL,
      direction TEXT NOT NULL,
      source_type TEXT,
      source_id TEXT,
      comment TEXT,
      created_by_cashier_id INTEGER,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (created_by_cashier_id) REFERENCES cashiers(id)
    );

    CREATE TABLE IF NOT EXISTS account_transfers (
      id TEXT PRIMARY KEY,
      from_account_id INTEGER NOT NULL,
      to_account_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (from_account_id) REFERENCES accounts(id),
      FOREIGN KEY (to_account_id) REFERENCES accounts(id)
    );
  `);

  seedLedgerAccounts();
  initExpenseCategories();
}

function seedLedgerAccounts() {
  const rows = [
    ["Наличная касса", "cash", "cash", 1],
    ["Карта", "card", "card", 2],
    ["Перевод", "transfer", "transfer", 3],
    ["Долги клиентов", "debt", "debt", 4],
    ["Деньги у владельца", "owner", "owner", 5],
  ];
  const ins = db.prepare(
    `INSERT OR IGNORE INTO accounts (name, code, type, sort_order, balance, is_active, updated_at)
     VALUES (?, ?, ?, ?, 0, 1, datetime('now'))`
  );
  for (const [name, code, type, ord] of rows) {
    ins.run(name, code, type, ord);
  }
}

function seedStockItemsIfEmpty() {
  const n = db.prepare(`SELECT COUNT(*) as c FROM stock_items`).get();
  if (n && n.c > 0) return;

  const defaults = [
    ["Молоко", "л", 0, 5],
    ["Сахар", "кг", 0, 2],
    ["Сливки", "л", 0, 2],
    ["Сухое молоко", "кг", 0, 1],
    ["Сухие сливки", "кг", 0, 0.5],
    ["Мёд", "кг", 0, 0.2],
    ["Дракон", "г", 0, 50],
    ["Ванилин", "г", 0, 100],
    ["Стабилизатор", "кг", 0, 0.5],
    ["Какао", "кг", 0, 0],
    ["Шоколад", "кг", 0, 0],
    ["Стаканчики", "шт", 0, 500],
    ["Рожки", "шт", 0, 200],
    ["Ложки", "шт", 0, 300],
    ["Салфетки", "уп", 0, 10],
    ["Готовая смесь", "л", 0, 5],
  ];
  const ins = db.prepare(
    `INSERT OR IGNORE INTO stock_items (name, unit, quantity, min_quantity, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
  );
  for (const row of defaults) {
    ins.run(row[0], row[1], row[2], row[3]);
  }
}

/** Доп. позиции после первого запуска (миграция имён/единиц). */
function seedExtraStockItems() {
  const rows = [
    ["Сухие сливки", "кг", 0, 0.5],
    ["Мёд", "кг", 0, 0.2],
    ["Дракон", "г", 0, 50],
    ["Какао", "кг", 0, 0],
    ["Шоколад", "кг", 0, 0],
  ];
  const ins = db.prepare(
    `INSERT OR IGNORE INTO stock_items (name, unit, quantity, min_quantity, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
  );
  for (const row of rows) {
    ins.run(row[0], row[1], row[2], row[3]);
  }
}

/** Упаковки мороженого по цене — для списания с кассы. */
function seedPackagingStock() {
  const rows = [
    ["Упаковка мороженого 2 сомони", "шт", 100, 15],
    ["Упаковка мороженого 3 сомони", "шт", 80, 15],
    ["Упаковка мороженого 5 сомони", "шт", 50, 10],
    ["Упаковка мороженого 7 сомони", "шт", 30, 10],
  ];
  const ins = db.prepare(
    `INSERT OR IGNORE INTO stock_items (name, unit, quantity, min_quantity, updated_at) VALUES (?, ?, ?, ?, datetime('now'))`
  );
  for (const row of rows) {
    ins.run(row[0], row[1], row[2], row[3]);
  }
}
