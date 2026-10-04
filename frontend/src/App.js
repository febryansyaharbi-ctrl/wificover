import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { TenantProvider } from "@/context/TenantContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Registration from "@/pages/Registration";
import PaymentPage from "@/pages/PaymentPage";
import ActivationPage from "@/pages/ActivationPage";
import RegistrationAdminPage from "@/pages/admin/RegistrationAdminPage";
import AdminLayout from "@/pages/admin/AdminLayout";
import Dashboard from "@/pages/admin/Dashboard";
import CoveragePage from "@/pages/admin/CoveragePage";
import PackagesPage from "@/pages/admin/PackagesPage";
import LeadsPage from "@/pages/admin/LeadsPage";
import BrandingPage from "@/pages/admin/BrandingPage";
import AccountPage from "@/pages/admin/AccountPage";
import TenantsPage from "@/pages/admin/TenantsPage";
import BillingPlansPage from "@/pages/admin/BillingPlansPage";
import SystemSettingsPage from "@/pages/admin/SystemSettingsPage";

function Protected({ children }) {
  const { user, checking } = useAuth();
  if (checking) return <div className="min-h-screen grid place-items-center text-slate-400">Memuat…</div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  return children;
}

function SubscriptionGuard({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = React.useState(null);
  const [checkingBilling, setCheckingBilling] = React.useState(true);

  React.useEffect(() => {
    if (user?.role !== "SUB_ADMIN") {
      setSubscription({ is_active: true });
      setCheckingBilling(false);
      return;
    }

    let alive = true;
    const load = async () => {
      try {
        const { data } = await api.get("/billing/me");
        if (alive) setSubscription(data);
      } catch {
        if (alive) setSubscription({ is_active: false });
      } finally {
        if (alive) setCheckingBilling(false);
      }
    };

    load();
    const timer = window.setInterval(load, 15000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [user?.role]);

  if (checkingBilling) {
    return <div className="min-h-screen grid place-items-center text-slate-400">Memeriksa status billing…</div>;
  }

  const tenantActive = subscription?.tenant_status !== "LOCKED";
  const active = Boolean(subscription?.is_active) &&
    tenantActive &&
    (!subscription?.expires_at || new Date(subscription.expires_at).getTime() > Date.now());

  if (user?.role === "SUB_ADMIN" && !active) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-rose-100 shadow-sm p-7 text-center">
          <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-rose-50 grid place-items-center text-rose-600 text-2xl">🔒</div>
          <h1 className="text-xl font-bold text-slate-900">Akun Nonaktif</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Akses dashboard dan seluruh fitur sementara dikunci karena akun tenant sedang nonaktif atau billing tidak aktif.
          </p>
          {subscription?.plan_name && (
            <p className="mt-4 text-sm font-semibold text-slate-700">
              Paket: {subscription.plan_name}
            </p>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {subscription?.tenant_status === "LOCKED"
              ? "Tenant sedang dinonaktifkan. Hubungi Super Admin untuk mengaktifkannya kembali."
              : "Silakan hubungi Super Admin untuk memperpanjang billing."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ background: "hsl(var(--primary))" }}
          >
            Cek Status Billing Lagi
          </button>
        </div>
      </div>
    );
  }

  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <TenantProvider>
          <AuthProvider>
            <Toaster position="top-center" richColors />
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/t/:subdomain" element={<Landing />} />
              <Route path="/admin/login" element={<Login />} />
              <Route path="/daftar" element={<Registration />} />
              <Route path="/pembayaran/:registrationId" element={<PaymentPage />} />
              <Route path="/aktivasi-admin" element={<ActivationPage />} />
              <Route path="/login" element={<Navigate to="/admin/login" replace />} />
              <Route path="/admin" element={<Protected><SubscriptionGuard><AdminLayout /></SubscriptionGuard></Protected>}>
                <Route index element={<Dashboard />} />
                <Route path="coverage" element={<CoveragePage />} />
                <Route path="packages" element={<PackagesPage />} />
                <Route path="leads" element={<LeadsPage />} />
                <Route path="branding" element={<BrandingPage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="tenants" element={<TenantsPage />} />
                <Route path="billing" element={<BillingPlansPage />} />
                <Route path="system-settings" element={<SystemSettingsPage />} />
                <Route path="registrations" element={<RegistrationAdminPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthProvider>
        </TenantProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
