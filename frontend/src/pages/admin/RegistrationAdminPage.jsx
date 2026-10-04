import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { waLink } from "@/lib/format";
import { CheckCircle2, CreditCard, RefreshCw, XCircle, Trash2, Copy, ExternalLink, MessageCircle } from "lucide-react";

const LABELS = {
  PENDING_PAYMENT: "Menunggu Pembayaran",
  PAYMENT_REPORTED: "Menunggu Verifikasi",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  ACTIVATION_PENDING: "Menunggu Aktivasi",
  ACTIVATED: "Aktif",
};

export default function RegistrationAdminPage() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  const load = async () => {
    try {
      const { data } = await api.get("/registration/admin/applications");
      setItems(data || []);
      setSelectedIds((ids) => ids.filter((id) => (data || []).some((item) => item.id === id)));
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Gagal memuat pendaftaran.");
    }
  };

  useEffect(() => { load(); }, []);

  const action = async (id, type) => {
    setBusy(id + type); setMessage("");
    try {
      const { data } = await api.post("/registration/admin/applications/" + id + "/" + type);
      if (type === "verify" && data?.activation_url) {
        await navigator.clipboard?.writeText(data.activation_url).catch(() => {});
        setMessage("Pendaftaran disetujui. Link aktivasi 1 kali berhasil dibuat dan disalin.");
      } else {
        setMessage(type === "verify" ? "Pembayaran berhasil diverifikasi." : "Pendaftaran ditolak.");
      }
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Aksi gagal.");
    } finally { setBusy(""); }
  };

  const toggleSelect = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  };

  const allVisibleSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));

  const toggleSelectAll = () => {
    const ids = items.map((item) => item.id);
    setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };

  const bulkDelete = async () => {
    if (!selectedIds.length) return window.alert("Centang pendaftaran yang ingin dihapus.");
    if (!window.confirm(`Hapus ${selectedIds.length} pendaftaran yang dipilih? Data yang dihapus tidak dapat dikembalikan.`)) return;
    setBusy("bulk-delete"); setMessage("");
    try {
      await api.post("/registration/admin/applications/bulk-delete", { ids: selectedIds });
      setSelectedIds([]);
      setMessage("Pendaftaran terpilih berhasil dihapus.");
      await load();
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Pendaftaran gagal dihapus.");
    } finally { setBusy(""); }
  };

  const deleteAll = async () => {
    if (!items.length) return window.alert("Tidak ada pendaftaran untuk dihapus.");
    if (!window.confirm(`HAPUS SEMUA ${items.length} pendaftaran yang tampil? Tindakan ini tidak dapat dibatalkan.`)) return;
    if (!window.confirm("Konfirmasi terakhir: semua data pendaftaran akan dihapus permanen. Lanjutkan?")) return;
    setBusy("delete-all"); setMessage("");
    try {
      await api.delete("/registration/admin/applications/all");
      setSelectedIds([]);
      setMessage("Semua data pendaftaran berhasil dihapus.");
      await load();
    } catch (e) {
      window.alert(e?.response?.data?.detail || "Semua pendaftaran gagal dihapus.");
    } finally { setBusy(""); }
  };

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Link aktivasi berhasil disalin. Kirim link ini kepada pendaftar.");
    } catch {
      window.prompt("Salin link aktivasi berikut:", url);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Pendaftaran Sub-Admin</h1>
          <p className="text-slate-500 mt-1">Verifikasi pembayaran, kirim link aktivasi, dan kelola calon Sub-Admin.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setDeleteMode((v) => !v)} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold ${deleteMode ? "border-red-300 bg-red-50 text-red-600" : "border-slate-200 bg-white text-slate-700"}`}>
            <Trash2 size={17}/> {deleteMode ? "Tutup Hapus" : "Kelola Hapus"}
          </button>
          <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
            <RefreshCw size={16}/> Refresh
          </button>
        </div>
      </div>

      {message && <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}

      {deleteMode && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/60 p-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll}/>
            Centang semua pendaftaran
          </label>
          <span className="text-sm text-slate-500">{selectedIds.length} dipilih</span>
          <button onClick={bulkDelete} disabled={!selectedIds.length || busy === "bulk-delete"} className="inline-flex items-center gap-2 rounded-xl bg-red-600 text-white px-4 py-2.5 font-semibold disabled:opacity-40">
            <Trash2 size={16}/> Hapus Terpilih
          </button>
          <button onClick={deleteAll} disabled={!items.length || busy === "delete-all"} className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white text-red-600 px-4 py-2.5 font-semibold disabled:opacity-40">
            Hapus Semua ({items.length})
          </button>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {items.map((a) => (
          <div key={a.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-start gap-3">
                {deleteMode && <input type="checkbox" className="mt-1.5" checked={selectedIds.includes(a.id)} onChange={() => toggleSelect(a.id)} aria-label={`Pilih ${a.name}`}/>}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-slate-900">{a.name}</h2>
                    <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-violet-50 text-violet-700">{LABELS[a.status] || a.status}</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">WhatsApp: +{a.whatsapp} · Paket: {a.plan_name}</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">Nominal: Rp {Number(a.amount || 0).toLocaleString("id-ID")}</p>
                  <p className="text-xs text-slate-400 mt-2">ID: {a.id}</p>
                  {a.payment_reported_at && <p className="text-xs text-emerald-600 mt-1">Dilaporkan: {new Date(a.payment_reported_at).toLocaleString("id-ID")}</p>}
                  {a.activation_expires_at && a.status === "ACTIVATION_PENDING" && (
                    <p className="text-xs text-amber-600 mt-1">Link aktivasi berlaku sampai {new Date(a.activation_expires_at).toLocaleString("id-ID")}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap lg:justify-end">
{(a.status === "PAYMENT_REPORTED" || a.status === "PENDING_PAYMENT") && (
                  <>
                    <button disabled={busy === a.id+"verify"} onClick={() => action(a.id,"verify")} title={a.status === "PAYMENT_REPORTED" ? "Setujui pembayaran yang sudah dilaporkan dan buat link aktivasi" : "Pendaftar belum klik Kirim Bukti Pembayaran. Super Admin tetap dapat menyetujui dan membuat link aktivasi."} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 disabled:opacity-40">
                      <CheckCircle2 size={16}/> Setujui & Buat Link
                    </button>
                    <button disabled={busy === a.id+"reject"} onClick={() => action(a.id,"reject")} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-700 bg-rose-50 border border-rose-200 disabled:opacity-50">
                      <XCircle size={16}/> Ditolak
                    </button>
                  </>
                )}

                {a.status === "ACTIVATION_PENDING" && a.activation_url && (
                  <>
                    <button onClick={() => copyLink(a.activation_url)} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white bg-violet-600">
                      <Copy size={16}/> Salin Link
                    </button>
                    <a href={waLink(a.whatsapp, `Halo ${a.name}, pembayaran pendaftaran Sub-Admin Anda sudah diverifikasi. Silakan lengkapi aktivasi akun melalui link berikut:\n\n${a.activation_url}\n\nLink ini hanya dapat digunakan satu kali dan berlaku sampai ${new Date(a.activation_expires_at).toLocaleString("id-ID")}.`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-4 py-2.5 text-sm font-semibold">
                      <MessageCircle size={16}/> Kirim via WA
                    </a>
                    <a href={a.activation_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700">
                      <ExternalLink size={16}/> Buka
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {!items.length && <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-400"><CreditCard size={32} className="mx-auto mb-3"/><p>Belum ada pendaftaran Sub-Admin.</p></div>}
      </div>
    </div>
  );
}
