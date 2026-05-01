#!/usr/bin/env node
/**
 * Полный сброс SQLite (удаление файла БД и -wal/-shm).
 *
 * Из каталога backend:
 *   RESET_DB_CONFIRM=yes npm run reset-db
 *
 * Затем запустите API (создастся схема). По желанию тестовые данные:
 *   npm run init-db
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import "../src/loadEnv.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

if (process.env.RESET_DB_CONFIRM !== "yes") {
  console.error(
    "Отказ: удаление необратимо. Повторите с переменной окружения:\n" +
      "  RESET_DB_CONFIRM=yes npm run reset-db"
  );
  process.exit(1);
}

const dbPath = process.env.SQLITE_PATH
  ? path.resolve(root, process.env.SQLITE_PATH)
  : path.join(root, "data", "server.sqlite");

function rm(p) {
  try {
    fs.unlinkSync(p);
    console.log("удалено:", p);
  } catch (e) {
    if (e && e.code !== "ENOENT") console.warn("пропуск:", p, String(e.message || e));
  }
}

console.log("Файл БД:", dbPath);
rm(dbPath);
rm(`${dbPath}-wal`);
rm(`${dbPath}-shm`);

console.log("\nГотово. Перезапустите backend. Опционально: npm run init-db\n");
