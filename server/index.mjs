// server/index.mjs  — Full, clean ESM entry (no Redis by default; optional Redis)
// Features: health, version, config, logging, email send (+templated),
//           demo ingest, cart API (memory/redis), cart email summary, export JSON,
//           multi-source cart merge, export/email by userId convenience,
//           optional JWT/HMAC via FB_REQUIRE_AUTH

import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

import { requestLogger, log } from "./logger.js";
import { renderTemplate } from "./templates.js";
import { authGate, isAuthRequired } from "./auth.js";

// --------- Cart backend selection (defaults to memory) ----------
const USE_REDIS = String(process.env.CART_BACKEND || "").toLowerCase() === "redis";
let getCart, upsertCart, appendItemsToCart, deleteCart, normalizeItems;

if (USE_REDIS) {
  const m = await import("./cart-redis.js");
  ({ getCart, upsertCart, appendItemsToCart, deleteCart, normalizeItems } = m);
  console.log("[cart] Using Redis backend");
} else {
  const m = await import("./cart.js");
  ({ getCart, upsertCart, appendItemsToCart, deleteCart, normalizeItems } = m);
  console.log("[cart] Using in-memory backend");
}

// --------- Routers ----------
import ingestLlmRouter from "./routes/ingest-llm.mjs"; // POST /api/ingest/llm

const app = express();

// ==========================
// Config & constants
// ==========================
const PORT = process.env.PORT || 10000;
const STARTED_AT = new Date().toISOString();

// Prefer explicit build vars; fall back to platform SHAs; then dev
const VERSION =
  process.env.FB_VERSION ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.SOURCE_VERSION ||
  "dev-local";

const COMMIT =
  process.env.FB_COMMIT ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.SOURCE_VERSION ||
  "";

const SHORT_COMMIT = COMMIT ? COMMIT.slice(0, 7) : null;

const ALLOW_ORIGINS = [
  "https://foodbridgeapp.github.io",
  "https://foodbridgeapp.github.io/FoodBridge",
  // "http://localhost:5173",
  // "http://localhost:3000",
];

// ==========================
// Middleware
// ==========================
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // CLI & same-origin
      cb(null, ALLOW_ORIGINS.includes(origin));
    },
  })
);

// capture raw body (useful for HMAC/JWT verification)
app.use(
  express.json({
    limit: "512kb",
    verify: (req, _res, buf) => {
      req.rawBodyBuffer = Buffer.from(buf);
      req.rawBodyString = buf.toString("utf8");
    },
  })
);

// Optional form posts
app.use(express.urlencoded({ extended: false }));

// Basic security headers
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
});

app.use(requestLogger());

// ===== Mount LLM ingest router (adds POST /api/ingest/llm) =====
app.use("/api/ingest", ingestLlmRouter);

// ==========================
// Email helpers
// ==========================
const emailLimiter = (() => {
  const bucket = new Map();
  const WINDOW_MS = 60_000;
  const MAX = Number(process.env.EMAIL_RATE_MAX || 20);
  return (ip) => {
    const now = Date.now();
    const cur = bucket.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
    if (now > cur.resetAt) {
      cur.count = 0;
      cur.resetAt = now + WINDOW_MS;
    }
    cur.count += 1;
    bucket.set(ip, cur);
    return {
      allowed: cur.count <= MAX,
      remaining: Math.max(0, MAX - cur.count),
      resetAt: cur.resetAt,
    };
  };
})();

let _transporter = null;
async function getTransporter() {
  if (_transporter) return _transporter;
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";

  if (!host) throw new Error("SMTP_HOST not set");
  if (!user) throw new Error("SMTP_USER not set");
  if (!pass) throw new Error("SMTP_PASS not set");

  _transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return _transporter;
}

