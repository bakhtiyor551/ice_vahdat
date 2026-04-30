import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/", label: "Главная", end: true },
  { to: "/sales", label: "Продажи" },
  { to: "/expenses", label: "Расходы" },
  { to: "/report", label: "Отчёт" },
  { to: "/more", label: "Ещё" },
];

export default function AppShell() {
  return (
    <div className="flex min-h-[100dvh] flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <main className="flex-1 px-3 pt-3">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-lg items-stretch justify-around gap-0.5 pt-1">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `flex min-w-0 flex-1 flex-col items-center rounded-lg px-1 py-2 text-[10px] font-medium leading-tight sm:text-xs ${
                  isActive
                    ? "text-info bg-info-muted/80 dark:bg-blue-950/50"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400"
                }`
              }
            >
              <span className="text-center">{t.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
