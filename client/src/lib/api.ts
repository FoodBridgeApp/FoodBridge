const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/+$/, "") : "");
export function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return API_BASE + (path.startsWith("/") ? path : ("/" + path));
}
