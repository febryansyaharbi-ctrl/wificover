import { Wifi } from "lucide-react";

export function BrandLogo({ tenant, className = "", size = 40 }) {
  const logo = tenant?.logo_url;
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="landing-header-brand">
      {logo ? (
        <img src={logo} alt={tenant?.wifi_name || "Logo"} style={{ height: size }}
             className="w-auto object-contain rounded-md" />
      ) : (
        <span className="inline-flex items-center justify-center rounded-xl text-white shadow-sm"
              style={{ background: "hsl(var(--primary))", width: size, height: size }}>
          <Wifi size={size * 0.55} strokeWidth={2.4} />
        </span>
      )}
      <span className="font-display font-extrabold text-lg sm:text-xl tracking-tight text-slate-900">
        {tenant?.wifi_name || "WiFi Coverage"}
      </span>
    </div>
  );
}

export function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm sm:text-base font-semibold text-white shadow-sm transition-transform active:scale-[0.97] hover:brightness-110 disabled:opacity-60 disabled:pointer-events-none ${className}`}
      style={{ background: "hsl(var(--primary))" }}
      {...props}
    >
      {children}
    </button>
  );
}
