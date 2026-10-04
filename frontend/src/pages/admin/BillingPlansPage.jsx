import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const EMPTY = { name: "", price: "", duration_days: 30, description: "", active: true, display_order: 0 };

export default function BillingPlansPage() {
  const [plans, setPlans] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/billing/plans"); setPlans(r.data || []); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm("Hapus paket subscription ini?")) return;
    try {
      await api.delete("/billing/plans/" + id);
      toast.success("Paket berhasil dihapus.");
      load();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  return (
    <div data-testid="billing-plans-page">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Paket Subscription</h1>
          <p className="text-slate-500 mt-1">Kelola paket langganan SaaS untuk tenant.</p>
        </div>
        <button onClick={() => setEditing(EMPTY)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{background:"hsl(var(--primary))"}}>
          <Plus size={17}/> Tambah Paket
        </button>
      </div>

      {loading ? <div className="py-12 text-center text-slate-400">Memuat paket…</div> :
        plans.length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400">Belum ada paket subscription.</div> :
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {plans.map(p => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex justify-between gap-3">
                <div><h3 className="font-bold text-slate-900">{p.name}</h3><p className="text-sm text-slate-400">{p.duration_days} hari</p></div>
                <span className={p.active ? "text-emerald-700 bg-emerald-100" : "text-slate-500 bg-slate-100"} style={{borderRadius:999,padding:"3px 9px",fontSize:12,fontWeight:600}}>
                  {p.active ? "Aktif" : "Nonaktif"}
                </span>
              </div>
              <div className="mt-3 font-display text-xl font-bold" style={{color:"hsl(var(--primary))"}}>Rp {Number(p.price || 0).toLocaleString("id-ID")}</div>
              <p className="text-sm text-slate-500 mt-2 min-h-10">{p.description || "Tanpa deskripsi."}</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setEditing(p)} className="flex-1 py-2 rounded-lg text-sm bg-slate-100 flex items-center justify-center gap-1.5"><Pencil size={15}/> Edit</button>
                <button onClick={() => remove(p.id)} className="py-2 px-3 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={15}/></button>
              </div>
            </div>
          ))}
        </div>
      }
      {editing && <PlanModal plan={editing} close={() => setEditing(null)} saved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function PlanModal({ plan, close, saved }) {
  const [form, setForm] = useState({...plan});
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({...form, [key]: e.target.value});
  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || form.price === "") return toast.error("Nama dan harga wajib diisi.");
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        price: Number(form.price),
        duration_days: Number(form.duration_days),
        description: form.description || "",
        active: !!form.active,
        display_order: Number(form.display_order) || 0
      };
      if (form.id) await api.put("/billing/plans/" + form.id, body);
      else await api.post("/billing/plans", body);
      toast.success("Paket subscription berhasil disimpan.");
      saved();
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/60 p-4">
      <form onSubmit={save} className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6">
        <div className="flex justify-between items-center mb-5"><h3 className="font-bold text-lg">{form.id ? "Edit Paket" : "Tambah Paket"}</h3><button type="button" onClick={close}><X size={20}/></button></div>
        <div className="space-y-3">
          <label className="block text-sm font-medium">Nama Paket<input required value={form.name} onChange={set("name")} className="w-full mt-1 h-11 px-3 rounded-xl border border-slate-200" placeholder="Basic"/></label>
          <label className="block text-sm font-medium">Harga (Rp)<input required type="number" min="0" value={form.price} onChange={set("price")} className="w-full mt-1 h-11 px-3 rounded-xl border border-slate-200"/></label>
          <label className="block text-sm font-medium">Durasi (hari)<input required type="number" min="1" max="3650" value={form.duration_days} onChange={set("duration_days")} className="w-full mt-1 h-11 px-3 rounded-xl border border-slate-200"/></label>
          <label className="block text-sm font-medium">Deskripsi<textarea value={form.description || ""} onChange={set("description")} className="w-full mt-1 min-h-20 p-3 rounded-xl border border-slate-200"/></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Urutan<input type="number" value={form.display_order ?? 0} onChange={set("display_order")} className="w-full mt-1 h-11 px-3 rounded-xl border border-slate-200"/></label>
            <label className="block text-sm font-medium">Status<select value={form.active ? "1" : "0"} onChange={e => setForm({...form, active:e.target.value === "1"})} className="w-full mt-1 h-11 px-3 rounded-xl border border-slate-200"><option value="1">Aktif</option><option value="0">Nonaktif</option></select></label>
          </div>
        </div>
        <button disabled={busy} className="mt-6 w-full py-3 rounded-xl text-white font-semibold disabled:opacity-60" style={{background:"hsl(var(--primary))"}}>{busy ? "Menyimpan…" : "Simpan Paket"}</button>
      </form>
    </div>
  );
}
