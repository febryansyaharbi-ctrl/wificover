import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Trash2, Eye, CheckCircle2, PowerOff, Loader2, FileUp, X } from "lucide-react";

const TYPE_LABEL = { kmz: "KMZ", kml: "KML", geojson: "GeoJSON" };
const STATUS_TONE = {
  READY: "bg-emerald-100 text-emerald-700",
  PROCESSING: "bg-blue-100 text-blue-700",
  UPLOADED: "bg-amber-100 text-amber-700",
  FAILED: "bg-rose-100 text-rose-700",
};

export default function CoveragePage() {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get("/coverage"); setFiles(data); } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      setFiles((f) => { if (f.some((x) => ["UPLOADED", "PROCESSING"].includes(x.status))) load(); return f; });
    }, 3000);
    return () => clearInterval(t);
  }, [load]);

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      await api.post("/coverage/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("File diunggah. Sedang diproses…");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Gagal mengunggah file.");
    } finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const act = async (id, action) => {
    try { await api.post(`/coverage/${id}/${action}`); load(); toast.success("Berhasil diperbarui."); }
    catch (e) { toast.error(e.response?.data?.detail || "Gagal."); }
  };
  const del = async (id) => {
    if (!window.confirm("Hapus file coverage ini beserta seluruh geometrinya?")) return;
    try { await api.delete(`/coverage/${id}`); load(); toast.success("File dihapus."); }
    catch { toast.error("Gagal menghapus."); }
  };

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Manajemen Coverage</h1>
          <p className="text-slate-500 mt-1">Unggah dan kelola data jangkauan (KMZ, KML, GeoJSON).</p>
        </div>
        <button onClick={() => inputRef.current?.click()} disabled={uploading} data-testid="admin-gis-upload-button"
                className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white active:scale-95 transition disabled:opacity-60"
                style={{ background: "hsl(var(--primary))" }}>
          {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />} Unggah File GIS
        </button>
        <input ref={inputRef} type="file" accept=".kmz,.kml,.geojson,.json" className="hidden" onChange={onUpload} data-testid="admin-gis-file-input" />
      </div>

      <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nama File</th>
                <th className="px-4 py-3 font-medium">Tipe</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Geometri</th>
                <th className="px-4 py-3 font-medium">Tanggal</th>
                <th className="px-4 py-3 font-medium">Aktif</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100" data-testid="coverage-files-table">
              {files.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Belum ada file coverage.</td></tr>}
              {files.map((f) => (
                <tr key={f.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900 max-w-[220px] truncate">{f.filename}</td>
                  <td className="px-4 py-3 text-slate-600">{TYPE_LABEL[f.file_type] || f.file_type}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STATUS_TONE[f.status] || "bg-slate-100"}`}>{f.status}</span>
                    {f.status === "FAILED" && f.error && <p className="text-xs text-rose-500 mt-1 max-w-[200px] truncate" title={f.error}>{f.error}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{f.geometry_count?.toLocaleString("id-ID") || 0}</td>
                  <td className="px-4 py-3 text-slate-500">{f.created_at ? new Date(f.created_at).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="px-4 py-3">
                    {f.active ? <span className="text-emerald-600 font-semibold text-xs">Aktif</span> : <span className="text-slate-400 text-xs">Nonaktif</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {f.status === "READY" && (
                        <button onClick={() => setPreview(f)} title="Preview" className="p-2 rounded-lg hover:bg-slate-100 text-slate-500" data-testid={`coverage-preview-${f.id}`}><Eye size={16} /></button>
                      )}
                      {f.status === "READY" && !f.active && (
                        <button onClick={() => act(f.id, "activate")} title="Aktifkan" className="p-2 rounded-lg hover:bg-emerald-50 text-emerald-600" data-testid={`coverage-activate-${f.id}`}><CheckCircle2 size={16} /></button>
                      )}
                      {f.active && (
                        <button onClick={() => act(f.id, "deactivate")} title="Nonaktifkan" className="p-2 rounded-lg hover:bg-amber-50 text-amber-600"><PowerOff size={16} /></button>
                      )}
                      <button onClick={() => del(f.id)} title="Hapus" className="p-2 rounded-lg hover:bg-rose-50 text-rose-500" data-testid={`coverage-delete-${f.id}`}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {preview && <PreviewModal file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function PreviewModal({ file, onClose }) {
  const mapEl = useRef(null);
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let map;
    api.get(`/coverage/${file.id}/geometries`).then(({ data }) => {
      setInfo({ count: data.features.length, extent: data.extent });
      const L = window.L;
      map = L.map(mapEl.current, { zoomControl: true }).setView([-7.5, 112.2], 11);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);
      const layer = L.geoJSON(data, { style: { color: "#6D28D9", weight: 1.5, fillColor: "#7C3AED", fillOpacity: 0.2 } }).addTo(map);
      try { map.fitBounds(layer.getBounds(), { padding: [20, 20] }); } catch {}
      setTimeout(() => map.invalidateSize(), 200);
    });
    return () => { if (map) map.remove(); };
  }, [file.id]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4" data-testid="coverage-preview-modal">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-slate-900 truncate max-w-[400px]">{file.filename}</h3>
            <p className="text-xs text-slate-500">
              {file.geometry_count?.toLocaleString("id-ID")} geometri • {info ? `Menampilkan ${info.count}` : "Memuat…"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-500"><X size={20} /></button>
        </div>
        <div ref={mapEl} className="h-[420px]" />
      </div>
    </div>
  );
}
