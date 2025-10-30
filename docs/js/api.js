/** docs/js/api.js — minimal client for your server (no auth) */
const DEFAULT_BASE = "https://foodbridge-server-rv0a.onrender.com";
export const BASE = window.__FB_API_BASE__ || DEFAULT_BASE;

async function jfetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
    body: opts.body
      ? (typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body))
      : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.status = res.status;
    err.payload = json || text;
    throw err;
  }
  return json ?? { ok: true };
}

export const api = {
  // platform
  health:    () => jfetch("/api/health"),
  config:    () => jfetch("/api/config"),
  ping:      () => jfetch("/api/ping"),
  debugEcho: (body) => jfetch("/api/_debug/echo", { method: "POST", body }),

  // demo ingest
  demoIngest: (payload) => jfetch("/api/ingest/demo", { method: "POST", body: payload }),

  // cart
  upsertCart:   ({ cartId, userId, items }) =>
      jfetch("/api/cart/upsert", { method: "POST", body: { cartId, userId, items } }),
  appendItems:  (cartId, { userId, items }) =>
      jfetch(`/api/cart/${encodeURIComponent(cartId)}/items`, { method: "POST", body: { userId, items } }),
  getCart:      (cartId) => jfetch(`/api/cart/${encodeURIComponent(cartId)}`),
  deleteCart:   (cartId) => jfetch(`/api/cart/${encodeURIComponent(cartId)}`, { method: "DELETE" }),
  exportJson:   (cartId) => jfetch(`/api/cart/${encodeURIComponent(cartId)}/export.json`),

  // email
  emailHealth:  () => jfetch("/api/email/health"),
  sendEmail:    ({ to, subject, text, html, from }) =>
      jfetch("/api/email/send", { method: "POST", body: { to, subject, text, html, from } }),
  sendCartEmail: (cartId, { to, subject, from }) =>
      jfetch(`/api/cart/${encodeURIComponent(cartId)}/email-summary`, { method: "POST", body: { to, subject, from } }),
};