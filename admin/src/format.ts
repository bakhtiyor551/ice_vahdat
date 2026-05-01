/** Числа из API/SQLite могут быть null/пропущены — безопасно для UI */
export function safeNum(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatFixed(value: unknown, fractionDigits = 0): string {
  return safeNum(value).toFixed(fractionDigits);
}
