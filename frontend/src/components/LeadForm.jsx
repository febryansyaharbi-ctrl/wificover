import { useState } from "react";
import { X, User, Phone, ArrowRight } from "lucide-react";
import { api, tenantParams, formatApiError } from "@/lib/api";
import { PrimaryButton } from "@/components/Brand";
import { toast } from "sonner";

export default function LeadForm({ open, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nama wajib diisi.");
    if (!phone.trim()) return toast.error("Nomor WhatsApp wajib diisi.");
    setLoading(true);
    try {
      const { data } = await api.post("/leads", { name: name.trim(), phone: phone.trim(), ...tenantParams() });
      onCreated(data);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 sm:p-4"
         data-testid="lead-form-overlay">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 sm:p-8 animate-fade-up">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="font-display text-xl font-bold text-slate-900">Cek Jangkauan di Lokasi Anda</h3>
            <p className="text-sm text-slate-500 mt-1">Isi data singkat untuk melanjutkan ke peta jangkauan.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1" data-testid="lead-form-close">
            <X size={22} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Nama Lengkap</label>
            <div className="relative">
              <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                data-testid="lead-form-name-input"
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Budi Santoso"
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/20 outline-none text-slate-900"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 mb-1.5 block">Nomor WhatsApp / Telepon</label>
            <div className="relative">
              <Phone size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                data-testid="lead-form-phone-input"
                value={phone} onChange={(e) => setPhone(e.target.value)}
                inputMode="tel" placeholder="0812xxxxxxxx"
                className="w-full h-12 pl-11 pr-4 rounded-xl border border-slate-200 focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary))]/20 outline-none text-slate-900"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1.5">Format: 08xx, 62xx, atau +62xx</p>
          </div>
          <PrimaryButton type="submit" disabled={loading} className="w-full !py-3.5" data-testid="lead-form-submit-button">
            {loading ? "Tunggu sebentar…" : "Lanjutkan ke Peta Jangkauan"} <ArrowRight size={18} />
          </PrimaryButton>
        </form>
      </div>
    </div>
  );
}
