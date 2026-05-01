import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatFixed } from "../format";

type RecipeRow = {
  id: number;
  name: string;
  type: string;
  output_quantity: number;
  output_unit: string;
  is_active: number;
};

export default function MixProduction() {
  const { token } = useAuth();
  const [list, setList] = useState<RecipeRow[]>([]);
  const [recipeId, setRecipeId] = useState<number | "">("");
  const [outQty, setOutQty] = useState("5");
  const [outUnit, setOutUnit] = useState("л");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    const data = await apiFetch<RecipeRow[]>("/admin/recipes", { token });
    setList(data.filter((r) => r.is_active));
  };

  useEffect(() => {
    if (!token) return;
    void load().catch((e) => setErr(String(e.message)));
  }, [token]);

  const selected = list.find((r) => r.id === recipeId);

  useEffect(() => {
    if (selected) {
      setOutUnit(selected.output_unit);
    }
  }, [selected?.id, selected?.output_unit]);

  const run = async () => {
    if (!token || recipeId === "") return;
    setErr(null);
    setOkMsg(null);
    const q = Number(String(outQty).replace(",", "."));
    if (!Number.isFinite(q) || q <= 0) {
      setErr("Укажите объём партии");
      return;
    }
    try {
      const res = await apiFetch<{ production_id: number; total_cost: number; mix_quantity: number }>(
        `/admin/recipes/${recipeId}/produce`,
        {
          method: "POST",
          token,
          body: JSON.stringify({
            output_quantity: q,
            output_unit: outUnit.trim() || "л",
            comment: comment.trim() || null,
          }),
        }
      );
      setOkMsg(
        `Партия #${res.production_id}: списано по себестоимости ~${res.total_cost} сом. Остаток готовой смеси: ${formatFixed(res.mix_quantity, 2)}`
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
  };

  if (!token) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Производство смеси</h1>
        <Link to="/recipes" className="text-sm text-info">
          К рецептам
        </Link>
      </div>

      <p className="text-xs text-slate-500">
        Списывает сырьё по рецепту и прибавляет готовую смесь на склад (позиция «Готовая смесь» по умолчанию).
      </p>

      {err && <p className="text-sm text-expense">{err}</p>}
      {okMsg && <p className="text-sm text-income">{okMsg}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <label className="text-sm font-medium">Рецепт</label>
        <select
          value={recipeId}
          onChange={(e) => setRecipeId(e.target.value ? Number(e.target.value) : "")}
          className="mt-1 w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
        >
          <option value="">— выберите —</option>
          {list.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.output_quantity} {r.output_unit})
            </option>
          ))}
        </select>

        {selected && (
          <p className="mt-2 text-xs text-slate-500">
            Тип: {selected.type}. База рецепта на {selected.output_quantity} {selected.output_unit}.
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-slate-500">Сделать (кол-во)</label>
            <input
              value={outQty}
              onChange={(e) => setOutQty(e.target.value)}
              className="mt-0.5 w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Единица</label>
            <select
              value={outUnit}
              onChange={(e) => setOutUnit(e.target.value)}
              className="mt-0.5 w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
            >
              {["л", "мл", "кг", "г"].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>

        <textarea
          placeholder="Комментарий к партии"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          className="mt-2 w-full rounded-xl border px-3 py-2 dark:border-slate-600 dark:bg-slate-800"
        />

        <button
          type="button"
          onClick={() => void run()}
          disabled={recipeId === ""}
          className="mt-3 w-full rounded-xl bg-income py-2.5 font-semibold text-white disabled:opacity-50"
        >
          Сделать смесь по рецепту
        </button>
      </div>
    </div>
  );
}
