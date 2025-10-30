import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import { SYSTEM_PROMPT, userPromptFromText } from "./prompt.js";
import { toCartItems } from "./normalize.js";

const PORT = process.env.PORT || 8080;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FB_BACKEND_BASE = process.env.FB_BACKEND_BASE || "https://foodbridge-server-rv0a.onrender.com";
const ALLOWED = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // allow curl/postman
    if (ALLOWED.length === 0) return cb(null, true);
    if (ALLOWED.some(a => origin === a || origin.startsWith(a))) return cb(null, true);
    return cb(null, false);
  }
}));

function jerr(res, code, msg, extra={}) {
  return res.status(code).json({ ok:false, error: msg, ...extra });
}

app.get("/api/llm/health", (req, res) => {
  res.json({ ok:true, status:"healthy", ts: Date.now() });
});

// Helper: fetch URL to text (best-effort)
async function fetchPageText(url) {
  const r = await fetch(url, { redirect: "follow", timeout: 20000 });
  if (!r.ok) throw new Error(`fetch failed ${r.status}`);
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/pdf")) {
    // We are not parsing PDFs here (keep build simple); treat as no text
    return "";
  }
  return await r.text();
}

// Call OpenAI (Chat Completions, JSON mode)
async function llmExtract(sourceUrl, pageText) {
  const payload = {
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPromptFromText(sourceUrl, pageText) }
    ]
  };

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "authorization": `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${t}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content?.trim() || "{}";
  return JSON.parse(content);
}

// Minimal cart helpers (your existing backend)
async function upsertCart(userId) {
  const r = await fetch(`${FB_BACKEND_BASE}/api/cart/upsert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, items: [] })
  });
  if (!r.ok) throw new Error(`cart upsert failed ${r.status}`);
  const j = await r.json();
  return j?.cart?.cartId;
}

async function appendItems(cartId, userId, items) {
  const r = await fetch(`${FB_BACKEND_BASE}/api/cart/${encodeURIComponent(cartId)}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId, items })
  });
  if (!r.ok) throw new Error(`cart append failed ${r.status}`);
  return r.json();
}

/**
 * POST /api/llm/ingest-url
 * Body: { url: string, userId?: string, cartId?: string }
 * - Fetches page, extracts recipe via LLM, normalizes to cart items
 * - Creates a cart if none is provided
 * - Appends items into the cart
 */
app.post("/api/llm/ingest-url", async (req, res) => {
  const url = (req.body?.url || "").trim();
  const userId = (req.body?.userId || "christian").trim();
  let cartId = (req.body?.cartId || "").trim();

  if (!url) return jerr(res, 400, "Missing url");

  try {
    const pageText = await fetchPageText(url).catch(() => "");
    const llmJson = await llmExtract(url, pageText);
    const items = toCartItems(llmJson);

    if (!cartId) cartId = await upsertCart(userId);
    const appendRes = await appendItems(cartId, userId, items);

    res.json({
      ok: true,
      sourceUrl: url,
      llm: llmJson,
      cart: appendRes.cart
    });
  } catch (e) {
    return jerr(res, 500, "ingest failed", { detail: String(e?.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(JSON.stringify({ msg: "llm-api up", port: PORT, backend: FB_BACKEND_BASE }));
});