function isValidEmail(e) {
  return typeof e === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

// ==========================
// Root + Platform
// ==========================
app.head("/", (_req, res) => res.status(204).end());
app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "foodbridge-server",
    version: VERSION,
    shortCommit: SHORT_COMMIT,
    startedAt: STARTED_AT,
    hint: "See /api/health, /api/config, /api/ping",
    reqId: req.id,
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "healthy", ts: Date.now(), reqId: req.id });
});

app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    commit: COMMIT || null,
    shortCommit: SHORT_COMMIT,
    startedAt: STARTED_AT,
    reqId: req.id,
  });
});

app.get("/api/_debug/whoami", (req, res) => {
  res.json({
    ok: true,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    reqId: req.id,
    ts: Date.now(),
  });
});

app.post("/api/_debug/echo", (req, res) => {
  res.json({ ok: true, reqId: req.id, headers: req.headers, body: req.body ?? null, ts: Date.now() });
});

app.get("/api/_debug/info", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    region: process.env.RENDER_REGION || null,
    commit: COMMIT || null,
    shortCommit: SHORT_COMMIT,
    reqId: req.id,
    ts: Date.now(),
  });
});

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, pong: true, ts: Date.now(), reqId: req.id });
});

app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    nodeEnv: process.env.NODE_ENV || "development",
    startedAt: STARTED_AT,
    region: process.env.RENDER_REGION || null,
    commit: COMMIT || null,
    shortCommit: SHORT_COMMIT,
    features: {
      demoIngest: true,
      emailEnabled: !!process.env.SMTP_HOST,
      cartApi: true,
      templatedEmail: true,
      cartEmailSummary: true,
      cartExportJson: true,
      authRequired: isAuthRequired(),
      redisBackend: USE_REDIS,
    },
    reqId: req.id,
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    uptimeSec: process.uptime(),
    version: VERSION,
    commit: COMMIT || null,
    shortCommit: SHORT_COMMIT,
    emailReady: !!process.env.SMTP_HOST,
    startedAt: STARTED_AT,
    reqId: req.id,
  });
});

// ==========================
// Demo Ingest
// ==========================
app.post("/api/ingest/demo", async (req, res) => {
  const reqId = req.id;
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const userId = String(body.userId || "guest");
  const cartId = body.cartId ? String(body.cartId) : null;
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];

  const normalized = normalizeItems(items);
  const counts = normalized.reduce(
    (acc, n) => {
      acc.total += 1;
      acc.byType[n.type] = (acc.byType[n.type] || 0) + 1;
      return acc;
    },
    { total: 0, byType: {} }
  );

  if (cartId) {
    try {
      const cart = await appendItemsToCart({ cartId, userId, items: normalized });
      log("demo_ingest_ok", { reqId, userId, totalItems: counts.total, cartId });
      return res.json({
        ok: true, reqId, userId, cartId, tags, counts, items: normalized, cart, receivedAt: Date.now(),
      });
    } catch (err) {
      log("demo_ingest_err", { reqId, error: String(err?.message || err) });
      return res.status(500).json({ ok: false, error: "cart_append_failed", reqId });
    }
  }

  log("demo_ingest_ok", { reqId, userId, totalItems: counts.total, cartId: null });
  res.json({
    ok: true, reqId, userId, cartId: null, tags, counts, items: normalized, cart: null, receivedAt: Date.now(),
  });
});

// ==========================
// Cart API (base)
// ==========================
app.post("/api/cart/upsert", async (req, res) => {
  const { cartId, userId, items } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId", reqId: req.id });
  const normalized = Array.isArray(items) ? normalizeItems(items) : [];
  const cart = await upsertCart({ cartId, userId: String(userId), items: normalized });
  // track latest cart per user for user endpoints
  trackUserLatestCart(String(userId), cart.cartId || cartId);
  res.json({ ok: true, cart, reqId: req.id });
});

