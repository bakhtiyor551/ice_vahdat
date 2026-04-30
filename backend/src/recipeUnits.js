/** Нормализация единиц для списания и производства (л/мл, кг/г, штуки). */

function normStr(u) {
  return String(u || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "");
}

/** Семья единицы: объём | масса | счёт */
export function unitFamily(unit) {
  const u = normStr(unit);
  if (["л", "l", "liter", "литр", "мл", "ml"].includes(u)) return "volume";
  if (["кг", "kg", "г", "g", "грамм", "гр"].includes(u)) return "mass";
  return "count";
}

/** Приводит количество к «базе»: литры, килограммы, или штуки. */
export function toBase(amount, unit) {
  const u = normStr(unit);
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;

  if (["мл", "ml"].includes(u)) return { family: "volume", base: n / 1000 };
  if (["л", "l", "liter", "литр"].includes(u)) return { family: "volume", base: n };
  if (["г", "g", "грамм", "гр"].includes(u)) return { family: "mass", base: n / 1000 };
  if (["кг", "kg"].includes(u)) return { family: "mass", base: n };
  return { family: "count", base: n };
}

/** База → количество в целевой единице (той же семьи). */
export function fromBase(family, baseValue, targetUnit) {
  const u = normStr(targetUnit);
  if (family === "volume") {
    if (["мл", "ml"].includes(u)) return baseValue * 1000;
    return baseValue;
  }
  if (family === "mass") {
    if (["г", "g", "грамм", "гр"].includes(u)) return baseValue * 1000;
    return baseValue;
  }
  return baseValue;
}

/**
 * Сколько нужно списать в единицах позиции склада (stockItem.unit),
 * чтобы взять `amount` единиц `fromUnit`.
 */
export function convertToStockUnit(amount, fromUnit, stockUnit) {
  const a = toBase(amount, fromUnit);
  if (!a) return null;
  const su = toBase(1, stockUnit);
  if (!su) return null;
  if (a.family === "count" && su.family === "count") {
    return a.base;
  }
  if (a.family !== su.family) {
    if (a.family === "volume" && su.family === "mass") {
      return a.base;
    }
    if (a.family === "mass" && su.family === "volume") {
      return a.base;
    }
    return null;
  }
  return fromBase(su.family, a.base, stockUnit);
}

/**
 * Сравнение выхода рецепта и фактического объёма (масштаб партии).
 * Разные семьи: литры смеси ↔ кг на складе считаем 1:1 (≈ плотность воды).
 */
export function batchScaleFactor(recipeOutputQty, recipeOutputUnit, actualQty, actualUnit) {
  const r = toBase(recipeOutputQty, recipeOutputUnit);
  const a = toBase(actualQty, actualUnit);
  if (!r || !a || r.base <= 0 || a.base <= 0) return null;
  if (r.family === a.family) {
    return a.base / r.base;
  }
  if (
    (r.family === "volume" && a.family === "mass") ||
    (r.family === "mass" && a.family === "volume")
  ) {
    return a.base / r.base;
  }
  return null;
}
