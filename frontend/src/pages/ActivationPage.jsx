import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { BrandLogo } from "@/components/Brand";
import { CheckCircle2, Copy, KeyRound, Loader2, ShieldCheck, UserRound, Wifi } from "lucide-react";

export default function ActivationPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState(null);
  const [form, setForm] = useState({
    wifi_name: "", subdomain: "", username: "", password: "", email: "", website_title: "", description: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);
  const cardRef = useRef(null);

  useEffect(() => {
    if (!token) {
      setError("Link aktivasi tidak ditemukan.");
      setLoading(false);
      return;
    }
    api.get("/registration/activation-info/" + encodeURIComponent(token))
      .then(({ data }) => {
        setInfo(data);
        setForm((v) => ({ ...v, wifi_name: v.wifi_name || data.name, website_title: v.website_title || data.name }));
      })
      .catch((e) => setError(formatApiError(e?.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setError("Password login minimal 8 karakter.");
      return;
    }
    setBusy(true); setError("");
    try {
      const { data } = await api.post("/registration/activate/" + encodeURIComponent(token), form);
      setCredentials(data);
    } catch (e) {
      setError(formatApiError(e?.response?.data?.detail));
    } finally { setBusy(false); }
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = [
      "AKUN SUB-ADMIN WIFI",
      "Nama: " + credentials.tenant_name,
      "Nama WiFi: " + credentials.wifi_name,
      "Username: " + credentials.username,
      "Password: " + credentials.password,
      "Subdomain: " + credentials.subdomain,
      "WhatsApp: +" + credentials.whatsapp,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      window.alert("Data login berhasil disalin.");
    } catch {
      window.prompt("Salin data login berikut:", text);
    }
  };

  const saveAsImage = () => {
    if (!credentials || !cardRef.current) return;
    const card = cardRef.current;
    const width = 900;
    const height = 620;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#6d28d9";
    ctx.fillRect(0, 0, width, 110);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 36px Arial";
    ctx.fillText("AKUN SUB-ADMIN WIFI", 45, 68);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 25px Arial";
    ctx.fillText(credentials.tenant_name, 45, 165);
    ctx.font = "20px Arial";
    const lines = [
      ["Nama WiFi", credentials.wifi_name],
      ["Username", credentials.username],
      ["Password", credentials.password],
      ["Subdomain", credentials.subdomain],
      ["WhatsApp", "+" + credentials.whatsapp],
    ];
    lines.forEach((line, i) => {
      const y = 225 + i * 62;
      ctx.fillStyle = "#64748b";
      ctx.font = "16px Arial";
      ctx.fillText(line[0], 45, y);
      ctx.fillStyle = "#0f172a";
      ctx.font = "bold 21px Arial";
      ctx.fillText(line[1], 230, y);
    });
    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px Arial";
    ctx.fillText("Simpan informasi ini di tempat yang aman.", 45, 575);
    const a = document.createElement("a");
    a.download = "akun-subadmin-" + credentials.username + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-400"><Loader2 className="animate-spin"/></div>;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center"><BrandLogo/></div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
        {!credentials ? (
          <>
            <div className="text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 text-violet-700 px-4 py-1.5 text-xs font-semibold"><ShieldCheck size={14}/> Aktivasi Sub-Admin</span>
              <h1 className="mt-4 font-display text-3xl font-extrabold text-slate-900">Lengkapi Pendaftaran</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">Link ini khusus untuk pendaftar yang pembayaran-nya sudah diverifikasi Super Admin.</p>
            </div>

            {error && <div className="mt-5 rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>}

            {info && (
              <form onSubmit={submit} className="mt-7 bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="rounded-2xl bg-violet-50 border border-violet-100 p-4">
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div><div className="text-xs text-slate-400">Nama Sub-Admin</div><div className="font-semibold text-slate-900">{info.name}</div></div>
                    <div><div className="text-xs text-slate-400">WhatsApp</div><div className="font-semibold text-slate-900">+{info.whatsapp}</div></div>
                    <div><div className="text-xs text-slate-400">Paket</div><div className="font-semibold text-slate-900">{info.plan_name}</div></div>
                    <div><div className="text-xs text-slate-400">Berlaku sampai</div><div className="font-semibold text-slate-900">{new Date(info.activation_expires_at).toLocaleString("id-ID")}</div></div>
                  </div>
                </div>

                <Field label="Nama WiFi" icon={<Wifi size={17}/>} value={form.wifi_name} onChange={(v) => setForm({...form, wifi_name: v})} required placeholder="Contoh: WiFi Rumah Kita"/>
                <Field label="Username Login" icon={<UserRound size={17}/>} value={form.username} onChange={(v) => setForm({...form, username: v.toLowerCase().replace(/\s/g, "")})} required placeholder="contoh: adminwifi" minLength={3}/>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Password Login</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} minLength={8} required placeholder="Minimal 8 karakter" className="mt-1.5 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none focus:ring-2 focus:ring-violet-200"/>
                  <p className="mt-1 text-xs text-slate-400">Password ini akan menjadi password login Sub-Admin.</p>
                </div>
                <Field label="Subdomain" value={form.subdomain} onChange={(v) => setForm({...form, subdomain: v.toLowerCase().replace(/\s/g, "")})} required placeholder="contoh: wifi-kediri" />
                <div>
                  <label className="text-sm font-semibold text-slate-700">Email Admin <span className="font-normal text-slate-400">(opsional)</span></label>
                  <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} placeholder="admin@email.com" className="mt-1.5 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none focus:ring-2 focus:ring-violet-200"/>
                  <p className="mt-1 text-xs text-slate-400">Login tetap dapat menggunakan username walaupun email dikosongkan.</p>
                </div>
                <Field label="Judul Website" value={form.website_title} onChange={(v) => setForm({...form, website_title: v})} placeholder="Judul landing page"/>
                <div>
                  <label className="text-sm font-semibold text-slate-700">Deskripsi Website <span className="font-normal text-slate-400">(opsional)</span></label>
                  <textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} maxLength={500} className="mt-1.5 w-full min-h-24 rounded-xl border border-slate-200 p-3 outline-none focus:ring-2 focus:ring-violet-200" placeholder="Deskripsi singkat layanan WiFi..."/>
                </div>

                <button disabled={busy} className="w-full h-12 rounded-xl text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{background:"hsl(var(--primary))"}}>
                  {busy ? <Loader2 size={18} className="animate-spin"/> : <KeyRound size={18}/>} {busy ? "Mengaktifkan..." : "Aktifkan Akun"}
                </button>
                <p className="text-xs text-slate-400 text-center">Link aktivasi hanya dapat digunakan satu kali dan akan kedaluwarsa sesuai batas waktu di atas.</p>
              </form>
            )}
          </>
        ) : (
          <div className="bg-white rounded-3xl border border-emerald-200 shadow-sm p-6 sm:p-8">
            <CheckCircle2 className="mx-auto text-emerald-500" size={54}/>
            <h1 className="mt-4 text-center font-display text-2xl font-extrabold text-slate-900">Akun Berhasil Diaktifkan</h1>
            <p className="mt-2 text-center text-sm text-slate-500">Simpan data login berikut. Password ditampilkan sekarang dan tidak akan ditampilkan kembali setelah halaman ini ditutup.</p>

            <div ref={cardRef} className="mt-6 rounded-2xl border border-slate-200 p-5 bg-slate-50">
              <h2 className="font-bold text-lg text-slate-900">{credentials.tenant_name}</h2>
              <div className="mt-4 space-y-3 text-sm">
                <Row label="Nama WiFi" value={credentials.wifi_name}/>
                <Row label="Username" value={credentials.username}/>
                <Row label="Password" value={credentials.password}/>
                <Row label="Subdomain" value={credentials.subdomain}/>
                <Row label="WhatsApp" value={"+" + credentials.whatsapp}/>
              </div>
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              <button onClick={copyCredentials} className="h-11 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold inline-flex items-center justify-center gap-2"><Copy size={17}/> Salin Data Login</button>
              <button onClick={saveAsImage} className="h-11 rounded-xl text-white font-semibold" style={{background:"hsl(var(--primary))"}}>Simpan sebagai Gambar</button>
            </div>

            <div className="mt-5 rounded-2xl bg-violet-50 border border-violet-100 p-4 text-sm text-violet-800">
              Login admin menggunakan <b>username</b> dan password yang baru dibuat. Tenant sudah dibuat aktif dan subscription mengikuti paket pendaftaran.
            </div>
            <Link to="/admin/login" className="mt-5 w-full h-11 rounded-xl bg-slate-100 text-slate-700 font-semibold inline-flex items-center justify-center">Ke Login Admin</Link>
          </div>
        )}
      </main>
    </div>
  );
}

function Field({ label, icon, value, onChange, ...props }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-700 inline-flex items-center gap-2">{icon}{label}</span>
      <input {...props} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1.5 w-full h-12 rounded-xl border border-slate-200 px-4 outline-none focus:ring-2 focus:ring-violet-200"/>
    </label>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between gap-4 border-b border-slate-200 pb-2 last:border-0 last:pb-0"><span className="text-slate-500">{label}</span><b className="text-slate-900 text-right break-all">{value}</b></div>;
}