app.post("/api/cart/:cartId/items", async (req, res) => {
  const { cartId } = req.params;
  const { userId, items } = req.body || {};
  if (!cartId) return res.status(400).json({ ok: false, error: "missing_cartId", reqId: req.id });
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId", reqId: req.id });

  const normalized = Array.isArray(items) ? normalizeItems(items) : [];
  const cart = await appendItemsToCart({ cartId: String(cartId), userId: String(userId), items: normalized });
  trackUserLatestCart(String(userId), String(cartId));
  res.json({ ok: true, cart, reqId: req.id });
});

app.get("/api/cart/:cartId", async (req, res) => {
  const { cartId } = req.params;
  const c = await getCart(String(cartId));
  if (!c) return res.status(404).json({ ok: false, error: "cart_not_found", reqId: req.id });
  res.json({ ok: true, cart: c, reqId: req.id });
});

app.delete("/api/cart/:cartId", async (req, res) => {
  const { cartId } = req.params;
  const ok = await deleteCart(String(cartId));
  res.json({ ok, reqId: req.id });
});

// ---- Email summary for a specific cartId (existing feature) ----
app.post("/api/cart/:cartId/email-summary", authGate(isAuthRequired()), async (req, res) => {
  try {
    const gate = emailLimiter(req.ip || "unknown");
    if (!gate.allowed) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAt: gate.resetAt, reqId: req.id });
    }

    const { cartId } = req.params;
    const cart = await getCart(String(cartId));
    if (!cart) return res.status(404).json({ ok: false, error: "cart_not_found", reqId: req.id });

    const { to, subject, from } = req.body || {};
    if (!isValidEmail(to)) return res.status(400).json({ ok: false, error: "invalid_to", reqId: req.id });

    const html = renderTemplate("cartSummary", {
      title: "Your FoodBridge Cart",
      intro: "Here’s a summary of your current cart.",
      cart,
      ctaText: "Open FoodBridge",
      ctaUrl: "https://foodbridgeapp.github.io/FoodBridge",
      footer: "If this wasn’t you, just ignore this email.",
    });

    const sender = from && isValidEmail(from) ? from : process.env.SMTP_USER;
    const t = await getTransporter();
    const info = await t.sendMail({
      from: sender,
      to,
      subject: subject || "Your FoodBridge Cart",
      html,
    });

    res.json({
      ok: true,
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
      reqId: req.id,
    });
  } catch (err) {
    log("email_cart_summary_error", { error: String(err?.message || err), reqId: req.id });
    res.status(500).json({ ok: false, error: "send_failed", reqId: req.id });
  }
});

// ---- Export by cartId (existing) ----
app.get("/api/cart/:cartId/export.json", async (req, res) => {
  const { cartId } = req.params;
  const cart = await getCart(String(cartId));
  if (!cart) return res.status(404).json({ ok: false, error: "cart_not_found", reqId: req.id });

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify({ ok: true, cart, exportedAt: new Date().toISOString() }));
});

// ==========================
// NEW: Multi-source Cart Merge
// ==========================
function mergeItems(arraysOfItems) {
  const map = new Map(); // key = normalized name + unit
  const norm = (s) => (s || "").trim().toLowerCase();

  for (const items of arraysOfItems) {
    for (const raw of (items || [])) {
      const name = norm(raw.name || raw.title || raw.ingredient || "");
      if (!name) continue;
      const unit = (raw.unit || "").trim();
      const key = `${name}|${unit}`;

      if (map.has(key)) {
        const prev = map.get(key);
        const a = Number(prev.qty);
        const b = Number(raw.qty);
        if (!Number.isNaN(a) && !Number.isNaN(b)) prev.qty = a + b;
        prev.notes = prev.notes || raw.notes || null;
        prev.sourceUrl = prev.sourceUrl || raw.sourceUrl || null;
      } else {
        map.set(key, {
          id: raw.id || null,
          type: raw.type || "ingredient",
          title: raw.title || raw.name || name,
          name: raw.name || raw.title || name,
          qty: raw.qty ?? 1,
          unit,
          notes: raw.notes ?? null,
          sourceUrl: raw.sourceUrl ?? null,
          addedAt: new Date().toISOString(),
        });
      }
    }
  }
  return Array.from(map.values());
}

