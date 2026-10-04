import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTenant } from "@/context/TenantContext";
import { BrandLogo } from "@/components/Brand";
import { api, formatApiError } from "@/lib/api";
import { Lock, UserRound, Loader2, Eye, EyeOff, UserPlus, ArrowRight } from "lucide-react";

export default function Login() {
  const { login, user } = useAuth();
  const { tenant } = useTenant();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [promo, setPromo] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const cleanPromo = String(promo || "").replace(/\\+r?\\+n/g, "\n").trim();
  useEffect(() => { api.get("/system/login-promo").then(r => setPromo(r.data.text)).catch(() => {}); }, []);

  useEffect(() => { if (user) nav("/admin", { replace: true }); }, [user, nav]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await login(identifier.trim(), password);
      nav("/admin", { replace: true });
    } catch (e2) {
      setErr(formatApiError(e2.response?.data?.detail) || "Login gagal");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:flex flex-col justify-between p-12 text-white" style={{ background: "hsl(var(--primary))" }}>
        <BrandLogo tenant={{ ...tenant, logo_url: null }} className="[&_span]:text-white" />
        <div>
          <h2 className="font-display text-4xl font-extrabold leading-tight">Panel Admin<br />WiFi Coverage</h2>
          <p className="mt-4 text-white/80 max-w-sm">{cleanPromo || "Jadilah Sub-Admin WiFi dan kembangkan layanan internet Anda dengan dashboard, branding, leads, coverage GIS, dan paket billing."}</p>
        </div>
        <p className="text-white/60 text-sm">© {new Date().getFullYear()} WiFi Coverage SaaS</p>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><BrandLogo tenant={tenant} /></div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Masuk ke Dashboard</h1>
          <p className="text-slate-500 mt-1 mb-8 text-sm">Gunakan akun admin Anda untuk melanjutkan.</p>
          {err && <div className="mb-4 rounded-xl bg-rose-50 text-rose-600 text-sm px-4 py-3" data-testid="login-error">{err}</div>}
          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Username / Email</label>
          <div className="relative mb-4">
            <UserRound size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input data-testid="login-email-input" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
                   className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/20 outline-none" placeholder="username atau admin@email.com" />
          </div>
          <label className="text-sm font-medium text-slate-700 mb-1.5 block">Password</label>
          <div className="relative mb-6">
            <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input data-testid="login-password-input" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                   className="w-full h-12 pl-11 pr-11 rounded-xl border border-slate-200 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/20 outline-none" placeholder="••••••••" />
            <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          <div className="flex justify-between items-center mb-3"><span className="text-xs text-slate-400">Akses aman untuk admin & Sub-Admin</span></div>
          <div className="mb-5 rounded-2xl bg-violet-50 border border-violet-100 p-4">
            <div className="flex items-start gap-3"><UserPlus size={20} className="mt-0.5 text-violet-700 shrink-0"/><div><div className="font-semibold text-slate-900 text-sm">Ingin menjadi Sub-Admin?</div><p className="text-xs text-slate-600 mt-1 leading-5">{cleanPromo || "Daftar sekarang untuk mendapatkan dashboard mandiri, branding WiFi, coverage GIS, leads terisolasi, dan billing."}</p><Link to="/daftar" className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-violet-700">Daftar Sekarang <ArrowRight size={15}/></Link></div></div>
          </div>
          <button type="submit" disabled={loading} data-testid="login-submit-button"
                  className="w-full h-12 rounded-xl text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-60"
                  style={{ background: "hsl(var(--primary))" }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : null} Masuk
          </button>
        </form>
      </div>
    </div>
  );
}
