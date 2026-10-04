import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { formatIDR } from "@/lib/format";
import { BrandLogo } from "@/components/Brand";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, UserPlus, MessageCircle, CreditCard } from "lucide-react";

export default function Registration() {
  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ name: "", whatsapp: "", plan_id: "" });
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    api.get("/registration/plans")
      .then(({ data }) => {
        setPlans(data);
        if (data.length) setForm((v) => ({ ...v, plan_id: v.plan_id || data[0].id }));
      })
      .catch((e) => setError(formatApiError(e?.response?.data?.detail)))
      .finally(() => setLoadingPlans(false));
  }, []);

  const selectedPlan = plans.find((p) => p.id === form.plan_id);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/registration", form);
      navigate(`/pembayaran/${data.id}`);
    } catch (e2) {
      setError(formatApiError(e2?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-xl mx-auto px-4 py-10 sm:py-16">
          <div className="flex justify-center mb-8"><BrandLogo /></div>
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-7 sm:p-9 text-center">
            <CheckCircle2 size={58} className="mx-auto text-emerald-500" />
            <h1 className="mt-5 font-display text-2xl sm:text-3xl font-bold text-slate-900">Pendaftaran Berhasil</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Data Anda sudah tersimpan. Simpan nomor pendaftaran berikut untuk proses selanjutnya.
            </p>
            <div className="mt-6 rounded-2xl bg-slate-50 border border-slate-200 p-4">
              <div className="text-xs text-slate-400">Nomor Pendaftaran</div>
              <div className="mt-1 font-mono text-sm font-bold text-slate-800 break-all">{result.id}</div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-left">
                <div><div className="text-xs text-slate-400">Nama</div><div className="text-sm font-semibold">{result.name}</div></div>
                <div><div className="text-xs text-slate-400">WhatsApp</div><div className="text-sm font-semibold">+{result.whatsapp}</div></div>
                <div className="col-span-2"><div className="text-xs text-slate-400">Paket</div><div className="text-sm font-semibold">{result.plan_name} · {formatIDR(result.amount)}</div></div>
              </div>
            </div>
            <div className="mt-6 rounded-2xl bg-violet-50 border border-violet-100 p-4 text-left">
              <p className="text-sm text-violet-800 leading-6">
                Pendaftaran Anda sudah masuk status <strong>menunggu verifikasi Super Admin</strong>. Silakan lakukan pembayaran sesuai tujuan resmi pada halaman pembayaran, lalu kirim bukti melalui WhatsApp.
              </p>
            </div>
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link to="/" className="flex-1 inline-flex justify-center items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700">
                Kembali ke Website
              </Link>
              <button type="button" onClick={async () => { await logout(); navigate("/admin/login", { replace: true }); }} className="flex-1 inline-flex justify-center items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white" style={{background:"hsl(var(--primary))"}}>
                Kembali ke Login <ArrowRight size={16}/>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandLogo />
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16}/> Kembali
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 text-violet-700 px-4 py-1.5 text-xs font-semibold"><UserPlus size={14}/> Pendaftaran Sub-Admin</span>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold text-slate-900">Mulai Kelola Bisnis WiFi Anda</h1>
          <p className="mt-3 text-slate-500 leading-6">Isi data berikut. Setelah menekan Daftar, pendaftaran langsung masuk status menunggu verifikasi Super Admin dan Anda diarahkan ke halaman pembayaran.</p>
        </div>

        <div className="mt-10 max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {error && <div className="mb-5 rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>}
          {loadingPlans ? (
            <div className="py-16 grid place-items-center text-slate-400"><Loader2 className="animate-spin" size={24}/></div>
          ) : plans.length === 0 ? (
            <div className="py-12 text-center text-slate-500">Belum ada paket subscription aktif. Silakan hubungi Super Admin.</div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="text-sm font-semibold text-slate-700">Nama Lengkap</label>
                <input required minLength={2} maxLength={120} value={form.name} onChange={(e) => setForm({...form, name:e.target.value})}
                  placeholder="Nama Anda" className="mt-2 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none focus:ring-2 focus:ring-violet-200"/>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Nomor WhatsApp</label>
                <div className="relative mt-2">
                  <MessageCircle size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input required value={form.whatsapp} onChange={(e) => setForm({...form, whatsapp:e.target.value})}
                    placeholder="08xxxxxxxxxx" className="w-full h-12 rounded-xl border border-slate-200 pl-11 pr-4 outline-none focus:ring-2 focus:ring-violet-200"/>
                </div>
                <p className="mt-1.5 text-xs text-slate-400">Contoh: 081234567890 atau +6281234567890</p>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700">Pilih Paket Subscription</label>
                <div className="mt-2 grid gap-3">
                  {plans.map((p) => (
                    <label key={p.id} className={`cursor-pointer rounded-2xl border p-4 transition ${form.plan_id === p.id ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="radio" name="plan_id" value={p.id} checked={form.plan_id === p.id} onChange={(e) => setForm({...form, plan_id:e.target.value})} className="sr-only"/>
                      <div className="flex items-center justify-between gap-4">
                        <div><div className="font-semibold text-slate-900">{p.name}</div><div className="text-xs text-slate-500 mt-1">{p.duration_days} hari · {p.description || "Subscription WiFi"}</div></div>
                        <div className="font-display font-bold text-violet-700 whitespace-nowrap">{formatIDR(p.price)}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              {selectedPlan && (
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 flex items-center justify-between">
                  <span className="text-sm text-slate-500">Nominal tahap berikutnya</span>
                  <strong className="text-slate-900">{formatIDR(selectedPlan.price)}</strong>
                </div>
              )}
              <button type="submit" disabled={submitting} className="w-full h-12 rounded-xl text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{background:"hsl(var(--primary))"}}>
                {submitting ? <Loader2 size={18} className="animate-spin"/> : <ArrowRight size={18}/>}
                {submitting ? "Mendaftarkan..." : "Daftar"}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
