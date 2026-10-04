import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { BrandLogo } from "@/components/Brand";
import {
  LayoutDashboard, Map, Package, Users, Palette, UserCog,
  Building2, CreditCard, Settings, LogOut, Menu, X, ClipboardList,
} from "lucide-react";
import { api } from "@/lib/api";

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, testid: "admin-sidebar-nav-dashboard", end: true },
  { to: "/admin/coverage", label: "Coverage", icon: Map, testid: "admin-sidebar-nav-coverage" },
  { to: "/admin/packages", label: "Paket", icon: Package, testid: "admin-sidebar-nav-packages" },
  { to: "/admin/leads", label: "Leads", icon: Users, testid: "admin-sidebar-nav-leads" },
  { to: "/admin/branding", label: "Branding & Gambar", icon: Palette, testid: "admin-sidebar-nav-branding" },
  { to: "/admin/account", label: "Akun", icon: UserCog, testid: "admin-sidebar-nav-account" },
];

const SUPER_NAV = [
  { to: "/admin/tenants", label: "Tenants", icon: Building2, testid: "admin-sidebar-nav-tenants" },
  { to: "/admin/billing", label: "Billing", icon: CreditCard, testid: "admin-sidebar-nav-billing" },
  { to: "/admin/system-settings", label: "System Settings", icon: Settings, testid: "admin-sidebar-nav-system-settings" },
  { to: "/admin/registrations", label: "Pendaftaran", icon: ClipboardList, testid: "admin-sidebar-nav-registrations" },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { tenant, setTenant } = useTenant();
  const setTenantRef = useRef(setTenant);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [subscription, setSubscription] = useState(null);
  const [adminTenant, setAdminTenant] = useState(tenant);

  useEffect(() => {
    let alive = true;
    const loadTenantAndSubscription = async () => {
      try {
        const tenantRequest = api.get("/tenant/me");
        const billingRequest = user?.role === "SUB_ADMIN" ? api.get("/billing/me") : Promise.resolve({ data: null });
        const [{ data: tenantData }, { data: billingData }] = await Promise.all([tenantRequest, billingRequest]);
        if (!alive) return;
        if (tenantData && tenantData.status !== "LOCKED") {
          setAdminTenant(tenantData);
          setTenantRef.current(tenantData);
          document.title = tenantData.wifi_name
            ? tenantData.wifi_name + " — Admin"
            : (tenantData.name || "WiFi") + " — Admin";
        }
        setSubscription(billingData);
      } catch {
        if (alive) setSubscription(null);
      }
    };
    loadTenantAndSubscription();
    const timer = window.setInterval(loadTenantAndSubscription, 60000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [user?.role]);

  const doLogout = async () => { await logout(); nav("/login", { replace: true }); };

  const SidebarInner = () => (
    <>
      <div className="h-16 flex items-center px-5 border-b border-slate-200">
        <BrandLogo tenant={adminTenant || tenant} size={32} />
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testid} onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? "text-white" : "text-slate-600 hover:bg-slate-100"}`}
            style={({ isActive }) => (isActive ? { background: "hsl(var(--primary))" } : {})}>
            <n.icon size={18} /> {n.label}
          </NavLink>
        ))}
        {user?.role === "SUPER_ADMIN" && (
          <div className="pt-4 mt-3 border-t border-slate-200">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-1">Super Admin</p>
            {SUPER_NAV.map((n) => n.to ? (
              <NavLink key={n.label} to={n.to} data-testid={n.testid} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? "text-white" : "text-slate-600 hover:bg-slate-100"}`}
                style={({ isActive }) => (isActive ? { background: "hsl(var(--primary))" } : {})}>
                <n.icon size={18} /> {n.label}
              </NavLink>
            ) : (
              <div key={n.label} className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium text-slate-400 cursor-not-allowed">
                <span className="flex items-center gap-3"><n.icon size={18} /> {n.label}</span>
                <span className="text-[10px] bg-slate-100 rounded px-1.5 py-0.5">Segera</span>
              </div>
            ))}
          </div>
        )}
      </nav>
      <div className="p-3 border-t border-slate-200">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold rounded px-1.5 py-0.5" style={{ background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" }}>{user?.role}</span>
          {user?.role === "SUB_ADMIN" && <SubscriptionStatus subscription={subscription} />}
        </div>
        <button onClick={doLogout} data-testid="admin-logout-button"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition">
          <LogOut size={18} /> Keluar
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="hidden lg:flex w-64 flex-col bg-white border-r border-slate-200 fixed inset-y-0">
        <SidebarInner />
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-white flex flex-col animate-fade-up"><SidebarInner /></div>
          <div className="flex-1 bg-slate-900/50" onClick={() => setOpen(false)} />
        </div>
      )}
      <div className="flex-1 lg:ml-64 min-w-0">
        <header className="lg:hidden h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-30">
          <button onClick={() => setOpen(true)} data-testid="admin-mobile-menu"><Menu size={24} /></button>
          <BrandLogo tenant={adminTenant || tenant} size={28} />
          <span className="w-6" />
        </header>
        <main className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto"><Outlet /></main>
      </div>
    </div>
  );
}

function SubscriptionStatus({ subscription }) {
  const [remaining, setRemaining] = useState(() => getRemaining(subscription?.expires_at));

  useEffect(() => {
    setRemaining(getRemaining(subscription?.expires_at));
    const timer = window.setInterval(() => {
      setRemaining(getRemaining(subscription?.expires_at));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [subscription?.expires_at]);

  const active = Boolean(subscription?.is_active) && remaining > 0;
  const label = active ? "AKUN AKTIF" : "AKUN NONAKTIF";
  const countdown = active ? formatRemaining(remaining) : "Paket billing habis";

  return (
    <div className={`mt-2 rounded-lg px-2.5 py-2 ${active ? "bg-emerald-50" : "bg-rose-50"}`}>
      <div className={`text-[11px] font-bold ${active ? "text-emerald-700" : "text-rose-700"}`}>{label}</div>
      {subscription?.plan_name && <div className="text-[10px] text-slate-500 truncate">{subscription.plan_name}</div>}
      <div className="text-[11px] font-semibold text-slate-700 tabular-nums">{countdown}</div>
    </div>
  );
}

function getRemaining(expiresAt) {
  if (!expiresAt) return 0;
  const end = new Date(expiresAt).getTime();
  return Math.max(0, end - Date.now());
}

function formatRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return days > 0
    ? `${days}h ${String(hours).padStart(2, "0")}j ${String(minutes).padStart(2, "0")}m`
    : `${String(hours).padStart(2, "0")}j ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}d`;
}
