import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);

/** Должен совпадать с версией sql.js (см. overrides в package.json) и со сборкой jeep-sqlite. */
function resolveSqlWasmPath() {
  const candidates = [
    path.join(root, "node_modules", "sql.js", "dist", "sql-wasm.wasm"),
    path.join(
      root,
      "node_modules",
      "@capacitor-community",
      "sqlite",
      "node_modules",
      "jeep-sqlite",
      "node_modules",
      "sql.js",
      "dist",
      "sql-wasm.wasm"
    ),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  try {
    const dir = path.dirname(require.resolve("sql.js/package.json"));
    const p = path.join(dir, "dist", "sql-wasm.wasm");
    if (fs.existsSync(p)) return p;
  } catch {
    /* empty */
  }
  return null;
}

const src = resolveSqlWasmPath();
const destDir = path.join(root, "public", "assets");
const dest = path.join(destDir, "sql-wasm.wasm");

if (!src) {
  console.warn("copy-sql-wasm: sql-wasm.wasm not found (npm install sql.js?)");
  process.exit(0);
}
fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("copy-sql-wasm:", src, "-> public/assets/sql-wasm.wasm");
