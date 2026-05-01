import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { formatFixed } from "../format";
import { ensureArray } from "../guards";
import { useAuth } from "../context/AuthContext";

type RecipeRow = {
  id: number;
  name: string;
  type: string;
  output_quantity: number;
  output_unit: string;
  output_stock_item_id: number | null;
  comment: string | null;
  is_active: number;
  batch_cost_estimate: number;
};

type RecipeItem = {
  id?: number;
  stock_item_id: number;
  ingredient_name: string;
  quantity: number;
  unit: string;
  stock_name?: string;
  stock_unit?: string;
};

type StockItem = { id: number; name: string; unit: string };

const emptyItem = (): RecipeItem => ({
  stock_item_id: 0,
  ingredient_name: "",
  quantity: 0,
  unit: "г",
});

export default function Recipes() {
  const { token } = useAuth();
  const [list, setList] = useState<RecipeRow[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [meta, setMeta] = useState<{ ingredient_units: string[]; recipe_types: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("база");
  const [output_quantity, setOutputQuantity] = useState("5");
  const [output_unit, setOutputUnit] = useState("л");
  const [comment, setComment] = useState("");
  const [is_active, setIsActive] = useState(true);
  const [items, setItems] = useState<RecipeItem[]>([emptyItem()]);

  const load = useCallback(async () => {
    if (!token) return;
    const [data, st, m] = await Promise.all([
      apiFetch<RecipeRow[]>("/admin/recipes", { token }),
      apiFetch<StockItem[]>("/admin/stock", { token }),
      apiFetch<{ ingredient_units: string[]; recipe_types: string[] }>("/admin/recipes/meta/units", { token }),
    ]);
    setList(ensureArray(data));
    setStock(ensureArray(st));
    setMeta(m);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void load().catch((e) => setErr(String(e.message)));
  }, [token, load]);

  const openNew = () => {
    setEditingId("new");
    setName("");
    setType("база");
    setOutputQuantity("5");
    setOutputUnit("л");
    setComment("");
    setIsActive(true);
    setItems([emptyItem()]);
    setErr(null);
  };

  const openEdit = async (id: number) => {
    if (!token) return;
    setErr(null);
    try {
      const r = await apiFetch<{
        id: number;
        name: string;
        type: string;
        output_quantity: number;
        output_unit: string;
        comment: string | null;
        is_active: number;
        items: RecipeItem[];
      }>(`/admin/recipes/${id}`, { token });
      setEditingId(id);
      setName(r.name);
      setType(r.type);
      setOutputQuantity(String(r.output_quantity));
      setOutputUnit(r.output_unit);
      setComment(r.comment || "");
      setIsActive(!!r.is_active);
      const ri = ensureArray<RecipeItem>(r.items);
      setItems(
        ri.length
          ? ri.map((it) => ({
              stock_item_id: it.stock_item_id,
              ingredient_name: it.ingredient_name,
              quantity: it.quantity,
              unit: it.unit,
            }))
          : [emptyItem()]
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const save = async () => {
    if (!token || editingId === null) return;
    setErr(null);
    const cleanItems = items
      .filter((it) => it.stock_item_id && it.ingredient_name.trim() && Number(it.quantity) > 0)
      .map((it) => ({
        stock_item_id: Number(it.stock_item_id),
        ingredient_name: it.ingredient_name.trim(),
        quantity: Number(String(it.quantity).replace(",", ".")),
        unit: it.unit.trim() || "г",
      }));
    if (!name.trim()) {
      setErr("Укажите название");
      return;
    }
    const outq = Number(String(output_quantity).replace(",", "."));
    if (!Number.isFinite(outq) || outq <= 0) {
      setErr("Укажите выход смеси");
      return;
    }
    if (!cleanItems.length) {
      setErr("Добавьте хотя бы один ингредиент");
      return;
    }

    const body = {
      name: name.trim(),
      type: type.trim() || "база",
      output_quantity: outq,
      output_unit: output_unit.trim() || "л",
      comment: comment.trim() || null,
      is_active,
      items: cleanItems,
    };

    try {
      if (editingId === "new") {
        await apiFetch("/admin/recipes", { method: "POST", token, body: JSON.stringify(body) });
      } else {
        await apiFetch(`/admin/recipes/${editingId}`, { method: "PUT", token, body: JSON.stringify(body) });
      }
      setEditingId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const remove = async (id: number) => {
    if (!token || !confirm("Удалить рецепт?")) return;
    setErr(null);
    try {
      await apiFetch(`/admin/recipes/${id}`, { method: "DELETE", token });
      if (editingId === id) setEditingId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const copy = async (id: number) => {
    if (!token) return;
    setErr(null);
    try {
      await apiFetch(`/admin/recipes/${id}/copy`, { method: "POST", token, body: JSON.stringify({}) });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const toggleActive = async (r: RecipeRow) => {
    if (!token) return;
    setErr(null);
    try {
      const full = await apiFetch<{
        items: { stock_item_id: number; ingredient_name: string; quantity: number; unit: string }[];
      }>(`/admin/recipes/${r.id}`, { token });
      await apiFetch(`/admin/recipes/${r.id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          name: r.name,
          type: r.type,
          output_quantity: r.output_quantity,
          output_unit: r.output_unit,
          comment: r.comment,
          is_active: !r.is_active,
          items: ensureArray<{
            stock_item_id: number;
            ingredient_name: string;
            quantity: number;
            unit: string;
          }>(full.items).map((it) => ({
            stock_item_id: it.stock_item_id,
            ingredient_name: it.ingredient_name,
            quantity: it.quantity,
            unit: it.unit,
          })),
        }),
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const units = meta?.ingredient_units ?? ["л", "мл", "кг", "г", "шт", "уп"];
  const types = meta?.recipe_types ?? ["база", "дополнение", "прочее"];

  if (!token) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Рецепты</h1>
        <div className="flex gap-2 text-sm">
          <Link to="/mix-production" className="text-info">
            Производство смеси
          </Link>
          <button type="button" onClick={openNew} className="text-info">
            + Рецепт
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Себестоимость оценивается по последним ценам прихода на склад. Кассир рецепты не видит — только админка.
      </p>

      {err && <p className="text-sm text-expense">{err}</p>}

      <div className="space-y-2">
        {list.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-slate-500">
                {r.type} · выход {r.output_quantity} {r.output_unit} · ~{formatFixed(r.batch_cost_estimate, 2)} сом (партия) ·{" "}
                {r.is_active ? (
                  <span className="text-income">активен</span>
                ) : (
                  <span className="text-expense">выкл.</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => void openEdit(r.id)}
                className="rounded-lg bg-info-muted px-2 py-1 text-xs font-medium text-info"
              >
                Изменить
              </button>
              <button type="button" onClick={() => void copy(r.id)} className="rounded-lg px-2 py-1 text-xs text-slate-600">
                Копия
              </button>
              <button
                type="button"
                onClick={() => void toggleActive(r)}
                className="rounded-lg px-2 py-1 text-xs text-slate-600"
              >
                {r.is_active ? "Отключить" : "Включить"}
              </button>
              <button
                type="button"
                onClick={() => void remove(r.id)}
                className="rounded-lg px-2 py-1 text-xs text-expense"
              >
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingId !== null && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="mb-2 text-sm font-semibold">{editingId === "new" ? "Новый рецепт" : "Редактирование"}</h2>
          <div className="grid gap-2">
            <input
              placeholder="Название рецепта"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            />
            <div className="grid grid-cols-2 gap-2">
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} />
                Активен
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="Выход (число)"
                value={output_quantity}
                onChange={(e) => setOutputQuantity(e.target.value)}
                className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              />
              <select
                value={output_unit}
                onChange={(e) => setOutputUnit(e.target.value)}
                className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
              >
                {["л", "мл", "кг", "г"].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              placeholder="Комментарий"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            />

            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Ингредиенты</div>
            {items.map((it, idx) => (
              <div key={idx} className="grid gap-1 rounded-xl border border-slate-100 p-2 dark:border-slate-700">
                <select
                  value={it.stock_item_id || ""}
                  onChange={(e) => {
                    const sid = Number(e.target.value);
                    const s = stock.find((x) => x.id === sid);
                    const next = [...items];
                    next[idx] = {
                      ...next[idx],
                      stock_item_id: sid,
                      ingredient_name: s?.name || next[idx].ingredient_name,
                    };
                    setItems(next);
                  }}
                  className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="">— склад —</option>
                  {stock.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.unit})
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Название в рецепте"
                  value={it.ingredient_name}
                  onChange={(e) => {
                    const next = [...items];
                    next[idx] = { ...next[idx], ingredient_name: e.target.value };
                    setItems(next);
                  }}
                  className="rounded-lg border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                />
                <div className="flex gap-1">
                  <input
                    placeholder="Кол-во"
                    value={it.quantity || ""}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], quantity: Number(e.target.value.replace(",", ".")) };
                      setItems(next);
                    }}
                    className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                  <select
                    value={it.unit}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], unit: e.target.value };
                      setItems(next);
                    }}
                    className="w-24 rounded-lg border px-1 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    {units.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setItems(items.filter((_, i) => i !== idx))}
                    className="text-expense"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setItems([...items, emptyItem()])}
              className="text-left text-sm text-info"
            >
              + строка
            </button>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => void save()}
                className="flex-1 rounded-xl bg-income py-2.5 font-semibold text-white"
              >
                Сохранить
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="rounded-xl border px-4 py-2">
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
