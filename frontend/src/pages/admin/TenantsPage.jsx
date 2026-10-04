import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Building2, Plus, Power, X, CreditCard, Trash2, RefreshCw, History } from "lucide-react";

const emptyForm = {
  name: "", subdomain: "", admin_name: "", admin_email: "",
  admin_password: "", whatsapp_number: "", wifi_name: "",
};

const emptyBilling = { plan_id: "", status: "ACTIVE", started_at: "", expires_at: "", notes: "" };

const STATUS_LABELS = {
  NOT_CONFIGURED: "Belum diatur", TRIAL: "Trial", ACTIVE: "Aktif",
  EXPIRED: "Expired", LOCKED: "Terkunci",
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [billing, setBilling] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [history, setHistory] = useState(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const [tenantRes, planRes, subscriptionRes] = await Promise.all([
        api.get("/tenants"), api.get("/billing/plans"), api.get("/billing/subscriptions"),
      ]);
      setTenants(tenantRes.data || []);
      setPlans((planRes.data || []).filter((p) => p.active));
      setSubscriptions(subscriptionRes.data || []);
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Gagal memuat data tenant");
    }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true); setMessage("");
    try {
      await api.post("/tenants", form);
      setForm(emptyForm); setOpen(false);
      setMessage("Tenant dan akun SubAdmin berhasil dibuat.");
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Gagal membuat tenant");
    } finally { setBusy(false); }
  };

  const removeTenant = async (tenant) => {
    if (tenant.is_default) return;
    const ok = window.confirm(
      `Hapus tenant "${tenant.name}" beserta akun SubAdmin, billing, leads, paket internet, dan data coverage? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!ok) return;
    try {
      await api.delete("/tenants/" + tenant.id);
      setMessage("Tenant berhasil dihapus.");
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Gagal menghapus tenant");
    }
  };

  const toggle = async (tenant) => {
    if (tenant.is_default) return;
    const status = tenant.status === "ACTIVE" ? "LOCKED" : "ACTIVE";
    if (!window.confirm(status === "LOCKED" ? "Nonaktifkan tenant ini?" : "Aktifkan kembali tenant ini?")) return;
    try { await api.put("/tenants/" + tenant.id, { status }); await load(); }
    catch (e) { setMessage(e?.response?.data?.detail || "Gagal mengubah status"); }
  };

  const openBilling = (tenant) => {
    const current = subscriptions.find((s) => s.tenant_id === tenant.id);
    setBilling({
      tenant,
      form: current ? {
        plan_id: current.plan_id || "", status: current.status || "NOT_CONFIGURED",
        started_at: current.started_at || "", expires_at: current.expires_at || "", notes: current.notes || "",
      } : { ...emptyBilling },
    });
  };

  const openHistory = async (tenant) => {
    setBillingBusy(true);
    try {
      const { data } = await api.get("/billing/subscriptions/" + tenant.id + "/history");
      setHistory({ tenant, items: data || [] });
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Gagal memuat riwayat subscription");
    } finally { setBillingBusy(false); }
  };

  const renewSubscription = async (tenant) => {
    const current = subscriptions.find((s) => s.tenant_id === tenant.id);
    if (!current?.plan_id) {
      setMessage("Tenant belum memiliki paket subscription.");
      return;
    }
    if (!window.confirm(`Perpanjang subscription "${tenant.name}" sesuai durasi paket saat ini?`)) return;
    setBillingBusy(true);
    try {
      await api.post("/billing/subscriptions/" + tenant.id + "/renew");
      setMessage("Subscription tenant berhasil diperpanjang.");
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Gagal memperpanjang subscription");
    } finally { setBillingBusy(false); }
  };

  const saveBilling = async (e) => {
    e.preventDefault();
    if (!billing) return;
    setBillingBusy(true);
    try {
      const current = billing.form;
      await api.put("/billing/subscriptions/" + billing.tenant.id, {
        plan_id: current.plan_id || null,
        status: current.status,
        started_at: current.started_at || null,
        expires_at: current.expires_at || null,
        notes: current.notes || null,
      });
      setBilling(null);
      setMessage("Subscription tenant berhasil diperbarui.");
      await load();
    } catch (e) {
      setMessage(e?.response?.data?.detail || "Gagal memperbarui subscription");
    } finally { setBillingBusy(false); }
  };

  return (
    <div data-testid="admin-tenants">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Tenants</h1>
          <p className="text-slate-500 mt-1">Kelola tenant, akun SubAdmin, dan subscription SaaS.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "hsl(var(--primary))" }}>
          <Plus size={18} /> Tambah Tenant
        </button>
      </div>

      {message && <div className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">{message}</div>}

      <div className="mt-6 grid gap-4">
        {tenants.map((t) => {
          const sub = subscriptions.find((s) => s.tenant_id === t.id);
          const subStatusClass = sub?.status === "ACTIVE"
            ? "bg-emerald-100 text-emerald-700"
            : sub?.status === "TRIAL"
              ? "bg-amber-100 text-amber-700"
              : sub?.status === "NOT_CONFIGURED"
                ? "bg-slate-100 text-slate-600"
                : "bg-rose-100 text-rose-700";
          const tenantStatusClass = t.status === "ACTIVE"
            ? "bg-emerald-100 text-emerald-700"
            : "bg-rose-100 text-rose-700";
          return (
            <div key={t.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center bg-violet-100 text-violet-600"><Building2 size={20} /></span>
                  <div>
                    <h3 className="font-semibold text-slate-900">{t.name}</h3>
                    <p className="text-sm text-slate-500">{t.wifi_name || "-"} · <b>{t.subdomain}</b></p>
                    <p className="text-xs text-slate-400 mt-1">SubAdmin: {t.sub_admin_count || 0} · WhatsApp: {t.whatsapp_number || "-"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold rounded-full px-2.5 py-1 bg-violet-50 text-violet-700">Paket: {sub?.plan_name || "Belum diatur"}</span>
                      {sub && <span className={"text-xs font-semibold rounded-full px-2.5 py-1 " + subStatusClass}>{STATUS_LABELS[sub.status] || sub.status}</span>}
                      {sub?.expires_at && <span className="text-xs text-slate-400">s/d {formatDate(sub.expires_at)}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={"text-xs font-semibold rounded-full px-2.5 py-1 " + tenantStatusClass}>{t.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</span>
                  <button onClick={() => openBilling(t)} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 px-3 py-2 text-sm font-medium hover:bg-violet-100">
                    <CreditCard size={16} /> Subscription
                  </button>
                  {sub?.plan_id && (
                    <button onClick={() => renewSubscription(t)} disabled={billingBusy} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-medium hover:bg-emerald-100 disabled:opacity-50">
                      <RefreshCw size={16} /> Perpanjang
                    </button>
                  )}
                  <button onClick={() => openHistory(t)} disabled={billingBusy} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    <History size={16} /> Riwayat
                  </button>
                  {!t.is_default && (
                    <>
                      <button onClick={() => toggle(t)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <Power size={16} /> {t.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                      </button>
                      <button onClick={() => removeTenant(t)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">
                        <Trash2 size={16} /> Hapus
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {!tenants.length && <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400">Belum ada tenant.</div>}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 p-4 grid place-items-center">
          <form onSubmit={create} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div><h2 className="font-display text-xl font-bold text-slate-900">Tambah Tenant</h2><p className="text-xs text-slate-400 mt-1">Tenant baru dimulai tanpa data coverage.</p></div>
              <button type="button" onClick={() => setOpen(false)}><X size={22} /></button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Nama Tenant" value={form.name} onChange={v => setForm({...form,name:v})} required />
              <Field label="Subdomain" placeholder="contoh: kediri" value={form.subdomain} onChange={v => setForm({...form,subdomain:v})} required />
              <Field label="Nama WiFi" value={form.wifi_name} onChange={v => setForm({...form,wifi_name:v})} />
              <Field label="WhatsApp Tenant" placeholder="08xxxxxxxxxx" value={form.whatsapp_number} onChange={v => setForm({...form,whatsapp_number:v})} required />
              <Field label="Nama SubAdmin" value={form.admin_name} onChange={v => setForm({...form,admin_name:v})} required />
              <Field label="Email SubAdmin" type="email" value={form.admin_email} onChange={v => setForm({...form,admin_email:v})} required />
              <Field label="Password SubAdmin" type="password" minLength={8} value={form.admin_password} onChange={v => setForm({...form,admin_password:v})} required />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-700">Batal</button>
              <button disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{background:"hsl(var(--primary))"}}>{busy ? "Membuat..." : "Buat Tenant"}</button>
            </div>
          </form>
        </div>
      )}

      {history && (
        <HistoryModal
          tenant={history.tenant}
          items={history.items}
          close={() => setHistory(null)}
        />
      )}

      {billing && (
        <BillingModal
          tenant={billing.tenant}
          form={billing.form}
          plans={plans}
          busy={billingBusy}
          close={() => setBilling(null)}
          save={saveBilling}
          setForm={(next) => setBilling((b) => ({...b, form: next}))}
        />
      )}
    </div>
  );
}

function HistoryModal({ tenant, items, close }) {
  return (
    <div className="fixed inset-0 z-[70] bg-slate-900/60 p-4 grid place-items-center">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">Riwayat Subscription</h2>
            <p className="text-sm text-slate-500 mt-1">{tenant.name} · {tenant.subdomain}</p>
          </div>
          <button type="button" onClick={close}><X size={22} /></button>
        </div>
        {items.length ? (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-slate-900">{item.action === "RENEW" ? "Perpanjangan" : "Perubahan Subscription"}</span>
                  <span className="text-xs text-slate-400">{formatDateTime(item.created_at)}</span>
                </div>
                <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                  <HistoryState label="Sebelum" value={item.before} />
                  <HistoryState label="Sesudah" value={item.after} />
                </div>
              </div>
            ))}
          </div>
        ) : <p className="py-8 text-center text-sm text-slate-400">Belum ada riwayat subscription.</p>}
        <button type="button" onClick={close} className="mt-5 rounded-xl px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-700">Tutup</button>
      </div>
    </div>
  );
}

function HistoryState({ label, value }) {
  if (!value) return <div className="rounded-xl bg-slate-50 p-3"><b>{label}</b><div className="mt-1 text-slate-400">Belum ada</div></div>;
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <b>{label}</b>
      <div className="mt-1 text-slate-600">{value.plan_name || "Tanpa paket"} · {STATUS_LABELS[value.status] || value.status}</div>
      <div className="mt-1 text-slate-400">Berakhir: {formatDate(value.expires_at) || "-"}</div>
    </div>
  );
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function BillingModal({ tenant, form, plans, busy, close, save, setForm }) {
  const changePlan = (planId) => {
    const changed = planId !== (form.plan_id || "");
    setForm({
      ...form,
      plan_id: planId,
      started_at: changed ? "" : form.started_at,
      expires_at: changed ? "" : form.expires_at,
      status: planId ? (form.status === "NOT_CONFIGURED" ? "ACTIVE" : form.status) : "NOT_CONFIGURED",
    });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/60 p-4 grid place-items-center">
      <form onSubmit={save} className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div><h2 className="font-display text-xl font-bold text-slate-900">Atur Subscription</h2><p className="text-sm text-slate-500 mt-1">{tenant.name} · {tenant.subdomain}</p></div>
          <button type="button" onClick={close}><X size={22} /></button>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Paket Subscription
            <select value={form.plan_id} onChange={(e) => changePlan(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-200">
              <option value="">Belum memilih paket</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.duration_days} hari · Rp {Number(p.price || 0).toLocaleString("id-ID")}</option>)}
            </select>
            {plans.length === 0 && <span className="block mt-1 text-xs text-amber-600">Belum ada paket aktif. Buat paket terlebih dahulu di menu Billing.</span>}
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Status
            <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-200">
              {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <div className="grid sm:grid-cols-2 gap-3">
            <DateField label="Mulai" value={form.started_at} />
            <DateField label="Berakhir" value={form.expires_at} />
          </div>
          <p className="text-xs text-slate-400">Jika paket baru dipilih dan tanggal dikosongkan, sistem otomatis menghitung tanggal mulai dan berakhir berdasarkan durasi paket.</p>

          <label className="block text-sm font-medium text-slate-700">
            Catatan
            <textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="mt-1 w-full min-h-24 p-3 rounded-xl border border-slate-200" placeholder="Catatan pembayaran atau perpanjangan..." />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={close} className="rounded-xl px-4 py-2.5 text-sm font-medium bg-slate-100 text-slate-700">Batal</button>
          <button disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{background:"hsl(var(--primary))"}}>{busy ? "Menyimpan..." : "Simpan Subscription"}</button>
        </div>
      </form>
    </div>
  );
}

function DateField({ label, value }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <input value={formatDate(value)} readOnly className="mt-1 w-full h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500" placeholder="Otomatis" />
    </label>
  );
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Field({ label, value, onChange, ...props }) {
  return <label className="block"><span className="text-xs font-semibold text-slate-600">{label}</span><input {...props} value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-200" /></label>;
}
