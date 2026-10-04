import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTenant } from "@/context/TenantContext";
import { api } from "@/lib/api";
import { Users, MapPin, Package, CheckCircle2, XCircle, Clock, Layers, ArrowRight, Map, Palette } from "lucide-react";

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className={`h-10 w-10 rounded-xl grid place-items-center mb-3 ${tone}`}><Icon size={20} /></div>
      <div className="font-display text-2xl font-extrabold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { tenant } = useTenant();
  const [d, setD] = useState(null);
  const [subscription, setSubscription] = useState(null);
  useEffect(() => {
    api.get("/dashboard").then((r) => setD(r.data)).catch(() => {});
    api.get("/billing/me").then((r) => setSubscription(r.data)).catch(() => {});
  }, []);
  if (!d) return <div className="text-slate-400">Memuat…</div>;

  return (
    <div data-testid="admin-dashboard">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
      <p className="text-slate-500 mt-1">{tenant?.wifi_name ? `Ringkasan aktivitas ${tenant.wifi_name}.` : "Ringkasan aktivitas tenant Anda."}</p>
      {subscription && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status Billing</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${subscription.is_active ? "bg-emerald-500" : "bg-rose-500"}`} />
              <span className={`font-bold ${subscription.is_active ? "text-emerald-700" : "text-rose-700"}`}>
                {subscription.is_active ? "AKUN AKTIF" : "AKUN NONAKTIF"}
              </span>
              {subscription.plan_name && <span className="text-sm text-slate-500">· {subscription.plan_name}</span>}
            </div>
          </div>
          <BillingCountdown expiresAt={subscription.expires_at} active={subscription.is_active} />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <Stat icon={Users} label="Total Leads" value={d.leads_total} tone="bg-violet-100 text-violet-600" />
        <Stat icon={CheckCircle2} label="Tercover" value={d.covered} tone="bg-emerald-100 text-emerald-600" />
        <Stat icon={XCircle} label="Belum Tercover" value={d.not_covered} tone="bg-rose-100 text-rose-600" />
        <Stat icon={Clock} label="Belum Dicek" value={d.not_checked} tone="bg-amber-100 text-amber-600" />
        <Stat icon={Package} label="Paket Internet" value={d.packages} tone="bg-blue-100 text-blue-600" />
        <Stat icon={MapPin} label="File Coverage" value={d.coverage_files} tone="bg-slate-100 text-slate-600" />
        <Stat icon={Layers} label="Area Aktif" value={d.active_geometries} tone="bg-violet-100 text-violet-600" />
        <Stat icon={MapPin} label="File Aktif" value={d.active_files} tone="bg-emerald-100 text-emerald-600" />
      </div>

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-slate-900">Akses Cepat</h2>
          <span className="text-xs text-slate-400">Kelola tenant Anda</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            ["/admin/coverage", Map, "Coverage", "Kelola file dan area coverage"],
            ["/admin/packages", Package, "Paket Internet", "Atur paket yang tampil di website"],
            ["/admin/leads", Users, "Data Lead", "Lihat, filter, hapus, dan export lead"],
            ["/admin/branding", Palette, "Edit Gambar Hero", "Ganti gambar besar dan atur tampilan tenant"],
          ].map(([to, Icon, title, desc]) => (
            <Link key={to} to={to}
              className="group bg-white rounded-2xl border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-slate-300 transition">
              <div className="flex items-center justify-between">
                <span className="h-10 w-10 rounded-xl grid place-items-center bg-slate-100 text-slate-600 group-hover:bg-violet-100 group-hover:text-violet-600 transition">
                  <Icon size={19} />
                </span>
                <ArrowRight size={17} className="text-slate-300 group-hover:text-slate-600 transition" />
              </div>
              <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">{desc}</p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-8 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200"><h3 className="font-display font-semibold text-slate-900">Leads Terbaru</h3></div>
        {d.recent_leads?.length ? (
          <div className="divide-y divide-slate-100">
            {d.recent_leads.map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center justify-between">
                <div><p className="font-medium text-slate-900">{l.name}</p><p className="text-xs text-slate-400">{l.phone}</p></div>
                <StatusBadge status={l.coverage_status} />
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-6 text-slate-400 text-sm">Belum ada leads.</p>}
      </div>
    </div>
  );
}

function BillingCountdown({ expiresAt, active }) {
  const [remaining, setRemaining] = useState(() => getRemaining(expiresAt));
  useEffect(() => {
    setRemaining(getRemaining(expiresAt));
    const timer = window.setInterval(() => setRemaining(getRemaining(expiresAt)), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!active || remaining <= 0) return <span className="text-sm font-semibold text-rose-600">Billing habis</span>;
  const total = Math.floor(remaining / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return <span className="text-sm font-semibold text-slate-700 tabular-nums">{days > 0 ? `${days} hari ${String(hours).padStart(2, "0")} jam ${String(minutes).padStart(2, "0")} menit` : `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`}</span>;
}

function getRemaining(expiresAt) {
  if (!expiresAt) return 0;
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

export function StatusBadge({ status }) {
  const map = {
    COVERED: ["Tercover", "bg-emerald-100 text-emerald-700"],
    NOT_COVERED: ["Belum Tercover", "bg-rose-100 text-rose-700"],
    NOT_CHECKED: ["Belum Dicek", "bg-amber-100 text-amber-700"],
  };
  const [t, c] = map[status] || [status, "bg-slate-100 text-slate-600"];
  return <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${c}`}>{t}</span>;
}
