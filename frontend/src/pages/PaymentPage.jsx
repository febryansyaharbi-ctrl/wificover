import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatIDR, waLink } from "@/lib/format";
import { BrandLogo } from "@/components/Brand";
import { ArrowLeft, CheckCircle2, CreditCard, Loader2, MessageCircle, QrCode } from "lucide-react";

export default function PaymentPage() {
  const { registrationId } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get(`/registration/payment-info/${registrationId}`, { params: { _t: Date.now() } })
      .then(({ data }) => setData(data))
      .catch((e) => setError(formatApiError(e?.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, [registrationId]);

  const openWhatsApp = () => {
    if (!data?.payment?.whatsapp) {
      setError("WhatsApp Super Admin belum dikonfigurasi. Silakan hubungi Super Admin melalui kontak resmi.");
      return;
    }
    const text = [
      "Halo Super Admin, saya ingin mengirim bukti pembayaran pendaftaran Sub-Admin.",
      `Nama: ${data.name}`,
      `WhatsApp: +${data.whatsapp}`,
      `Paket: ${data.plan_name}`,
      `Nominal: ${formatIDR(data.amount)}`,
      `Nomor Pendaftaran: ${data.id}`,
      "",
      "Saya melampirkan bukti pembayaran pada chat WhatsApp ini. Mohon diverifikasi dan diproses untuk aktivasi akun.",
    ].join("\n");
    window.open(waLink(data.payment.whatsapp, text), "_blank");
  };

  const goToAdminLogin = async () => {
    await logout();
    navigate("/admin/login", { replace: true });
  };

  const confirm = async () => {
    if (!data?.payment?.whatsapp) {
      setError("WhatsApp Super Admin belum dikonfigurasi. Silakan hubungi Super Admin melalui kontak resmi.");
      return;
    }
    setBusy(true); setError("");
    try {
      await api.post(`/registration/${registrationId}/confirm-payment`);
      openWhatsApp();
      setData((v) => ({ ...v, status: "PAYMENT_REPORTED" }));
    } catch (e) {
      setError(formatApiError(e?.response?.data?.detail));
    } finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-400"><Loader2 className="animate-spin"/></div>;
  if (error && !data) return <div className="min-h-screen bg-slate-50 grid place-items-center p-6"><div className="max-w-md text-center"><p className="text-rose-600">{error}</p><Link to="/daftar" className="inline-flex mt-5 items-center gap-2 text-sm font-semibold text-violet-700"><ArrowLeft size={16}/> Kembali</Link></div></div>;

  const reported = data?.status === "PAYMENT_REPORTED";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandLogo />
          <div className="flex items-center gap-3">
            <Link to="/daftar" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={16}/> Pendaftaran</Link>
            <button type="button" onClick={goToAdminLogin} className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white" style={{background:"hsl(var(--primary))"}}>
              Login Admin
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-violet-50 text-violet-700 px-4 py-1.5 text-xs font-semibold"><CreditCard size={14}/> Pembayaran Subscription</span>
          <h1 className="mt-4 font-display text-3xl sm:text-4xl font-extrabold text-slate-900">Selesaikan Pembayaran</h1>
          <p className="mt-3 text-slate-500">Transfer sesuai nominal dan tujuan pembayaran resmi di bawah ini.</p>
        </div>

        {error && <div className="mt-5 rounded-xl bg-rose-50 text-rose-700 px-4 py-3 text-sm">{error}</div>}

        <div className="mt-8 grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <h2 className="font-bold text-slate-900">Detail Pendaftaran</h2>
              <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <div><div className="text-xs text-slate-400">Nama</div><div className="font-semibold">{data.name}</div></div>
                <div><div className="text-xs text-slate-400">Nomor Pendaftaran</div><div className="font-mono text-sm font-semibold break-all">{data.id}</div></div>
                <div><div className="text-xs text-slate-400">Paket</div><div className="font-semibold">{data.plan_name}</div></div>
                <div><div className="text-xs text-slate-400">Total Pembayaran</div><div className="font-display text-xl font-extrabold text-violet-700">{formatIDR(data.amount)}</div></div>
              </div>
            </div>

            {data.payment.bank_accounts?.length > 0 && <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <h2 className="font-bold text-slate-900">Transfer Bank</h2>
              <div className="mt-4 space-y-3">{data.payment.bank_accounts.map((b,i) => <div key={i} className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="font-semibold">{b.bank}</div><div className="mt-1 text-lg font-mono font-bold">{b.account_number}</div><div className="text-sm text-slate-500">a.n. {b.account_name}</div></div>)}</div>
            </div>}

            {data.payment.ewallets?.length > 0 && <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <h2 className="font-bold text-slate-900">E-Wallet</h2>
              <div className="mt-4 space-y-3">{data.payment.ewallets.map((w,i) => <div key={i} className="rounded-2xl bg-slate-50 border border-slate-200 p-4"><div className="font-semibold">{w.provider}</div><div className="mt-1 text-lg font-mono font-bold">{w.account_number}</div><div className="text-sm text-slate-500">a.n. {w.account_name}</div></div>)}</div>
            </div>}

            {data.payment.qris_image && <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm text-center">
              <h2 className="font-bold text-slate-900">QRIS</h2><QrCode className="mx-auto mt-3 text-violet-700"/><img src={data.payment.qris_image} alt="QRIS pembayaran" className="mt-4 mx-auto max-h-80 rounded-xl border border-slate-200"/>
            </div>}

            {!data.payment.bank_accounts?.length && !data.payment.ewallets?.length && !data.payment.qris_image && <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-sm text-amber-800">Tujuan pembayaran belum dikonfigurasi Super Admin.</div>}
          </div>

          <div>
            <div className="lg:sticky lg:top-6 bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              {reported ? <><CheckCircle2 className="text-emerald-500 mx-auto" size={48}/><h2 className="mt-4 text-center font-bold text-slate-900">Menunggu Verifikasi Super Admin</h2><p className="mt-2 text-center text-sm text-slate-500">Pendaftaran Anda sudah otomatis masuk ke daftar verifikasi Super Admin. Silakan lakukan pembayaran sesuai tujuan di atas, lalu kirim bukti pembayaran melalui WhatsApp.</p><button onClick={openWhatsApp} className="mt-5 w-full h-12 rounded-xl text-white font-semibold inline-flex items-center justify-center gap-2" style={{background:"hsl(var(--primary))"}}><MessageCircle size={18}/> Kirim Bukti via WhatsApp</button></> :
              <><h2 className="font-bold text-slate-900">Kirim Bukti Pembayaran</h2><p className="mt-2 text-sm text-slate-500 leading-6">Setelah transfer, klik tombol di bawah. WhatsApp Admin akan terbuka dengan template chat pendaftar dan Anda dapat langsung melampirkan bukti pembayaran.</p><button onClick={confirm} disabled={busy} className="mt-5 w-full h-12 rounded-xl text-white font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60" style={{background:"hsl(var(--primary))"}}>{busy ? <Loader2 size={18} className="animate-spin"/> : <MessageCircle size={18}/>} {busy ? "Membuka WhatsApp..." : "Kirim Bukti Pembayaran"}</button></>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
