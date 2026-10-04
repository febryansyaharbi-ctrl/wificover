import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useTenant } from "@/context/TenantContext";
import { useAuth } from "@/context/AuthContext";
import { api, tenantParams } from "@/lib/api";
import { formatIDR, waLink } from "@/lib/format";
import { BrandLogo, PrimaryButton } from "@/components/Brand";
import LeadForm from "@/components/LeadForm";
import CoverageMap from "@/components/CoverageMap";
import { MapPin, Zap, ShieldCheck, MessageCircle, Wifi, ArrowRight, Signal, Gauge, Router, Menu, X, LogIn } from "lucide-react";

export default function Landing() {
  const { tenant, loading } = useTenant();
  const { user } = useAuth();
  const [packages, setPackages] = useState([]);
  const [showLead, setShowLead] = useState(false);
  const [lead, setLead] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [covered, setCovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const packagesRef = useRef(null);

  useEffect(() => {
    if (tenant?.meta_pixel_id && !window.fbq) {
      const id = tenant.meta_pixel_id;
      window.fbq = function(){ window.fbq.callMethod ? window.fbq.callMethod.apply(window.fbq, arguments) : window.fbq.queue.push(arguments); };
      window._fbq = window.fbq;
      window.fbq.push = window.fbq;
      window.fbq.loaded = true;
      window.fbq.version = "2.0";
      window.fbq.queue = [];
      const s = document.createElement("script");
      s.async = true; s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
      window.fbq("init", id);
      window.fbq("track", "PageView");
    }
  }, [tenant?.meta_pixel_id]);

  useEffect(() => {
    api.get("/packages/public", { params: tenantParams() })
      .then(({ data }) => setPackages(data)).catch(() => {});
  }, []);

  if (loading) return <div className="min-h-screen grid place-items-center text-slate-400">Memuat…</div>;

  if (tenant?.status === "LOCKED") {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Halaman Non-Aktif</h1>
          <p className="text-slate-500 mt-2">Layanan ini sedang tidak aktif. Silakan hubungi penyedia layanan.</p>
        </div>
      </div>
    );
  }

  const startCheck = () => { setShowLead(true); };
  const onLeadCreated = (data) => { setLead(data); setShowLead(false); setShowMap(true); };
  const proceedPackages = () => {
    setShowMap(false); setCovered(true);
    setTimeout(() => packagesRef.current?.scrollIntoView({ behavior: "smooth" }), 150);
  };
  const contactWa = () => {
    const text = `Halo ${tenant?.wifi_name || ""}, saya ${lead?.name || ""}. Lokasi saya sudah tercover, saya tertarik berlangganan.`;
    window.open(waLink(tenant?.whatsapp_number, text), "_blank");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <BrandLogo tenant={tenant} />
          <div className="flex items-center gap-2">
            <button onClick={startCheck} data-testid="landing-nav-cta-coverage" className="inline-flex items-center gap-2 rounded-full px-4 sm:px-5 py-2.5 text-sm font-semibold text-white active:scale-95 transition" style={{ background: "hsl(var(--primary))" }}><MapPin size={16} /> <span className="hidden sm:inline">Cek Coverage</span><span className="sm:hidden">Coverage</span></button>
            <button onClick={() => setMenuOpen(true)} aria-label="Buka menu" data-testid="landing-menu-button" className="h-10 w-10 rounded-full border border-slate-200 bg-white grid place-items-center text-slate-700 hover:bg-slate-50"><Menu size={20} /></button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMenuOpen(false)} />
          <aside className="absolute top-0 right-0 h-full w-[min(88vw,360px)] bg-white shadow-2xl p-6 animate-fade-up">
            <div className="flex items-center justify-between"><div className="font-display font-bold text-slate-900">Menu</div><button onClick={() => setMenuOpen(false)}><X size={22}/></button></div>
            <div className="mt-8 space-y-3">
              <Link to={user ? "/admin" : "/admin/login"} onClick={() => setMenuOpen(false)} className="w-full flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 font-semibold text-slate-800"><LogIn size={19}/> {user ? "Dashboard Admin" : "Login Admin"}</Link>
              <button onClick={() => { setMenuOpen(false); startCheck(); }} className="w-full flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3.5 font-semibold text-slate-800"><MapPin size={19}/> Cek Coverage</button>
            </div>
          </aside>
        </div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--accent))] via-white to-slate-50" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-600 mb-6">
              <Signal size={14} style={{ color: "hsl(var(--primary))" }} /> Internet Fiber Optik
            </span>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.05]">
              {tenant?.website_title || "Internet Cepat & Stabil untuk Rumah Anda"}
            </h1>
            <p className="mt-5 text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
              {tenant?.description || "Cek ketersediaan jaringan di lokasi Anda dan nikmati koneksi tanpa batas."}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <PrimaryButton onClick={startCheck} data-testid="landing-hero-cta-check">
                <MapPin size={18} /> Cek Coverage
              </PrimaryButton>
              <a href="#paket" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm sm:text-base font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition">
                Lihat Paket
              </a>
            </div>
            <div className="mt-10 flex gap-8">
              {[["24/7", "Dukungan Teknis"], ["99.9%", "Uptime Jaringan"], ["±100m", "Akurasi Coverage"]].map(([a, b]) => (
                <div key={b}>
                  <div className="font-display text-2xl font-extrabold text-slate-900">{a}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{b}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <img src={tenant?.hero_image_url || "https://images.unsplash.com/photo-1629360021730-3d258452c425?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"}
                 alt="Keluarga menikmati internet" loading="lazy"
                 className="rounded-3xl shadow-2xl object-cover w-full h-[320px] sm:h-[420px]" />
            <div className="absolute -bottom-5 -left-3 sm:left-6 bg-white rounded-2xl shadow-xl px-5 py-4 flex items-center gap-3">
              <span className="h-11 w-11 rounded-xl grid place-items-center text-white" style={{ background: "hsl(var(--primary))" }}>
                <Gauge size={22} />
              </span>
              <div>
                <div className="text-xs text-slate-500">Kecepatan hingga</div>
                <div className="font-display font-bold text-slate-900">100 Mbps</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section id="paket" ref={packagesRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">Pilih Paket Internet</h2>
          <p className="text-slate-600 mt-3">Paket fleksibel untuk kebutuhan rumah dan bisnis Anda.</p>
        </div>
        {packages.length === 0 ? (
          <p className="text-center text-slate-400">Belum ada paket tersedia.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
            {packages.map((p, i) => (
              <div key={p.id}
                   className={`relative flex flex-col rounded-3xl border p-7 transition hover:-translate-y-1 hover:shadow-xl ${i === 1 ? "border-transparent shadow-lg ring-2" : "border-slate-200 shadow-sm"}`}
                   style={i === 1 ? { boxShadow: "0 10px 40px -12px hsl(var(--primary))", "--tw-ring-color": "hsl(var(--primary))" } : {}}>
                {i === 1 && (
                  <span className="absolute -top-3 left-7 rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: "hsl(var(--primary))" }}>
                    Terpopuler
                  </span>
                )}
                <div className="flex items-center gap-2 text-slate-500 text-sm"><Router size={16} /> {p.name}</div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="font-display text-3xl font-extrabold text-slate-900">{p.speed}</span>
                </div>
                <div className="mt-2 font-display text-2xl font-bold" style={{ color: "hsl(var(--primary))" }}>
                  {formatIDR(p.price)}<span className="text-sm font-medium text-slate-400">/bln</span>
                </div>
                <p className="text-sm text-slate-500 mt-3 flex-1">{p.description}</p>
                <button onClick={startCheck} data-testid="package-card-select-button"
                        className="mt-6 w-full py-3 rounded-full font-semibold text-white active:scale-[0.98] transition"
                        style={{ background: "hsl(var(--primary))" }}>
                  Cek Coverage
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Coverage section */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            {[[MapPin, "Tentukan Lokasi", "Gunakan GPS otomatis atau geser peta secara manual."],
              [ShieldCheck, "Cek Ketersediaan", "Sistem memeriksa jangkauan hingga radius 100 meter."],
              [Zap, "Langsung Terhubung", "Jika tercover, tim kami siap membantu pemasangan."]].map(([Icon, t, d], i) => (
              <div key={i} className="flex gap-4">
                <span className="h-11 w-11 shrink-0 rounded-xl grid place-items-center text-white" style={{ background: "hsl(var(--primary))" }}>
                  <Icon size={20} />
                </span>
                <div>
                  <h4 className="font-display font-semibold text-slate-900">{t}</h4>
                  <p className="text-sm text-slate-500 mt-0.5">{d}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center">
            <Wifi size={44} className="mx-auto mb-4" style={{ color: "hsl(var(--primary))" }} />
            <h3 className="font-display text-2xl font-bold text-slate-900">Sudah Tercover di Area Anda?</h3>
            <p className="text-slate-500 mt-2">Cek sekarang dalam hitungan detik, gratis dan tanpa daftar akun.</p>
            <div className="mt-6">
              <PrimaryButton onClick={startCheck} data-testid="coverage-section-cta-button" className="w-full sm:w-auto">
                <MapPin size={18} /> Cek Coverage Sekarang <ArrowRight size={18} />
              </PrimaryButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid sm:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              {tenant?.logo_url
                ? <img src={tenant.logo_url} alt="logo" className="h-9 w-auto rounded" />
                : <span className="h-9 w-9 rounded-lg grid place-items-center text-white" style={{ background: "hsl(var(--primary))" }}><Wifi size={18} /></span>}
              <span className="font-display font-bold text-white text-lg">{tenant?.wifi_name || "WiFi Coverage"}</span>
            </div>
            <p className="text-sm text-slate-400 max-w-sm">{tenant?.description || "Layanan internet fiber cepat dan stabil."}</p>
          </div>
          <div className="sm:text-right">
            <a href={waLink(tenant?.whatsapp_number, `Halo ${tenant?.wifi_name || ""}, saya ingin bertanya tentang layanan internet.`)}
               target="_blank" rel="noreferrer" data-testid="footer-whatsapp-link"
               className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:brightness-110 transition">
              <MessageCircle size={18} /> Hubungi via WhatsApp
            </a>
            <p className="text-xs text-slate-500 mt-4">© {new Date().getFullYear()} {tenant?.name || "WiFi Coverage"}. Semua hak dilindungi.</p>
            <Link to={user ? "/admin" : "/admin/login"} data-testid="footer-admin-link"
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 mt-2 underline underline-offset-2">
              {user ? "Dashboard Admin" : "Login Admin"}
            </Link>
          </div>
        </div>
      </footer>

      {/* Sticky WhatsApp button after covered */}
      {covered && (
        <button onClick={contactWa} data-testid="landing-contact-whatsapp-button"
                className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-6 py-4 text-white font-semibold shadow-2xl active:scale-95 transition">
          <MessageCircle size={20} /> Hubungi Kami
        </button>
      )}

      <LeadForm open={showLead} onClose={() => setShowLead(false)} onCreated={onLeadCreated} />
      {showMap && (
        <CoverageMap lead={lead} tenant={tenant}
                     onClose={() => setShowMap(false)}
                     onProceedPackages={proceedPackages} />
      )}
    </div>
  );
}
