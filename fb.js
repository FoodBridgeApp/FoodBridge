/** FoodBridge frontend (minimal) **/
const API_BASE = "https://foodbridge-server-rv0a.onrender.com";

// Safety proxy: if any old code still hits the placeholder host, rewrite to the real one.
(() => {
  try {
    const OLD = "https://<your-render-subdomain>.onrender.com";
    const ofetch = window.fetch ? window.fetch.bind(window) : null;
    if (ofetch) {
      window.fetch = (u, opts) => ofetch(typeof u === "string" ? u.replace(OLD, API_BASE) : u, opts);
      console.log("[FB] proxy armed", API_BASE);
    }
  } catch (e) { console.warn("[FB] proxy inject fail", e); }
})();

async function api(path, opts={}) {
  const r = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(opts.headers||{}) },
    ...opts
  });
  return r.json();
}

window.addEventListener("load", async () => {
  console.log("[FB] boot");
  try {
    const h = await api("/api/health");
    console.log("[FB] health", h);
  } catch (e) {
    console.error("[FB] health error", e);
  }

  // quick smoke test: create plan + add a tiny recipe (no UI coupling)
  try {
    const plan = await fetch(`${API_BASE}/api/plan`, { method: "POST" }).then(r=>r.json());
    await fetch(`${API_BASE}/api/plan/${plan.planId}/recipes/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Title: Demo\\nIngredients: 2 eggs\\nSteps: Beat; Fry" })
    }).then(r=>r.json());
    console.log("[FB] demo ingest ok");
  } catch (e) {
    console.warn("[FB] demo ingest skip", e);
  }
});
