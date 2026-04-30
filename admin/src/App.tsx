import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Sales from "./pages/Sales";
import SaleDetail from "./pages/SaleDetail";
import Expenses from "./pages/Expenses";
import Products from "./pages/Products";
import More from "./pages/More";
import Cashiers from "./pages/Cashiers";
import Report from "./pages/Report";
import ReportDayDetail from "./pages/ReportDayDetail";
import Salary from "./pages/Salary";
import SalaryDetail from "./pages/SalaryDetail";
import Settings from "./pages/Settings";
import Stock from "./pages/Stock";
import Accounts from "./pages/Accounts";
import AccountDetail from "./pages/AccountDetail";
import Recipes from "./pages/Recipes";
import MixProduction from "./pages/MixProduction";

function Gate() {
  const { ready, error, token } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center p-6 text-slate-500">
        Загрузка…
      </div>
    );
  }

  if (error && !token) {
    return (
      <div className="p-6">
        <p className="text-expense font-medium">{error}</p>
        <p className="mt-2 text-sm text-slate-500">
          Локально без Telegram: создайте admin/.env — <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">VITE_DEV_TOKEN</code> = тот же секрет, что{" "}
          <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">DEV_ADMIN_TOKEN</code> в backend/.env (можно не задавать{" "}
          <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">VITE_API_URL</code>, прокси dev отправит запросы на :3847).
          С телефона нужен HTTPS URL API в <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">VITE_API_URL</code>.
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="p-6 text-slate-500">
        Нет доступа. Откройте из Telegram или настройте токен разработки.
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="sales/:id" element={<SaleDetail />} />
        <Route path="expenses" element={<Expenses />} />
        <Route path="products" element={<Products />} />
        <Route path="more" element={<More />} />
        <Route path="cashiers" element={<Cashiers />} />
        <Route path="report" element={<Report />} />
        <Route path="reports/detail" element={<ReportDayDetail />} />
        <Route path="salary" element={<Salary />} />
        <Route path="salary/:cashierId" element={<SalaryDetail />} />
        <Route path="settings" element={<Settings />} />
        <Route path="stock" element={<Stock />} />
        <Route path="accounts" element={<Accounts />} />
        <Route path="accounts/:id" element={<AccountDetail />} />
        <Route path="recipes" element={<Recipes />} />
        <Route path="mix-production" element={<MixProduction />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
