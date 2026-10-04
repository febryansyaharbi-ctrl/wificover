import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { api, formatApiError } from "@/lib/api";
import { UserCog, Building2, Mail, ShieldCheck, KeyRound, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function AccountPage() {
  const { user, logout } = useAuth();
  const { tenant } = useTenant();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = [
    [UserCog, "Nama", user?.name],
    [Mail, "Email", user?.email],
    [ShieldCheck, "Role", user?.role],
    [Building2, "Tenant", tenant?.name],
    [Building2, "Subdomain", tenant?.subdomain],
  ];

  const changePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error("Password baru minimal 8 karakter."); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: currentPassword, new_password: newPassword });
      toast.success("Password berhasil diubah. Silakan login kembali.");
      await logout();
      window.location.replace("/admin/login");
    } catch (err) { toast.error(formatApiError(err?.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Akun</h1>
      <p className="text-slate-500 mt-1">Informasi akun dan keamanan akun Anda.</p>

      <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        {rows.map(([Icon, label, value]) => (
          <div key={label} className="flex items-center gap-4 px-5 py-4">
            <span className="h-10 w-10 rounded-xl grid place-items-center" style={{ background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))" }}><Icon size={18} /></span>
            <div><p className="text-xs text-slate-400">{label}</p><p className="font-medium text-slate-900">{value || "-"}</p></div>
          </div>
        ))}
      </div>

      <form onSubmit={changePassword} className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5" data-testid="change-password-form">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound size={18} className="text-violet-600" />
          <h2 className="font-display font-semibold text-slate-900">Ubah Password</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">Setelah password diubah, semua sesi login lama akan ditutup dan Anda perlu login kembali.</p>

        <PasswordField label="Password saat ini" value={currentPassword} onChange={setCurrentPassword} show={showCurrent} toggle={() => setShowCurrent(v => !v)} />
        <div className="mt-4">
          <PasswordField label="Password baru" value={newPassword} onChange={setNewPassword} show={showNew} toggle={() => setShowNew(v => !v)} />
        </div>

        <button type="submit" disabled={busy || !currentPassword || !newPassword}
          className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "hsl(var(--primary))" }}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {busy ? "Menyimpan..." : "Ubah Password"}
        </button>
      </form>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, toggle }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 mb-1.5 block">{label}</label>
      <div className="relative">
        <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          minLength={8} className="binp pr-11" autoComplete="current-password" />
        <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={show ? "Sembunyikan password" : "Tampilkan password"}>
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
