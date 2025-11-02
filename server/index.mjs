import "dotenv/config";
import express from "express";
import cors from "cors";

// Node 20 has global fetch available

const PORT = process.env.PORT || 10000;
const STARTED_AT = new Date().toISOString();

const ALLOW_ORIGINS = new Set([
  "https://foodbridgeapp.github.io",
  "https://foodbridgeapp.github.io/FoodBridge",
]);

const app = express();

// CORS
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // CLI / server-to-server
      cb(null, ALLOW_ORIGINS.has(origin));
    },
  })
);

// JSON body parsing
app.use(express.json({ limit: "1mb" }));

// Basic security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

// Root + health
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "foodbridge-server", startedAt: STARTED_AT });
});
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, status: "healthy", ts: Date.now() });
});

// ======= Minimal endpoints you’re testing =======
app.post("/api/ingest/url", async (req, res) => {
  try {
    const url = (req.body && req.body.url) || "";
    if (!url) return res.status(400).json({ error: "url required" });

    const r = await fetch(url, { redirect: "follow" });
    if (!r.ok) {
      return res
        .status(502)
        .json({ error: "failed to fetch source url", status: r.status });
    }
    let html = await r.text();
    // Strip scripts/styles to avoid over-matching
    html = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "");

    const pickMeta = (name) => {
      // IMPORTANT: The <meta ...> is inside a QUOTED template string
      const rx = new RegExp(
        <meta[^>]+(?:property|name)=["']["'][^>]*content=["']([^"']+)["'][^>]*>,
        "i"
      );
      const m = rx.exec(html);
      return m ? m[1] : "";
    };

    const ogTitle =
      pickMeta("og:title") || pickMeta("twitter:title") || "";
    const ogDesc =
      pickMeta("og:description") || pickMeta("description") || "";
    const text = html
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    res.json({ data: { ogTitle, ogDesc, text } });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post("/api/llm/parse", async (req, res) => {
  try {
    const raw = (req.body && req.body.text) ? String(req.body.text) : "";
    if (!raw) return res.status(400).json({ error: "text required" });

    const [titlePart, rest] = raw.split(/:\s*/);
    const title = (titlePart || "Recipe").trim();
    const ingBlob = rest || raw;

    const ingredients = ingBlob
      .split(/[;,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const steps = [
      "Prepare ingredients.",
      "Follow standard method based on the recipe text.",
      "Adjust seasoning and serve.",
    ];

    res.json({ data: { title, ingredients, steps } });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
// ======= end endpoints =======

// Error handler (last)
app.use((err, _req, res, _next) => {
  console.error("[uncaught]", err);
  res.status(500).json({ ok: false, error: "internal_error" });
});

// Start
app.listen(PORT, () => {
  console.log(\[foodbridge-server] listening on \ (started \)\);
});

export default app;