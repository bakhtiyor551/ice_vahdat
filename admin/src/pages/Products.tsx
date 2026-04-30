import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";

type Product = {
  id: number;
  name: string;
  price: number;
  category: string | null;
  image: string | null;
  is_active: number;
  recipe_id?: number | null;
  stock_item_id?: number | null;
  stock_writeoff_qty?: number | null;
};

type RecipeShort = { id: number; name: string };
type StockItem = { id: number; name: string; unit: string };

type PortionRow = {
  stock_item_id: number | "";
  quantity: string;
  unit: string;
  ingredient_name: string;
};

const emptyPortion = (): PortionRow => ({
  stock_item_id: "",
  quantity: "",
  unit: "г",
  ingredient_name: "",
});

export default function Products() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Product[]>([]);
  const [recipes, setRecipes] = useState<RecipeShort[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState("");
  const [is_active, setIsActive] = useState(true);
  const [recipe_id, setRecipeId] = useState<number | "">("");
  const [pack_stock_id, setPackStockId] = useState<number | "">("");
  const [pack_qty, setPackQty] = useState("1");
  const [portions, setPortions] = useState<PortionRow[]>([emptyPortion()]);

  const load = async () => {
    if (!token) return;
    const [data, rec, st] = await Promise.all([
      apiFetch<Product[]>("/admin/products", { token }),
      apiFetch<{ id: number; name: string }[]>("/admin/recipes", { token }),
      apiFetch<StockItem[]>("/admin/stock", { token }),
    ]);
    setRows(data);
    setRecipes(rec.map((r) => ({ id: r.id, name: r.name })));
    setStock(st);
  };

  useEffect(() => {
    if (!token) return;
    void load().catch((e) => setErr(String(e.message)));
  }, [token]);

  const openNew = () => {
    setEditing(null);
    setName("");
    setPrice("");
    setCategory("");
    setImage("");
    setIsActive(true);
    setRecipeId("");
    setPackStockId("");
    setPackQty("1");
    setPortions([emptyPortion()]);
  };

  const openEdit = async (p: Product) => {
    setEditing(p);
    setName(p.name);
    setPrice(String(p.price));
    setCategory(p.category || "");
    setImage(p.image || "");
    setIsActive(!!p.is_active);
    setRecipeId(p.recipe_id != null && p.recipe_id ? p.recipe_id : "");
    setPackStockId(p.stock_item_id != null && p.stock_item_id ? p.stock_item_id : "");
    setPackQty(
      p.stock_writeoff_qty != null && Number(p.stock_writeoff_qty) > 0
        ? String(p.stock_writeoff_qty)
        : "1"
    );

    if (!token) return;
    try {
      const pi = await apiFetch<
        { stock_item_id: number; quantity: number; unit: string; ingredient_name: string | null }[]
      >(`/admin/products/${p.id}/portion-items`, { token });
      if (pi.length) {
        setPortions(
          pi.map((x) => ({
            stock_item_id: x.stock_item_id,
            quantity: String(x.quantity),
            unit: x.unit,
            ingredient_name: x.ingredient_name || "",
          }))
        );
      } else {
        setPortions([emptyPortion()]);
      }
    } catch {
      setPortions([emptyPortion()]);
    }
  };

  const save = async () => {
    if (!token) return;
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        price: Number(price.replace(",", ".")),
        category: category.trim(),
        image: image.trim() || null,
        is_active: is_active,
        recipe_id: recipe_id === "" ? null : Number(recipe_id),
        stock_item_id: pack_stock_id === "" ? null : Number(pack_stock_id),
        stock_writeoff_qty:
          pack_stock_id === ""
            ? null
            : Math.max(0.0001, Number(String(pack_qty).replace(",", ".")) || 1),
      };
      let productId = editing?.id;
      if (editing) {
        await apiFetch(`/admin/products/${editing.id}`, {
          method: "PUT",
          token,
          body: JSON.stringify(body),
        });
      } else {
        const created = await apiFetch<{ id: number }>("/admin/products", {
          method: "POST",
          token,
          body: JSON.stringify(body),
        });
        productId = created.id;
      }

      if (productId != null) {
        const portionPayload = portions
          .filter((r) => r.stock_item_id !== "" && r.quantity.trim())
          .map((r) => ({
            stock_item_id: Number(r.stock_item_id),
            quantity: Number(String(r.quantity).replace(",", ".")),
            unit: r.unit.trim() || "г",
            ingredient_name: r.ingredient_name.trim() || null,
          }));
        await apiFetch(`/admin/products/${productId}/portion-items`, {
          method: "PUT",
          token,
          body: JSON.stringify({ items: portionPayload }),
        });
      }

      openNew();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const disable = async (p: Product) => {
    if (!token || !confirm("Отключить товар для кассы?")) return;
    try {
      await apiFetch(`/admin/products/${p.id}`, { method: "DELETE", token });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (!token) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Товары</h1>
        <button type="button" onClick={openNew} className="text-sm text-info">
          + Новый
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-2 text-sm font-semibold">{editing ? "Редактирование" : "Добавить товар"}</h2>
        <div className="grid gap-2">
          <input
            placeholder="Название"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Цена"
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Категория"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="URL фото (опционально)"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={is_active} onChange={(e) => setIsActive(e.target.checked)} />
            Активен (виден в кассе)
          </label>

          <div className="rounded-xl border border-slate-100 p-2 dark:border-slate-700">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Упаковка (склад)</div>
            <p className="mb-2 text-xs text-slate-500">
              При продаже списывается автоматически; при нехватке остаток может уйти в минус.
            </p>
            <label className="text-xs text-slate-500">Складская позиция для списания</label>
            <select
              value={pack_stock_id}
              onChange={(e) => setPackStockId(e.target.value ? Number(e.target.value) : "")}
              className="mt-0.5 w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">— не списывать упаковку —</option>
              {stock.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.unit})
                </option>
              ))}
            </select>
            <label className="mt-2 block text-xs text-slate-500">Количество за 1 продажу (шт и др.)</label>
            <input
              placeholder="1"
              value={pack_qty}
              onChange={(e) => setPackQty(e.target.value)}
              disabled={pack_stock_id === ""}
              className="mt-0.5 w-full rounded-xl border px-3 py-2 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">Рецепт смеси (для учёта)</label>
            <select
              value={recipe_id}
              onChange={(e) => setRecipeId(e.target.value ? Number(e.target.value) : "")}
              className="mt-0.5 w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="">— не выбран —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-xl border border-slate-100 p-2 dark:border-slate-700">
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Списание со склада на 1 проданную единицу
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Например: готовая смесь 150 г, стаканчик 1 шт, ложка 1 шт. Пустая таблица — без автоматического списания.
            </p>
            {portions.map((row, idx) => (
              <div key={idx} className="mb-2 grid gap-1 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
                <select
                  value={row.stock_item_id}
                  onChange={(e) => {
                    const sid = e.target.value ? Number(e.target.value) : "";
                    const s = stock.find((x) => x.id === sid);
                    const next = [...portions];
                    next[idx] = {
                      ...next[idx],
                      stock_item_id: sid,
                      ingredient_name: s?.name || next[idx].ingredient_name,
                    };
                    setPortions(next);
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
                <div className="flex gap-1">
                  <input
                    placeholder="Кол-во"
                    value={row.quantity}
                    onChange={(e) => {
                      const next = [...portions];
                      next[idx] = { ...next[idx], quantity: e.target.value };
                      setPortions(next);
                    }}
                    className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                  />
                  <select
                    value={row.unit}
                    onChange={(e) => {
                      const next = [...portions];
                      next[idx] = { ...next[idx], unit: e.target.value };
                      setPortions(next);
                    }}
                    className="w-24 rounded-lg border px-1 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                  >
                    {["л", "мл", "кг", "г", "шт", "уп"].map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setPortions(portions.filter((_, i) => i !== idx))}
                    className="text-expense"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setPortions([...portions, emptyPortion()])} className="text-sm text-info">
              + строка списания
            </button>
          </div>

          <button
            type="button"
            onClick={() => void save()}
            className="rounded-xl bg-income py-2.5 font-semibold text-white"
          >
            Сохранить
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-expense">{err}</p>}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                {p.image ? (
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-2xl">🍦</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.name}</div>
                <div className="text-income font-bold">{p.price} сом · {p.category || "—"}</div>
                <div className="text-xs text-slate-500">
                  {p.is_active ? "Активен" : "Отключён"}
                  {p.recipe_id ? ` · рецепт #${p.recipe_id}` : ""}
                  {p.stock_item_id
                    ? ` · склад: ${stock.find((s) => s.id === p.stock_item_id)?.name ?? "#" + p.stock_item_id} ×${p.stock_writeoff_qty ?? 1}`
                    : ""}
                </div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => openEdit(p)}
                className="flex-1 rounded-lg bg-info-muted py-1.5 text-sm font-medium text-info dark:bg-blue-950"
              >
                Изменить
              </button>
              {p.is_active ? (
                <button
                  type="button"
                  onClick={() => void disable(p)}
                  className="rounded-lg bg-expense-muted px-3 py-1.5 text-sm text-expense"
                >
                  Выкл.
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
