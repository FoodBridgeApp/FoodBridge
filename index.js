import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import crypto from "crypto";
import fetch from "node-fetch";

const {
  OPENAI_API_KEY,
  RESEND_API_KEY,
  CORS_ORIGIN = "https://foodbridgeapp.github.io",
  PORT = process.env.PORT || 10000,
} = process.env;

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(bodyParser.json({ limit: "2mb" }));

// ===== In-memory plans with TTL =====
const TTL_MS = 1000 * 60 * 60 * 24 * 2;
const plans = new Map();
const nowMs = () => Date.now();
function newPlan() {
  const id = crypto.randomUUID();
  const now = nowMs();
  plans.set(id, { recipes: [], createdAt: now, ttlAt: now + TTL_MS });
  return id;
}
function getPlan(id) {
  const p = plans.get(id);
  if (!p) return null;
  if (nowMs() > p.ttlAt) { plans.delete(id); return null; }
  return p;
}
setInterval(() => {
  const now = nowMs();
  for (const [id, p] of plans.entries()) if (now > p.ttlAt) plans.delete(id);
}, 60_000);

// ===== LLM normalize (fallback if no key) =====
async function llmNormalizeRecipe({ text }) {
  const prompt = `
You are a culinary parser. Extract a recipe in JSON with keys:
- title (string)
- ingredients (array of { name, quantity, unit })
- steps (array of strings)

Text:
${text}`.trim();

  if (!OPENAI_API_KEY) {
    return { title: "Untitled Recipe", ingredients: [{ name: "ingredient", quantity: 1, unit: "unit" }], steps: ["Mix things", "Cook until done"] };
  }

  const body = { model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } };
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await resp.json();
  let parsed; try { parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}"); } catch { parsed = {}; }
  return { title: parsed.title || "Untitled Recipe", ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [], steps: Array.isArray(parsed.steps) ? parsed.steps : [] };
}

// ===== Mock pricing =====
function mockPrice(name) { const h = crypto.createHash("md5").update((name||"").toLowerCase()).digest("hex"); const n = parseInt(h.slice(0,6),16)%700; return Number((0.99 + n/100).toFixed(2)); }
function priceIngredients(ingredients) { return (ingredients||[]).map(i => ({ ...i, price: mockPrice(i.name||"item") })); }

// ===== Core routes =====
app.get("/api/health", (_, res) => res.json({ ok: true }));

app.post("/api/plan", (req, res) => {
  const id = newPlan();
  res.json({ planId: id, shareUrl: `${req.protocol}://${req.get("host")}/p/${id}` });
});

app.get("/api/plan/:id", (req, res) => {
  const plan = getPlan(req.params.id);
  if (!plan) return res.status(404).json({ error: "Plan not found/expired" });
  res.json(plan);
});

app.post("/api/plan/:id/recipes/text", async (req, res) => {
  const plan = getPlan(req.params.id); if (!plan) return res.status(404).json({ error: "Plan not found/expired" });
  const { text } = req.body || {}; if (!text) return res.status(400).json({ error: "text required" });
  const normalized = await llmNormalizeRecipe({ text }); const priced = priceIngredients(normalized.ingredients);
  plan.recipes.push({ ...normalized, ingredients: priced }); plan.ttlAt = nowMs() + TTL_MS; res.json({ ok: true, plan });
});

app.post("/api/plan/:id/recipes/url", async (req, res) => {
  const plan = getPlan(req.params.id); if (!plan) return res.status(404).json({ error: "Plan not found/expired" });
  const { url } = req.body || {}; if (!url) return res.status(400).json({ error: "url required" });
  const r = await fetch(url).catch(() => null); if (!r || !r.ok) return res.status(400).json({ error: "Failed to fetch URL" });
  const html = await r.text();
  const normalized = await llmNormalizeRecipe({ text: html }); const priced = priceIngredients(normalized.ingredients);
  plan.recipes.push({ ...normalized, ingredients: priced, source: url }); plan.ttlAt = nowMs() + TTL_MS; res.json({ ok: true, plan });
});

app.post("/api/plan/:id/recipes/corpus", async (req, res) => {
  const plan = getPlan(req.params.id); if (!plan) return res.status(404).json({ error: "Plan not found/expired" });
  const { ids } = req.body || {}; if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "ids array required" });
  for (const cid of ids) {
    const text = `Ingredients: 2 eggs; 1 cup flour; 1 tsp salt.\nSteps: Mix; bake 15m.`;
    const normalized = await llmNormalizeRecipe({ text }); const priced = priceIngredients(normalized.ingredients);
    plan.recipes.push({ ...normalized, corpusId: cid, ingredients: priced });
  }
  plan.ttlAt = nowMs() + TTL_MS; res.json({ ok: true, plan });
});

// Printable share page
app.get("/p/:id", (req, res) => {
  const plan = getPlan(req.params.id); if (!plan) return res.status(404).send("Plan not found/expired");
  const total = plan.recipes.flatMap(r => r.ingredients||[]).reduce((s,i)=>s+(Number(i.price)||0),0);
  const html = `
<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>FoodBridge Plan</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:840px;margin:24px auto;padding:0 12px}.card{border:1px solid #eee;border-radius:12px;padding:16px;margin:12px 0;box-shadow:0 2px 6px rgba(0,0,0,.05)}.price{float:right}.header{display:flex;align-items:center;gap:10px}.baguette{font-size:28px;animation:spin 1.2s linear infinite}@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}.total{font-weight:700;font-size:18px;margin-top:16px}.actions{margin:16px 0}button{padding:8px 12px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer}@media print {.actions{display:none}}</style>
<div class="header"><div class="baguette">🥖</div><h2>FoodBridge Plan</h2></div>
<div class="actions"><button onclick="window.print()">Print</button></div>
${plan.recipes.map(r => `
  <div class="card">
    <h3>${r.title}</h3>
    <strong>Ingredients</strong>
    <ul>${(r.ingredients||[]).map(i => `<li>${i.quantity??""} ${i.unit??""} ${i.name} <span class="price">$${(i.price??0).toFixed(2)}</span></li>`).join("")}</ul>
    <strong>Steps</strong>
    <ol>${(r.steps||[]).map(s => `<li>${s}</li>`).join("")}</ol>
  </div>`).join("")}
<div class="total">Estimated Total: $${total.toFixed(2)}</div>`;
  res.send(html);
});

// ===== Compatibility routes for current frontend =====
app.get("/health", (_, res) => res.json({ ok: true })); // legacy health
app.post("/api/ingest/free-text", async (req, res) => {
  const { text } = req.body || {}; if (!text) return res.status(400).json({ error: "text required" });
  const planId = newPlan();
  const normalized = await llmNormalizeRecipe({ text });
  const plan = getPlan(planId);
  plan.recipes.push({ ...normalized, ingredients: priceIngredients(normalized.ingredients) });
  res.json({ ok: true, planId, shareUrl: `${req.protocol}://${req.get("host")}/p/${planId}`, plan });
});
app.get("/api/ingredients/suggest", (req, res) => {
  const q = (req.query.q || "").toString().trim().toLowerCase();
  if (!q) return res.json({ ok: true, suggestions: [] });
  const base = [q, `${q} sauce`, `${q} fresh`, `${q} organic`, `${q} canned`, `${q} diced`];
  const uniq = Array.from(new Set(base)).slice(0, 6);
  res.json({ ok: true, suggestions: uniq });
});

app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));
