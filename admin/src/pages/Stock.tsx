import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";

type StockItem = {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  min_quantity: number;
  status: "ok" | "low";
};

const REASONS = ["Испортилось", "Тест рецепта", "Бесплатно", "Ошибка", "Другое"];

export default function Stock() {
  const { token } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [inItem, setInItem] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [inQty, setInQty] = useState("");
  const [inUnit, setInUnit] = useState("кг");
  const [inPrice, setInPrice] = useState("");
  const [inSupplier, setInSupplier] = useState("");
  const [inComment, setInComment] = useState("");

  const [woItem, setWoItem] = useState<number | "">("");
  const [woQty, setWoQty] = useState("");
  const [woReason, setWoReason] = useState(REASONS[0]);
  const [woComment, setWoComment] = useState("");

  const [editMin, setEditMin] = useState<Record<number, string>>({});

  const load = async () => {
    if (!token) return;
    const data = await apiFetch<StockItem[]>("/admin/stock", { token });
    setItems(data);
  };

  useEffect(() => {
    if (!token) return;
    void load().catch((e) => setErr(String(e.message)));
  }, [token]);

  const income = async () => {
    if (!token) return;
    setErr(null);
    const qty = Number(inQty.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr("Укажите количество");
      return;
    }

    const payload: Record<string, unknown> = {
      quantity: qty,
      unit: inUnit.trim() || "шт",
    };
    if (inPrice.trim()) payload.unit_price = Number(inPrice.replace(",", "."));
    if (inSupplier.trim()) payload.supplier = inSupplier.trim();
    if (inComment.trim()) payload.comment = inComment.trim();

    if (inItem) {
      payload.item_id = Number(inItem);
    } else {
      const name = newName.trim();
      if (!name) {
        setErr("Выберите позицию в списке или введите название новой");
        return;
      }
      payload.item_name = name;
    }

    try {
      await apiFetch("/admin/stock/income", {
        method: "POST",
        token,
        body: JSON.stringify(payload),
      });
      setInQty("");
      setInPrice("");
      setInSupplier("");
      setInComment("");
      setNewName("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const writeOff = async () => {
    if (!token || woItem === "") return;
    setErr(null);
    try {
      await apiFetch("/admin/stock/write-off", {
        method: "POST",
        token,
        body: JSON.stringify({
          item_id: Number(woItem),
          quantity: Number(woQty.replace(",", ".")),
          reason: woReason,
          comment: woComment.trim() || undefined,
        }),
      });
      setWoQty("");
      setWoComment("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  const saveMin = async (id: number) => {
    if (!token) return;
    const v = editMin[id];
    if (v === undefined || v === "") return;
    try {
      await apiFetch(`/admin/stock/${id}`, {
        method: "PUT",
        token,
        body: JSON.stringify({ min_quantity: Number(v.replace(",", ".")) }),
      });
      setEditMin((m) => {
        const n = { ...m };
        delete n[id];
        return n;
      });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (!token) return null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Склад</h1>
      {err && <p className="text-sm text-expense">{err}</p>}

      <section className="rounded-2xl border border-income/30 bg-income-muted/40 p-3 dark:bg-emerald-950/20">
        <h2 className="mb-2 text-sm font-semibold text-income">Приход</h2>
        <div className="grid gap-2">
          <select
            value={inItem}
            onChange={(e) => setInItem(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">— Новая позиция (название ниже) —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.quantity} {i.unit})
              </option>
            ))}
          </select>
          {!inItem && (
            <input
              placeholder="Название новой позиции"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            />
          )}
          <input
            placeholder="Количество"
            type="number"
            inputMode="decimal"
            value={inQty}
            onChange={(e) => setInQty(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Единица (л, кг, шт…)"
            value={inUnit}
            onChange={(e) => setInUnit(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Цена закупки (необязательно)"
            value={inPrice}
            onChange={(e) => setInPrice(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Поставщик"
            value={inSupplier}
            onChange={(e) => setInSupplier(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <input
            placeholder="Комментарий"
            value={inComment}
            onChange={(e) => setInComment(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={() => void income()}
            className="rounded-xl bg-income py-2.5 font-semibold text-white"
          >
            Записать приход
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-expense/30 bg-expense-muted/40 p-3 dark:bg-red-950/20">
        <h2 className="mb-2 text-sm font-semibold text-expense">Списание</h2>
        <div className="grid gap-2">
          <select
            value={woItem === "" ? "" : String(woItem)}
            onChange={(e) => setWoItem(e.target.value ? Number(e.target.value) : "")}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            <option value="">— Выберите позицию —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Количество"
            type="number"
            value={woQty}
            onChange={(e) => setWoQty(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <select
            value={woReason}
            onChange={(e) => setWoReason(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          >
            {REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            placeholder="Комментарий"
            value={woComment}
            onChange={(e) => setWoComment(e.target.value)}
            className="rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
          />
          <button
            type="button"
            onClick={() => void writeOff()}
            className="rounded-xl bg-expense py-2.5 font-semibold text-white"
          >
            Списать
          </button>
        </div>
      </section>

      <div>
        <h2 className="mb-2 font-semibold">Остатки</h2>
        <ul className="space-y-2">
          {items.map((i) => (
            <li
              key={i.id}
              className={`rounded-2xl border p-3 ${
                i.status === "low"
                  ? "border-warn bg-warn-muted dark:bg-amber-950/30"
                  : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              }`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-semibold">{i.name}</span>
                {i.status === "low" && (
                  <span className="rounded-full bg-warn px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    мало
                  </span>
                )}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Остаток: <strong>{i.quantity}</strong> {i.unit}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-500">Минимум:</label>
                <input
                  type="number"
                  className="w-24 rounded-lg border px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800"
                  placeholder={String(i.min_quantity)}
                  value={editMin[i.id] ?? ""}
                  onChange={(e) => setEditMin((m) => ({ ...m, [i.id]: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => void saveMin(i.id)}
                  className="rounded-lg bg-info-muted px-2 py-1 text-xs text-info"
                >
                  Сохранить мин.
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
