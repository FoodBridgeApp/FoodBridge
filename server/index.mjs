import express from "express";

const app = express();
app.use(express.json({ limit: "1mb" }));

// --- Single API router for everything ---
const api = express.Router();

// Health
api.get("/health", (_req, res) => {
  res.json({ ok: true, healthy: true, ts: Date.now() });
});

// Ingest URL -> ogTitle/ogDesc/text
api.post("/ingest/url", async (req, res) => {
  try {
    const url = (req.body && req.body.url) || "";
    if (!url) return res.status(400).json({ error: "url required" });

    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) return res.status(502).json({ error: "failed to fetch source url", status: r.status });

    let html = await r.text();
    // strip scripts/styles
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    const pickMeta = (name) => {
      const rx = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
      const m = rx.exec(html);
      return m ? m[1] : "";
    };

    const ogTitle = pickMeta("og:title") || pickMeta("twitter:title") || "";
    const ogDesc  = pickMeta("og:description") || pickMeta("description") || "";
    const text    = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

    res.json({ ok: true, data: { ogTitle, ogDesc, text } });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Parse free-text into title/ingredients/steps
api.post("/llm/parse", async (req, res) => {
  try {
    const raw = (req.body && req.body.text) ? String(req.body.text) : "";
    if (!raw) return res.status(400).json({ error: "text required" });

    const [titlePart, rest] = raw.split(/:\s*/);
    const title   = (titlePart || "Recipe").trim();
    const ingBlob = rest || raw;
    const ingredients = ingBlob.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
    const steps = [
      "Prepare ingredients.",
      "Follow standard method based on the recipe text.",
      "Adjust seasoning and serve."
    ];

    res.json({ ok: true, data: { title, ingredients, steps } });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// Mount router
app.use("/api", api);

// Start server (Render sets PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`[foodbridge] server listening on ${PORT}`);
});

export default app;
