import { db } from "./db.js";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Молоко",
  "Сахар",
  "Сливки",
  "Сухое молоко",
  "Ванилин",
  "Стаканчики",
  "Рожки",
  "Ложки",
  "Салфетки",
  "Упаковка мороженого 2 сомони",
  "Упаковка мороженого 3 сомони",
  "Упаковка мороженого 5 сомони",
  "Упаковка мороженого 7 сомони",
  "Доставка",
  "Ремонт",
  "Аренда",
  "Электричество",
  "Вода",
  "Реклама",
  "Прочее",
];

export function initExpenseCategories() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const ins = db.prepare(
    `INSERT OR IGNORE INTO expense_categories (name, sort_order) VALUES (?, ?)`
  );
  DEFAULT_EXPENSE_CATEGORIES.forEach((name, i) => {
    ins.run(name, i);
  });

  const fromExpenses = db
    .prepare(
      `SELECT DISTINCT TRIM(category) AS name FROM expenses
       WHERE category IS NOT NULL AND TRIM(category) != ''`
    )
    .all();
  for (const row of fromExpenses) {
    ins.run(row.name, 900);
  }
}

export function listExpenseCategoryNames() {
  return db
    .prepare(`SELECT name FROM expense_categories ORDER BY sort_order, id`)
    .all()
    .map((r) => r.name);
}

export function addExpenseCategory(rawName) {
  const name = String(rawName || "").trim();
  if (!name) {
    throw new Error("Название категории обязательно");
  }
  if (name.length > 120) {
    throw new Error("Слишком длинное название");
  }
  try {
    db.prepare(`INSERT INTO expense_categories (name, sort_order) VALUES (?, ?)`).run(name, 500);
  } catch (e) {
    if (String(e.message || e).includes("UNIQUE")) {
      throw new Error("Такая категория уже есть");
    }
    throw e;
  }
  return name;
}
