import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AdminLogin from "./components/AdminLogin";
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

  if (!token) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950">
        {error ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100">
            {error}
          </div>
        ) : null}
        <AdminLogin />
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

function routerBasename(): string | undefined {
  const base = import.meta.env.BASE_URL;
  if (!base || base === "/") return undefined;
  return base.replace(/\/$/, "") || undefined;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={routerBasename()}>
        <Gate />
      </BrowserRouter>
    </AuthProvider>
  );
}
