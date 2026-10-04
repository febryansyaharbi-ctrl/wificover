import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatIDR } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";

const EMPTY = { name: "", speed: "", price: "", description: "", active: true, display_order: 0 };

export default function PackagesPage() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/packages").then((r) => setItems(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!window.confirm("Hapus paket ini?")) return;
    try { await api.delete(`/packages/${id}`); load(); toast.success("Paket dihapus."); }
    catch { toast.error("Gagal menghapus."); }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Paket Internet</h1>
          <p className="text-slate-500 mt-1">Kelola daftar paket yang tampil di halaman publik.</p>
        </div>
        <button onClick={() => setEditing(EMPTY)} data-testid="package-add-button"
                className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white active:scale-95 transition"
                style={{ background: "hsl(var(--primary))" }}>
          <Plus size={18} /> Tambah Paket
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="packages-list">
        {items.length === 0 && <p className="text-slate-400">Belum ada paket.</p>}
        {items.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-display font-bold text-slate-900">{p.name}</h3>
                <p className="text-sm text-slate-400">{p.speed}</p>
              </div>
              <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${p.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                {p.active ? "Aktif" : "Nonaktif"}
              </span>
            </div>
            <div className="mt-3 font-display text-xl font-bold" style={{ color: "hsl(var(--primary))" }}>{formatIDR(p.price)}</div>
            <p className="text-sm text-slate-500 mt-2 line-clamp-2">{p.description}</p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setEditing(p)} className="flex-1 py-2 rounded-lg text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 flex items-center justify-center gap-1.5"><Pencil size={15} /> Edit</button>
              <button onClick={() => del(p.id)} className="py-2 px-3 rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
      </div>

      {editing && <PackageModal pkg={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function PackageModal({ pkg, onClose, onSaved }) {
  const [form, setForm] = useState({ ...pkg, price: pkg.price ?? "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    if (!form.name || !form.speed || form.price === "") return toast.error("Nama, kecepatan, dan harga wajib diisi.");
    setSaving(true);
    const payload = {
      name: form.name, speed: form.speed, price: Number(form.price),
      description: form.description || "", active: !!form.active,
      display_order: Number(form.display_order) || 0,
    };
    try {
      if (form.id) await api.put(`/packages/${form.id}`, payload);
      else await api.post("/packages", payload);
      toast.success("Paket disimpan."); onSaved();
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal menyimpan."); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4">
      <form onSubmit={save} className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 animate-fade-up" data-testid="package-modal">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-lg font-bold text-slate-900">{form.id ? "Edit Paket" : "Tambah Paket"}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <Field label="Nama Paket"><input data-testid="package-name-input" value={form.name} onChange={set("name")} className="inp" placeholder="Home 50 Mbps" /></Field>
          <Field label="Kecepatan"><input data-testid="package-speed-input" value={form.speed} onChange={set("speed")} className="inp" placeholder="50 Mbps" /></Field>
          <Field label="Harga (Rp)"><input data-testid="package-price-input" type="number" value={form.price} onChange={set("price")} className="inp" placeholder="265000" /></Field>
          <Field label="Deskripsi"><textarea value={form.description} onChange={set("description")} className="inp min-h-[70px]" placeholder="Deskripsi singkat paket" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Urutan"><input type="number" value={form.display_order} onChange={set("display_order")} className="inp" /></Field>
            <Field label="Status">
              <select value={form.active ? "1" : "0"} onChange={(e) => setForm({ ...form, active: e.target.value === "1" })} className="inp">
                <option value="1">Aktif</option><option value="0">Nonaktif</option>
              </select>
            </Field>
          </div>
        </div>
        <button type="submit" disabled={saving} data-testid="package-save-button"
                className="mt-6 w-full py-3 rounded-xl text-white font-semibold active:scale-[0.98] transition disabled:opacity-60"
                style={{ background: "hsl(var(--primary))" }}>{saving ? "Menyimpan…" : "Simpan Paket"}</button>
      </form>
      <style>{`.inp{width:100%;height:44px;padding:0 14px;border:1px solid #e2e8f0;border-radius:12px;outline:none}.inp:focus{border-color:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--primary)/0.15)}textarea.inp{height:auto;padding:10px 14px}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="text-sm font-medium text-slate-700 mb-1 block">{label}</label>{children}</div>;
}