// Merge multiple sources and upsert a single cart for userId
app.post("/api/cart/merge", async (req, res) => {
  try {
    const { userId, cartId = null, sources } = req.body || {};
    if (!userId || !Array.isArray(sources)) {
      return res.status(400).json({ ok: false, error: "bad_request", reqId: req.id });
    }
    // Normalize each source items first, then merge
    const normalizedSources = sources.map((s) => normalizeItems(Array.isArray(s?.items) ? s.items : []));
    const merged = mergeItems(normalizedSources);
    const cart = await upsertCart({ cartId, userId: String(userId), items: merged });
    trackUserLatestCart(String(userId), cart.cartId || cartId);
    res.json({ ok: true, cart, reqId: req.id });
  } catch (e) {
    log("cart_merge_error", { error: String(e?.message || e), reqId: req.id });
    res.status(500).json({ ok: false, error: "merge_failed", reqId: req.id });
  }
});

// ==========================
// NEW: Export/Email by userId convenience
// ==========================

/**
 * We track the latest cartId per user in-process so that
 * /api/cart/export.json?userId=... and /api/cart/email can work
 * even if the underlying store is keyed by cartId.
 */
const userLatestCartId = new Map();
function trackUserLatestCart(userId, cartId) {
  if (userId && cartId) userLatestCartId.set(userId, String(cartId));
}
async function getCartByUser(userId) {
  // try direct key first
  let cart = await getCart(String(userId));
  if (cart) return cart;
  // then try our latest map
  const latest = userLatestCartId.get(String(userId));
  if (latest) {
    cart = await getCart(latest);
    if (cart) return cart;
  }
  return null;
}

app.get("/api/cart/export.json", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ ok: false, error: "missing_user", reqId: req.id });

  const cart = await getCartByUser(String(userId));
  if (!cart) return res.status(404).json({ ok: false, error: "cart_not_found", reqId: req.id });

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify({ ok: true, cart, exportedAt: new Date().toISOString() }));
});

app.post("/api/cart/email", authGate(isAuthRequired()), async (req, res) => {
  try {
    const gate = emailLimiter(req.ip || "unknown");
    if (!gate.allowed) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAt: gate.resetAt, reqId: req.id });
    }
    const { userId, to, subject, from } = req.body || {};
    if (!userId || !isValidEmail(to)) {
      return res.status(400).json({ ok: false, error: "bad_request", reqId: req.id });
    }

    const cart = await getCartByUser(String(userId));
    if (!cart) return res.status(404).json({ ok: false, error: "cart_not_found", reqId: req.id });

    const lines = (cart.items || []).map((i) => `• ${i.name}${i.qty ? " " + i.qty : ""}${i.unit ? " " + i.unit : ""}`);
    const html = `
      <h2>FoodBridge Cart</h2>
      <p>User: ${cart.userId || userId}</p>
      <ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
    `;

    const sender = from && isValidEmail(from) ? from : process.env.SMTP_USER;
    const t = await getTransporter();
    const info = await t.sendMail({
      from: sender,
      to,
      subject: subject || "Your FoodBridge Cart",
      html,
      text: lines.join("\n"),
    });

    res.json({
      ok: true,
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
      reqId: req.id,
    });
  } catch (e) {
    log("cart_email_error", { error: String(e?.message || e), reqId: req.id });
    res.status(500).json({ ok: false, error: "email_failed", reqId: req.id });
  }
});

// ==========================
// Error handler (last)
// ==========================
app.use((err, req, res, _next) => {
  log("uncaught_error", { reqId: req?.id, error: String(err?.stack || err) });
  res.status(500).json({ ok: false, error: "internal_error", reqId: req?.id });
});

// ==========================
// Start
// ==========================
app.listen(PORT, () => {
  log("listening", {
    port: String(PORT),
    version: VERSION,
    commit: COMMIT,
    shortCommit: SHORT_COMMIT,
  });
});
