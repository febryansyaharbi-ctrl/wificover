import { useEffect, useRef, useState, useCallback } from "react";
import { Crosshair, ShieldCheck, X, MapPin, Loader2, CheckCircle2, XCircle, MessageCircle, Package as PackageIcon, Check } from "lucide-react";
import { api, tenantParams } from "@/lib/api";
import { waLink, formatIDR } from "@/lib/format";
import { toast } from "sonner";

// Location state machine:
// NOT_SET -> DETECTING -> SET_BY_GPS / SET_MANUALLY -> CHECKING -> COVERED / NOT_COVERED / ERROR
const DEFAULT_CENTER = [-7.56482, 112.21828]; // Jombang (JBG) — inside seeded coverage
const DEFAULT_ZOOM = 16;

export default function CoverageMap({ lead, tenant, onClose, onProceedPackages }) {
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const layerRef = useRef(null);
  const skipNextMove = useRef(false);
  const [locState, setLocState] = useState("NOT_SET");
  const [result, setResult] = useState(null); // coverage response
  const [packages, setPackages] = useState([]);
  const [showPackages, setShowPackages] = useState(false);

  useEffect(() => {
    api.get("/packages/public", { params: tenantParams() })
      .then(({ data }) => setPackages(data)).catch(() => {});
  }, []);

  const loadGeoms = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getZoom() < 12) {
      if (layerRef.current) { layerRef.current.clearLayers(); }
      return;
    }
    const b = map.getBounds();
    try {
      const { data } = await api.get("/coverage/public/geometries", {
        params: tenantParams({
          minLng: b.getWest(), minLat: b.getSouth(),
          maxLng: b.getEast(), maxLat: b.getNorth(),
        }),
      });
      if (!layerRef.current) {
        layerRef.current = window.L.geoJSON(null, {
          style: {
            color: "#6D28D9", weight: 1.5, fillColor: "#7C3AED",
            fillOpacity: 0.18, opacity: 0.7,
          },
        }).addTo(map);
      }
      layerRef.current.clearLayers();
      layerRef.current.addData(data);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    const L = window.L;
    if (!L || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true })
      .setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap",
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    mapRef.current = map;

    // Draggable marker synced to map center (supports pan, tap, and drag)
    const pinHtml = `<div style="width:40px;height:48px;">
      <svg viewBox="0 0 24 24" width="40" height="48" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C7.6 2 4 5.6 4 10c0 5.2 6.6 11.4 7.3 12a1 1 0 0 0 1.4 0C13.4 21.4 20 15.2 20 10c0-4.4-3.6-8-8-8z" fill="#6D28D9" stroke="#ffffff" stroke-width="1.5"/>
        <circle cx="12" cy="10" r="3" fill="#ffffff"/>
      </svg></div>`;
    const icon = L.divIcon({ className: "coverage-pin", html: pinHtml, iconSize: [40, 48], iconAnchor: [20, 48] });
    const marker = L.marker(map.getCenter(), { draggable: true, icon, keyboard: false }).addTo(map);
    markerRef.current = marker;
    let dragging = false;
    marker.on("dragstart", () => { dragging = true; });
    marker.on("dragend", () => {
      dragging = false;
      const ll = marker.getLatLng();
      map.panTo(ll);
      setLocState((s) => (s === "NOT_SET" || s === "DETECTING" ? "SET_MANUALLY" : s));
      setResult(null);
    });
    map.on("move", () => { if (!dragging) marker.setLatLng(map.getCenter()); });

    const onMoveEnd = () => {
      loadGeoms();
      if (skipNextMove.current) { skipNextMove.current = false; return; }
      setLocState((s) => (s === "NOT_SET" || s === "DETECTING" ? "SET_MANUALLY" : s));
      setResult(null);
    };
    map.on("moveend", onMoveEnd);
    map.on("click", (e) => { map.panTo(e.latlng); });
    setTimeout(() => { map.invalidateSize(); loadGeoms(); }, 250);

    return () => { map.remove(); mapRef.current = null; markerRef.current = null; };
  }, [loadGeoms]);

  const detectGps = () => {
    if (!navigator.geolocation) {
      toast.error("Lokasi otomatis tidak tersedia. Silakan tentukan lokasi pada peta.");
      return;
    }
    setLocState("DETECTING");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        skipNextMove.current = true;
        mapRef.current.setView([pos.coords.latitude, pos.coords.longitude], 16);
        setLocState("SET_BY_GPS");
        setResult(null);
        setTimeout(loadGeoms, 300);
      },
      () => {
        setLocState("NOT_SET");
        toast.error("Lokasi otomatis tidak tersedia. Silakan tentukan lokasi pada peta.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const checkCoverage = async () => {
    const c = mapRef.current.getCenter();
    setLocState("CHECKING");
    try {
      const { data } = await api.post("/coverage/check", {
        lead_id: lead?.id, latitude: c.lat, longitude: c.lng, ...tenantParams(),
      });
      setResult(data);
      setLocState(data.coverage_status === "COVERED" ? "COVERED" : "NOT_COVERED");
    } catch (e) {
      setLocState("SET_MANUALLY");
      toast.error("Terjadi kendala saat mengecek coverage. Silakan coba kembali.");
    }
  };

  const isReady = locState === "SET_BY_GPS" || locState === "SET_MANUALLY";
  const c = mapRef.current?.getCenter();

  const openWhatsApp = (pkg) => {
    const lat = result?.latitude ?? c?.lat;
    const lng = result?.longitude ?? c?.lng;
    const lines = [
      "Halo Sales, saya ingin mengetahui lebih lanjut mengenai pemasangan WiFi.",
      "Berikut data saya:",
      `Nama: ${lead?.name || "-"}`,
      `No. WhatsApp: ${lead?.phone || "-"}`,
      "Koordinat:",
      `Latitude: ${lat != null ? Number(lat).toFixed(6) : "-"}`,
      `Longitude: ${lng != null ? Number(lng).toFixed(6) : "-"}`,
    ];
    if (pkg) {
      lines.push(`Paket: ${pkg.name}`, `Kecepatan: ${pkg.speed}`, `Harga: ${formatIDR(pkg.price)}/bulan`);
    }
    lines.push("Status Coverage: TERCOVER", "", "Terima kasih.");
    window.open(waLink(tenant?.whatsapp_number, lines.join("\n")), "_blank");
    setShowPackages(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900" data-testid="map-container">
      {/* header */}
      <div className="h-16 px-4 flex items-center justify-between bg-white border-b border-slate-200 shadow-sm z-30">
        <div className="flex items-center gap-2 min-w-0">
          <MapPin size={20} style={{ color: "hsl(var(--primary))" }} />
          <div className="min-w-0">
            <p className="font-display font-bold text-slate-900 text-sm truncate">Tentukan Lokasi Anda</p>
            <p className="text-xs text-slate-500 truncate">Geser peta untuk menentukan lokasi</p>
          </div>
        </div>
        <button onClick={onClose} data-testid="map-close-button"
                className="p-2 rounded-full hover:bg-slate-100 text-slate-500">
          <X size={22} />
        </button>
      </div>

      {/* map */}
      <div className="relative flex-1">
        <div ref={mapEl} className="absolute inset-0" />

        {/* fixed center label (marker is the draggable purple pin below) */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" data-testid="map-center-pin">
          <div className="center-pin -translate-y-[54px]">
            <div className="px-2.5 py-1 rounded-full bg-slate-900 text-white text-[11px] font-semibold shadow">
              LOKASI ANDA
            </div>
          </div>
        </div>

        {/* GPS button */}
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
          <button onClick={detectGps} data-testid="map-gps-button" title="Gunakan lokasi GPS"
                  className="h-11 w-11 rounded-full bg-white shadow-md grid place-items-center text-slate-700 hover:bg-slate-50 active:scale-95 transition">
            {locState === "DETECTING" ? <Loader2 size={20} className="animate-spin" /> : <Crosshair size={20} />}
          </button>
        </div>

        {/* Floating action button — state machine */}
        {locState !== "NOT_COVERED" && (
          <div className="absolute bottom-6 inset-x-0 z-30 flex justify-center px-4">
            {locState === "NOT_SET" || locState === "DETECTING" ? (
              <button onClick={detectGps} disabled={locState === "DETECTING"}
                      data-testid="map-floating-action-button"
                      className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-base font-semibold text-white shadow-xl active:scale-95 transition"
                      style={{ background: "hsl(var(--primary))" }}>
                {locState === "DETECTING" ? <Loader2 size={20} className="animate-spin" /> : <Crosshair size={20} />}
                {locState === "DETECTING" ? "Mendeteksi Lokasi…" : "Tentukan Lokasi Saya"}
              </button>
            ) : locState === "COVERED" ? (
              <button onClick={() => setShowPackages(true)} data-testid="map-floating-action-button"
                      className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-base font-semibold text-white shadow-xl active:scale-95 transition bg-emerald-600">
                <MessageCircle size={20} /> Hubungi Kami
              </button>
            ) : (
              <button onClick={checkCoverage} disabled={locState === "CHECKING"}
                      data-testid="map-floating-action-button"
                      className="inline-flex items-center gap-2 rounded-full px-7 py-4 text-base font-semibold text-white shadow-xl active:scale-95 transition"
                      style={{ background: "hsl(var(--primary))" }}>
                {locState === "CHECKING" ? <Loader2 size={20} className="animate-spin" /> : <ShieldCheck size={20} />}
                {locState === "CHECKING" ? "Mengecek…" : "Cek Coverage"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Result modals */}
      {result && locState === "COVERED" && (
        <ResultModal
          testId="modal-covered-container" tone="emerald" icon={<CheckCircle2 size={56} />}
          title="Selamat! Lokasi Anda Tercover"
          body={`Jaringan tersedia di titik Anda${result.distance_to_coverage != null ? ` (± ${Math.round(result.distance_to_coverage)} m dari area layanan)` : ""}. Tim kami siap membantu proses pemasangan.`}
          primaryLabel="Pilih Paket & Hubungi Sales" primaryTestId="modal-covered-whatsapp-button"
          onPrimary={() => setShowPackages(true)}
          secondaryLabel="Cek Titik Lain" onSecondary={() => { setResult(null); setLocState("SET_MANUALLY"); }}
        />
      )}
      {result && locState === "NOT_COVERED" && (
        <ResultModal
          testId="modal-uncovered-container" tone="rose" icon={<XCircle size={56} />}
          title="Mohon Maaf, Lokasi Anda Belum Tercover"
          body="Titik lokasi Anda saat ini berada di luar zona layanan aktif kami. Data Anda telah kami simpan untuk prioritas perluasan jaringan."
          primaryLabel="Pindahkan Pin & Cek Lagi" primaryTestId="modal-uncovered-retry-button"
          onPrimary={() => { setResult(null); setLocState("SET_MANUALLY"); }}
          secondaryLabel="Tutup" onSecondary={onClose}
        />
      )}

      {showPackages && (
        <PackageSelectModal packages={packages} onClose={() => setShowPackages(false)} onConfirm={openWhatsApp} />
      )}
    </div>
  );
}

function PackageSelectModal({ packages, onClose, onConfirm }) {
  const [sel, setSel] = useState(null);
  const selected = packages.find((p) => p.id === sel) || null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4" data-testid="package-select-modal">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-fade-up flex flex-col max-h-[88vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <PackageIcon size={20} style={{ color: "hsl(var(--primary))" }} />
            <h3 className="font-display font-bold text-slate-900">Pilihan Paket Internet</h3>
          </div>
          <button onClick={onClose} data-testid="package-select-close" className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><X size={20} /></button>
        </div>

        <div className="p-4 overflow-y-auto space-y-2.5">
          {packages.length === 0 ? (
            <p className="text-center text-slate-400 text-sm py-6">Belum ada paket tersedia. Anda tetap dapat menghubungi sales kami.</p>
          ) : packages.map((p) => {
            const active = sel === p.id;
            return (
              <button key={p.id} onClick={() => setSel(p.id)} data-testid={`package-option-${p.id}`}
                      className={`w-full text-left rounded-2xl border p-4 flex items-center gap-3 transition ${active ? "ring-2 shadow-sm" : "border-slate-200 hover:border-slate-300"}`}
                      style={active ? { borderColor: "hsl(var(--primary))", "--tw-ring-color": "hsl(var(--primary))" } : {}}>
                <span className={`h-5 w-5 shrink-0 rounded-full border-2 grid place-items-center ${active ? "text-white" : "border-slate-300"}`}
                      style={active ? { background: "hsl(var(--primary))", borderColor: "hsl(var(--primary))" } : {}}>
                  {active && <Check size={13} />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-slate-900">{p.name}</span>
                  <span className="block text-xs text-slate-400">{p.speed}</span>
                </span>
                <span className="font-display font-bold text-sm" style={{ color: "hsl(var(--primary))" }}>
                  {formatIDR(p.price)}<span className="text-xs font-medium text-slate-400">/bln</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-slate-200 shrink-0 space-y-2">
          {selected && (
            <p className="text-xs text-slate-500 text-center">Hubungi Sales untuk pemasangan <span className="font-semibold text-slate-700">{selected.name}</span></p>
          )}
          <button onClick={() => onConfirm(selected)} disabled={packages.length > 0 && !selected}
                  data-testid="package-confirm-whatsapp-button"
                  className="w-full py-3.5 rounded-full text-white font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none bg-emerald-600">
            <MessageCircle size={20} /> Lanjut ke WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultModal({ testId, tone, icon, title, body, primaryLabel, primaryTestId, onPrimary, secondaryLabel, onSecondary }) {
  const toneColor = tone === "emerald" ? "text-emerald-600" : "text-rose-500";
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/60 backdrop-blur-sm p-4" data-testid={testId}>
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-7 text-center animate-fade-up">
        <div className={`mx-auto mb-4 ${toneColor}`}>{icon}</div>
        <h3 className="font-display text-xl font-bold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">{body}</p>
        <div className="mt-6 space-y-2.5">
          <button onClick={onPrimary} data-testid={primaryTestId}
                  className={`w-full py-3.5 rounded-full text-white font-semibold active:scale-[0.98] transition ${tone === "emerald" ? "bg-emerald-600" : ""}`}
                  style={tone !== "emerald" ? { background: "hsl(var(--primary))" } : {}}>
            {primaryLabel}
          </button>
          <button onClick={onSecondary}
                  className="w-full py-3 rounded-full font-medium text-slate-600 hover:bg-slate-100 transition">
            {secondaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
