import { Link } from "react-router-dom";

const links = [
  { to: "/report", label: "Отчёт", desc: "Выручка, расходы, товары, кассиры, Excel" },
  { to: "/salary", label: "Зарплата", desc: "Рабочие дни, выплаты, счета" },
  { to: "/recipes", label: "Рецепты", desc: "Смеси, ингредиенты, себестоимость" },
  { to: "/mix-production", label: "Производство смеси", desc: "Списать сырьё, приход готовой смеси" },
  { to: "/stock", label: "Склад", desc: "Остатки, приход, списание" },
  { to: "/accounts", label: "Счета", desc: "Наличные, карта, перевод, долги" },
  { to: "/cashiers", label: "Кассиры", desc: "Добавление и статус кассиров" },
  { to: "/products", label: "Товары", desc: "Цены и порции" },
  { to: "/settings", label: "Настройки", desc: "Заготовка API" },
];

export default function More() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Ещё</h1>
      <ul className="space-y-2">
        {links.map((l) => (
          <li key={l.to}>
            <Link
              to={l.to}
              className="block rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="font-semibold text-slate-900 dark:text-white">{l.label}</div>
              <div className="mt-0.5 text-xs text-slate-500">{l.desc}</div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">Excel — в разделе «Отчёт», кнопка «Скачать Excel».</p>
    </div>
  );
}
