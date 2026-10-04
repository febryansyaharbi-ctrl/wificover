import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { waLink } from "@/lib/format";
import { StatusBadge } from "@/pages/admin/Dashboard";
import { Search, MessageCircle, ChevronLeft, ChevronRight, MapPin, Download, Trash2 } from "lucide-react";

const STATUSES = ["ALL", "NOT_CHECKED", "COVERED", "NOT_COVERED"];
const STATUS_LABEL = { ALL: "Semua", NOT_CHECKED: "Belum Dicek", COVERED: "Tercover", NOT_COVERED: "Belum Tercover" };

export default function LeadsPage() {
  const [data, setData] = useState({ leads: [], total: 0, page: 1, limit: 20 });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteMode, setDeleteMode] = useState(false);

  const load = useCallback(async () => {
    const params = { page, limit: 20 };
    if (search) params.search = search;
    if (status !== "ALL") params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    try { const { data } = await api.get("/leads", { params }); setData(data); } catch {}
  }, [page, search, status, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, status, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));
  const allVisibleSelected = data.leads.length > 0 && data.leads.every((l) => selectedIds.includes(l.id));

  const toggleSelect = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const toggleSelectVisible = () => {
    const ids = data.leads.map((l) => l.id);
    setSelectedIds((current) => allVisibleSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]);
  };

  const handleBulkDelete = async () => {
    if (!selectedIds.length) return window.alert("Centang DataLead yang ingin dihapus.");
    if (!window.confirm(`Hapus ${selectedIds.length} DataLead yang dipilih? Data yang dihapus tidak dapat dikembalikan.`)) return;
    try {
      await api.post("/leads/bulk-delete", { ids: selectedIds });
      setSelectedIds([]);
      await load();
    } catch (error) {
      window.alert(error?.response?.data?.detail || "DataLead gagal dihapus.");
    }
  };

  const handleDeleteAll = async () => {
    if (!data.total) return window.alert("Tidak ada DataLead untuk dihapus.");
    if (!window.confirm(`HAPUS SEMUA ${data.total} DataLead tenant ini? Tindakan ini tidak dapat dibatalkan.`)) return;
    if (!window.confirm("Konfirmasi terakhir: semua DataLead akan dihapus permanen. Lanjutkan?")) return;
    try {
      await api.delete("/leads/all");
      setSelectedIds([]);
      await load();
    } catch (error) {
      window.alert(error?.response?.data?.detail || "Semua DataLead gagal dihapus.");
    }
  };

  const currentParams = () => {
    const params = {};
    if (search) params.search = search;
    if (status !== "ALL") params.status = status;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    return params;
  };

  const handleExport = async () => {
    try {
      const response = await api.get("/leads/export", { params: currentParams(), responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "DataLead.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error?.response?.data?.detail || "Export DataLead gagal.");
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Leads</h1>
          <p className="text-slate-500 mt-1">Daftar calon pelanggan yang mengecek coverage.</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => setDeleteMode((v) => !v)} data-testid="leads-delete-mode-button"
                  className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl border font-semibold ${deleteMode ? "border-red-300 bg-red-50 text-red-600" : "border-slate-200 bg-white text-slate-700"}`}>
            <Trash2 size={17} /> {deleteMode ? "Tutup Hapus" : "Kelola Hapus"}
          </button>
          <button onClick={handleExport} data-testid="leads-export-button"
                className="inline-flex items-center justify-center gap-2 h-11 px-4 rounded-xl text-white font-semibold"
                style={{ background: "hsl(var(--primary))" }}>
          <Download size={17} /> Export Excel
          </button>
        </div>
      </div>
      {deleteMode && (
        <div className="mt-4 rounded-2xl border border-red-100 bg-red-50/60 p-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 cursor-pointer">
            <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectVisible} />
            Centang semua data di halaman ini
          </label>
          <span className="text-sm text-slate-500">{selectedIds.length} dipilih</span>
          <button onClick={handleBulkDelete} disabled={!selectedIds.length}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 text-white px-4 py-2.5 font-semibold disabled:opacity-40">
            <Trash2 size={16} /> Hapus Terpilih
          </button>
          <button onClick={handleDeleteAll} disabled={!data.total}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white text-red-600 px-4 py-2.5 font-semibold disabled:opacity-40">
            Hapus Semua ({data.total})
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input data-testid="leads-search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama / nomor…"
                 className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 outline-none focus:border-[hsl(var(--primary))]" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} data-testid="leads-status-filter"
                className="h-11 px-4 rounded-xl border border-slate-200 outline-none bg-white">
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} data-testid="leads-date-from" className="h-11 px-3 rounded-xl border border-slate-200 outline-none bg-white" />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} data-testid="leads-date-to" className="h-11 px-3 rounded-xl border border-slate-200 outline-none bg-white" />
      </div>

      <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                {(deleteMode ? ["Pilih", "Nama", "Nomor", "Lokasi", "Status", "Jarak", "Kota", "Area Coverage", "Dibuat", "Aksi"] : ["Nama", "Nomor", "Lokasi", "Status", "Jarak", "Kota", "Area Coverage", "Dibuat", "Aksi"]).map((h) => (
                  <th key={h} className="px-4 py-3 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100" data-testid="leads-table">
              {data.leads.length === 0 && <tr><td colSpan={deleteMode ? 10 : 9} className="px-4 py-8 text-center text-slate-400">Tidak ada data.</td></tr>}
              {data.leads.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  {deleteMode && <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.includes(l.id)} onChange={() => toggleSelect(l.id)} aria-label={`Pilih ${l.name}`} /></td>}
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{l.name}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{l.phone}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {l.latitude != null ? (
                      <a href={`https://maps.google.com/?q=${l.latitude},${l.longitude}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-slate-900">
                        <MapPin size={14} /> {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}
                      </a>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={l.coverage_status} /></td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{l.coverage_distance != null ? `${Math.round(l.coverage_distance)} m` : "-"}</td>
                  <td className="px-4 py-3 text-slate-500">{l.city || "-"}</td>
                  <td className="px-4 py-3 text-slate-500 min-w-[180px]">{l.matched_coverage_area || "-"}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(l.created_at).toLocaleDateString("id-ID")}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <a href={waLink(l.phone, `Halo ${l.name}`)}
 target="_blank" rel="noreferrer" className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600 inline-flex" title="WhatsApp"><MessageCircle size={16} /></a>

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <p className="text-sm text-slate-500">Total {data.total} leads</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40"><ChevronLeft size={16} /></button>
            <span className="text-sm text-slate-600">{page} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-lg border border-slate-200 disabled:opacity-40"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
