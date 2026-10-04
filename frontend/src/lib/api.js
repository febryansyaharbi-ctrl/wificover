import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

// Resolve current tenant subdomain from path (/t/:subdomain fallback) only.
export function currentSubdomain() {
  const m = window.location.pathname.match(/^\/t\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function tenantParams(extra = {}) {
  const sub = currentSubdomain();
  return sub ? { subdomain: sub, ...extra } : extra;
}

export function formatApiError(detail) {
  if (detail == null) return "Terjadi kesalahan. Silakan coba lagi.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
