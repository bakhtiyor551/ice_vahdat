import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from "@capacitor-community/sqlite";

const DB_NAME = "kassa_db";
const sqlite = new SQLiteConnection(CapacitorSQLite);

let dbConn: SQLiteDBConnection | null = null;

export async function initLocalDb(): Promise<void> {
  if (Capacitor.getPlatform() === "web") {
    const { defineCustomElements } = await import("jeep-sqlite/loader");
    defineCustomElements(window);
    const jeepEl = document.createElement("jeep-sqlite");
    jeepEl.setAttribute("autoSave", "true");
    const wasmPath = `${import.meta.env.BASE_URL}assets`.replace(/\/{2,}/g, "/");
    jeepEl.setAttribute("wasm-path", wasmPath);
    document.body.appendChild(jeepEl);
    await customElements.whenDefined("jeep-sqlite");
    await sqlite.initWebStore();
  }

  try {
    await sqlite.checkConnectionsConsistency();
  } catch {
    /* empty */
  }

  const exist = await sqlite.isConnection(DB_NAME, false);
  if (!exist.result) {
    dbConn = await sqlite.createConnection(DB_NAME, false, "no-encryption", 1, false);
  } else {
    dbConn = await sqlite.retrieveConnection(DB_NAME, false);
  }
  await dbConn.open();

  const ddl = [
    `CREATE TABLE IF NOT EXISTS credentials (
      phone TEXT PRIMARY KEY,
      pin_fp TEXT NOT NULL,
      cashier_id INTEGER NOT NULL,
      name TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS token_store (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS current_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      phone TEXT NOT NULL,
      cashier_id INTEGER NOT NULL,
      name TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      image TEXT,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      local_id TEXT UNIQUE NOT NULL,
      cashier_id INTEGER NOT NULL,
      total_amount REAL NOT NULL,
      payment_type TEXT NOT NULL,
      client_amount REAL,
      change_amount REAL,
      payment_meta TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id TEXT NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      local_id TEXT UNIQUE NOT NULL,
      cashier_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      payment_type TEXT NOT NULL,
      comment TEXT,
      photo_path TEXT,
      created_at TEXT NOT NULL,
      sync_status TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  ];
  for (const sql of ddl) {
    await dbConn.execute(sql);
  }

  try {
    await dbConn.execute("ALTER TABLE products ADD COLUMN image TEXT");
  } catch {
    /* колонка уже есть */
  }
}

function conn() {
  if (!dbConn) throw new Error("DB not initialized");
  return dbConn;
}

export async function qAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await conn().query(sql, params);
  return (res?.values as T[]) || [];
}

export async function qRun(sql: string, params: unknown[] = []): Promise<void> {
  await conn().run(sql, params);
}

export async function saveToken(token: string | null): Promise<void> {
  await qRun("DELETE FROM token_store");
  if (token) await qRun("INSERT INTO token_store (id, access_token) VALUES (1, ?)", [token]);
}

export async function getToken(): Promise<string | null> {
  const rows = await qAll<{ access_token: string }>("SELECT access_token FROM token_store WHERE id = 1");
  return rows[0]?.access_token ?? null;
}

export async function saveSession(phone: string, cashierId: number, name: string): Promise<void> {
  await qRun("DELETE FROM current_session");
  await qRun("INSERT INTO current_session (id, phone, cashier_id, name) VALUES (1,?,?,?)", [
    phone,
    cashierId,
    name,
  ]);
}

export async function clearSession(): Promise<void> {
  await qRun("DELETE FROM current_session");
  await saveToken(null);
}

export async function getSession() {
  const rows = await qAll<{ phone: string; cashier_id: number; name: string }>(
    "SELECT phone, cashier_id, name FROM current_session WHERE id = 1"
  );
  return rows[0] ?? null;
}

export async function saveCredentials(
  phone: string,
  pinFp: string,
  cashierId: number,
  name: string
): Promise<void> {
  await qRun(
    `INSERT OR REPLACE INTO credentials (phone, pin_fp, cashier_id, name) VALUES (?,?,?,?)`,
    [phone, pinFp, cashierId, name]
  );
}

export async function getCredentials(phone: string) {
  const rows = await qAll<{ pin_fp: string; cashier_id: number; name: string }>(
    "SELECT pin_fp, cashier_id, name FROM credentials WHERE phone = ?",
    [phone]
  );
  return rows[0] ?? null;
}

export async function closeDb(): Promise<void> {
  if (dbConn) {
    await dbConn.close();
    await sqlite.closeConnection(DB_NAME, false);
    dbConn = null;
  }
}
