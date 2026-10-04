import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { applyPrimaryColor } from "@/context/TenantContext";
import { toast } from "sonner";
import { Upload, Loader2, Wifi, Trash2 } from "lucide-react";

const PRESETS = ["#6D28D9", "#2563EB", "#059669", "#DC2626", "#EA580C", "#0891B2", "#DB2777", "#4F46E5"];

export default function BrandingPage() {
  const [tenant, setTenant] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const fileRef = useRef(null);
  const heroFileRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoadError("");
    api.get("/branding").then(({ data }) => {
      if (active) setTenant(data);
    }).catch((err) => {
      if (active) setLoadError(err.response?.data?.detail || "Gagal memuat branding.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (tenant) setForm({
      wifi_name: tenant.wifi_name || "", website_title: tenant.website_title || "",
      description: tenant.description || "", primary_color: tenant.primary_color || "#6D28D9",
      whatsapp_number: tenant.whatsapp_number || "", logo_url: tenant.logo_url || null,
      hero_image_url: tenant.hero_image_url || null,
      meta_pixel_id: tenant.meta_pixel_id || "",
    });
  }, [tenant]);

  if (!form) return <div className="text-slate-400">{loadError || "Memuat…"}</div>;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const pickColor = (c) => { setForm({ ...form, primary_color: c }); applyPrimaryColor(c); };

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/branding", {
        wifi_name: form.wifi_name, website_title: form.website_title, description: form.description,
        primary_color: form.primary_color, whatsapp_number: form.whatsapp_number, meta_pixel_id: form.meta_pixel_id,
      });
      const { data } = await api.get("/branding");
      setTenant(data);
      toast.success("Branding berhasil disimpan.");
    } catch (e) { toast.error(e.response?.data?.detail || "Gagal menyimpan."); }
    finally { setSaving(false); }
  };

  const deleteLogo = async () => {
    if (!form.logo_url || !window.confirm("Hapus logo tenant ini?")) return;
    setUploadingLogo(true);
    try {
      await api.delete("/branding/logo");
      setForm((f) => ({ ...f, logo_url: null }));
      const brandingResponse = await api.get("/branding");
      setTenant(brandingResponse.data);
      toast.success("Logo dihapus.");
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal menghapus logo."); }
    finally { setUploadingLogo(false); }
  };

  const uploadLogo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/branding/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, logo_url: data.logo_url }));
      const brandingResponse = await api.get("/branding");
      setTenant(brandingResponse.data);
      toast.success("Logo diperbarui.");
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal mengunggah logo."); }
    finally { setUploadingLogo(false); }
  };

  const uploadHero = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHero(true);
    const fd = new FormData(); fd.append("file", file);
    try {
      const { data } = await api.post("/branding/hero-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((f) => ({ ...f, hero_image_url: data.hero_image_url }));
      const brandingResponse = await api.get("/branding");
      setTenant(brandingResponse.data);
      toast.success("Gambar hero halaman utama diperbarui.");
    } catch (err) { toast.error(err.response?.data?.detail || "Gagal mengunggah gambar hero."); }
    finally { setUploadingHero(false); }
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Branding</h1>
      <p className="text-slate-500 mt-1">Sesuaikan tampilan tenant Anda. Perubahan hanya berlaku untuk tenant ini.</p>

      <div className="mt-6 grid gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-display font-semibold text-slate-900 mb-4">Logo</h3>
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-2xl border border-slate-200 grid place-items-center overflow-hidden bg-slate-50">
              {form.logo_url ? <img src={form.logo_url} alt="logo" className="h-full w-full object-contain" />
                : <Wifi size={26} style={{ color: "hsl(var(--primary))" }} />}
            </div>
            <div>
              <button onClick={() => fileRef.current?.click()} disabled={uploadingLogo} data-testid="branding-logo-upload"
                      className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white active:scale-95 transition disabled:opacity-60"
                      style={{ background: "hsl(var(--primary))" }}>
                {uploadingLogo ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Unggah Logo
              </button>
              <div className="flex items-center gap-2 mt-1.5">
                <p className="text-xs text-slate-400">PNG/JPG, maksimal 2MB.</p>
                {form.logo_url && <button type="button" onClick={deleteLogo} disabled={uploadingLogo} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"><Trash2 size={13}/> Hapus</button>}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadLogo} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="font-display font-semibold text-slate-900 mb-4">Gambar Besar Halaman Utama</h3>
          <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
            {form.hero_image_url ? (
              <img src={form.hero_image_url} alt="Hero" className="w-full h-48 object-cover" />
            ) : <div className="h-48 grid place-items-center text-slate-400 text-sm">Menggunakan gambar default</div>}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={() => heroFileRef.current?.click()} disabled={uploadingHero}
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: "hsl(var(--primary))" }}>
              {uploadingHero ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} Ganti Gambar Hero
            </button>
            <p className="text-xs text-slate-400">JPG/PNG/WebP, maksimal 5MB. Gambar ini tampil besar di halaman Cek Coverage tenant.</p>
          </div>
          <input ref={heroFileRef} type="file" accept="image/*" className="hidden" onChange={uploadHero} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <Field label="Nama WiFi"><input data-testid="branding-wifi-name-input" value={form.wifi_name} onChange={set("wifi_name")} className="binp" /></Field>
          <Field label="Judul Website"><input data-testid="branding-title-input" value={form.website_title} onChange={set("website_title")} className="binp" /></Field>
          <Field label="Deskripsi Singkat"><textarea value={form.description} onChange={set("description")} className="binp min-h-[80px]" /></Field>
          <Field label="Nomor WhatsApp"><input data-testid="branding-whatsapp-input" value={form.whatsapp_number} onChange={set("whatsapp_number")} className="binp" placeholder="628xxxxxxxxxx" /></Field>
          <Field label="Meta Pixel ID"><input data-testid="branding-meta-pixel-input" value={form.meta_pixel_id} onChange={set("meta_pixel_id")} className="binp" placeholder="Contoh: 123456789012345" /><p className="text-xs text-slate-400 mt-1">Opsional. Masukkan Pixel ID Meta saja; tidak perlu koneksi akun iklan.</p></Field>

          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Warna Utama</label>
            <div className="flex items-center gap-3 flex-wrap">
              <input type="color" data-testid="admin-branding-color-picker" value={form.primary_color}
                     onChange={(e) => pickColor(e.target.value)}
                     className="h-11 w-14 rounded-lg border border-slate-200 cursor-pointer" />
              <div className="flex gap-2 flex-wrap">
                {PRESETS.map((c) => (
                  <button key={c} onClick={() => pickColor(c)} title={c}
                          className={`h-9 w-9 rounded-full border-2 transition ${form.primary_color?.toLowerCase() === c.toLowerCase() ? "border-slate-900 scale-110" : "border-white shadow"}`}
                          style={{ background: c }} />
                ))}
              </div>
              <span className="text-sm text-slate-500">{form.primary_color}</span>
            </div>
          </div>
        </div>

        <div>
          <button onClick={save} disabled={saving} data-testid="admin-branding-save-button"
                  className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white active:scale-95 transition disabled:opacity-60"
                  style={{ background: "hsl(var(--primary))" }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : null} Simpan Perubahan
          </button>
        </div>
      </div>
      <style>{`.binp{width:100%;height:44px;padding:0 14px;border:1px solid #e2e8f0;border-radius:12px;outline:none}.binp:focus{border-color:hsl(var(--primary));box-shadow:0 0 0 3px hsl(var(--primary)/0.15)}textarea.binp{height:auto;padding:10px 14px}`}</style>
    </div>
  );
}

function Field({ label, children }) {
  return <div><label className="text-sm font-medium text-slate-700 mb-1 block">{label}</label>{children}</div>;
}
