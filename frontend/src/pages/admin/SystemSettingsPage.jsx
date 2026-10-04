import { useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";
import { Settings, Save, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function SystemSettingsPage() {
  const { user } = useAuth();
  const [promo, setPromo] = useState("");
  const [payment, setPayment] = useState({ whatsapp: "", bank_accounts: [], ewallets: [], qris_image: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api.get("/system/login-promo"), api.get("/system/payment-settings")])
      .then(([a, b]) => { setPromo(a.data.text); setPayment(b.data); })
      .catch((e) => setMessage(formatApiError(e?.response?.data?.detail)));
  }, []);

  if (user?.role !== "SUPER_ADMIN") return <div className="text-sm text-slate-500">Akses hanya untuk Super Admin.</div>;

  const savePromo = async () => {
    setBusy(true); setMessage("");
    try { await api.put("/system/login-promo", { text: promo }); setMessage("Teks promosi berhasil disimpan."); }
    catch (e) { setMessage(formatApiError(e?.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const savePayment = async () => {
    setBusy(true); setMessage("");
    try { const { data } = await api.put("/system/payment-settings", payment); setPayment(data); setMessage("Tujuan pembayaran berhasil disimpan."); }
    catch (e) { setMessage(formatApiError(e?.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const updateBank = (i, key, value) => {
    const a = [...payment.bank_accounts]; a[i] = { ...a[i], [key]: value }; setPayment({ ...payment, bank_accounts: a });
  };
  const updateWallet = (i, key, value) => {
    const a = [...payment.ewallets]; a[i] = { ...a[i], [key]: value }; setPayment({ ...payment, ewallets: a });
  };

  const readQris = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 2500000) { setMessage("QRIS maksimal 2,5 MB."); return; }
    const reader = new FileReader(); reader.onload = () => setPayment({ ...payment, qris_image: reader.result }); reader.readAsDataURL(f);
  };

  return (
    <div className="max-w-3xl" data-testid="system-settings-page">
      <div className="flex items-center gap-3"><span className="h-11 w-11 rounded-xl bg-violet-100 text-violet-700 grid place-items-center"><Settings size={21}/></span><div><h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">System Settings</h1><p className="text-slate-500 mt-1">Pengaturan global yang hanya dapat diubah Super Admin.</p></div></div>
      {message && <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}

      <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <label className="text-sm font-semibold text-slate-700">Teks ajakan Sub-Admin pada halaman login</label>
        <textarea value={promo} onChange={e => setPromo(e.target.value)} maxLength={500} className="mt-2 w-full min-h-36 rounded-xl border border-slate-200 p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-violet-200" />
        <button onClick={savePromo} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{background:"hsl(var(--primary))"}}><Save size={16}/>{busy ? "Menyimpan..." : "Simpan Promosi"}</button>
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <h2 className="font-semibold text-slate-900">Tujuan Pembayaran</h2>
        <p className="text-xs text-slate-400 mt-1">Ditampilkan pada halaman pembayaran pendaftar Sub-Admin.</p>
        <label className="block mt-5 text-sm font-semibold text-slate-700">WhatsApp Super Admin</label>
        <input value={payment.whatsapp} onChange={e => setPayment({...payment, whatsapp:e.target.value})} placeholder="081234567890" className="mt-2 w-full h-11 rounded-xl border border-slate-200 px-3 outline-none focus:ring-2 focus:ring-violet-200"/>

        <div className="mt-6 flex justify-between items-center"><label className="text-sm font-semibold text-slate-700">Rekening Bank</label><button type="button" onClick={() => setPayment({...payment, bank_accounts:[...payment.bank_accounts,{bank:"",account_name:"",account_number:""}]})} className="text-xs font-semibold text-violet-700 inline-flex gap-1 items-center"><Plus size={14}/> Tambah</button></div>
        <div className="mt-3 space-y-3">{payment.bank_accounts.map((b,i)=><div key={i} className="rounded-xl border border-slate-200 p-3 grid sm:grid-cols-3 gap-2"><input value={b.bank} onChange={e=>updateBank(i,"bank",e.target.value)} placeholder="Bank" className="h-10 rounded-lg border px-3 text-sm"/><input value={b.account_name} onChange={e=>updateBank(i,"account_name",e.target.value)} placeholder="Nama pemilik" className="h-10 rounded-lg border px-3 text-sm"/><div className="flex gap-2"><input value={b.account_number} onChange={e=>updateBank(i,"account_number",e.target.value)} placeholder="No. rekening" className="h-10 rounded-lg border px-3 text-sm flex-1"/><button type="button" onClick={()=>setPayment({...payment,bank_accounts:payment.bank_accounts.filter((_,j)=>j!==i)})} className="text-rose-500"><Trash2 size={17}/></button></div></div>)}</div>

        <div className="mt-6 flex justify-between items-center"><label className="text-sm font-semibold text-slate-700">E-Wallet</label><button type="button" onClick={() => setPayment({...payment,ewallets:[...payment.ewallets,{provider:"",account_name:"",account_number:""}]})} className="text-xs font-semibold text-violet-700 inline-flex gap-1 items-center"><Plus size={14}/> Tambah</button></div>
        <div className="mt-3 space-y-3">{payment.ewallets.map((w,i)=><div key={i} className="rounded-xl border border-slate-200 p-3 grid sm:grid-cols-3 gap-2"><input value={w.provider} onChange={e=>updateWallet(i,"provider",e.target.value)} placeholder="DANA / OVO / GoPay" className="h-10 rounded-lg border px-3 text-sm"/><input value={w.account_name} onChange={e=>updateWallet(i,"account_name",e.target.value)} placeholder="Nama pemilik" className="h-10 rounded-lg border px-3 text-sm"/><div className="flex gap-2"><input value={w.account_number} onChange={e=>updateWallet(i,"account_number",e.target.value)} placeholder="Nomor" className="h-10 rounded-lg border px-3 text-sm flex-1"/><button type="button" onClick={()=>setPayment({...payment,ewallets:payment.ewallets.filter((_,j)=>j!==i)})} className="text-rose-500"><Trash2 size={17}/></button></div></div>)}</div>

        <label className="block mt-6 text-sm font-semibold text-slate-700">QRIS</label>
        <input type="file" accept="image/*" onChange={readQris} className="mt-2 text-sm"/>
        {payment.qris_image && <div className="mt-3 flex items-start gap-3"><img src={payment.qris_image} alt="QRIS" className="w-40 rounded-xl border"/><button type="button" onClick={()=>setPayment({...payment,qris_image:null})} className="text-sm text-rose-600">Hapus QRIS</button></div>}
        <button onClick={savePayment} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{background:"hsl(var(--primary))"}}><Save size={16}/>{busy ? "Menyimpan..." : "Simpan Tujuan Pembayaran"}</button>
      </div>
    </div>
  );
}
