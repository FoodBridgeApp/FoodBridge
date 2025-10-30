// server/index.js (ESM, full file, no-Redis build)
// Features: health, version, config, logging, email send, templated email,
//           demo ingest, LLM ingest (primary), cart API (memory), cart email summary, export JSON
//           Optional JWT/HMAC auth via FB_REQUIRE_AUTH="true"

import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import { requestLogger, log } from "./logger.js";
import { renderTemplate } from "./templates.js";
import { authGate, isAuthRequired } from "./auth.js";

// --- LLM (OpenAI) ---
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

// ---- Choose cart backend at runtime (we default to memory) ----
const USE_REDIS = String(process.env.CART_BACKEND || "").toLowerCase() === "redis";
let getCart, upsertCart, appendItemsToCart, deleteCart, normalizeItems;

if (USE_REDIS) {
  const m = await import("./cart-redis.js");
  getCart = m.getCart;
  upsertCart = m.upsertCart;
  appendItemsToCart = m.appendItemsToCart;
  deleteCart = m.deleteCart;
  normalizeItems = m.normalizeItems;
  console.log("[cart] Using Redis backend");
} else {
  const m = await import("./cart.js");
  getCart = m.getCart;
  upsertCart = m.upsertCart;
  appendItemsToCart = m.appendItemsToCart;
  deleteCart = m.deleteCart;
  normalizeItems = m.normalizeItems;
  console.log("[cart] Using in-memory backend");
}

const app = express();

/* =========================
   Config & constants
   ========================= */
const PORT = process.env.PORT || 10000;
const STARTED_AT = new Date().toISOString();

const COMMIT = process.env.RENDER_GIT_COMMIT || "";
const SHORT_COMMIT = COMMIT ? COMMIT.slice(0, 7) : null;
const VERSION = COMMIT || "dev-local";

const ALLOW_ORIGINS = [
  "https://foodbridgeapp.github.io",
  "https://foodbridgeapp.github.io/FoodBridge",
  // "http://localhost:5173",
  // "http://localhost:3000",
];

/* =========================
   Middleware
   ========================= */
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // CLI & same-origin
      cb(null, ALLOW_ORIGINS.includes(origin));
    },
  })
);

// IMPORTANT: capture raw body *without* consuming the stream
app.use(
  express.json({
    limit: "512kb",
    verify: (req, _res, buf) => {
      req.rawBodyBuffer = Buffer.from(buf);
      req.rawBodyString = buf.toString("utf8");
    },
  })
);

// If you expect form posts too (optional):
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  next();
});

app.use(requestLogger());

/* =========================
   Utils
   ========================= */
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

/* =========================
   Root + Platform
   ========================= */
app.head("/", (req, res) => res.status(204).end());
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
      llmIngest: !!process.env.OPENAI_API_KEY,
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

/* =========================
   Email
   ========================= */
app.get("/api/email/health", async (req, res) => {
  const emailConfigured =
    !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

  let verified = false;
  if (emailConfigured) {
    try {
      const t = await getTransporter();
      await t.verify();
      verified = true;
    } catch {
      verified = false;
    }
  }
  res.json({
    ok: emailConfigured && verified,
    configured: emailConfigured,
    verified,
    ts: Date.now(),
    reqId: req.id,
  });
});

app.post("/api/email/send", authGate(isAuthRequired()), async (req, res) => {
  try {
    const ip = req.ip || "unknown";
    const gate = emailLimiter(ip);
    if (!gate.allowed) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAt: gate.resetAt, reqId: req.id });
    }

    const { to, subject, text, html, from } = req.body || {};
    if (!isValidEmail(to)) return res.status(400).json({ ok: false, error: "invalid_to", reqId: req.id });
    if (!subject || typeof subject !== "string")
      return res.status(400).json({ ok: false, error: "invalid_subject", reqId: req.id });
    if (!text && !html) return res.status(400).json({ ok: false, error: "missing_body", reqId: req.id });

    const sender = from && isValidEmail(from) ? from : process.env.SMTP_USER;

    const t = await getTransporter();
    const info = await t.sendMail({ from: sender, to, subject, text: text || undefined, html: html || undefined });

    res.json({
      ok: true,
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
      reqId: req.id,
    });
  } catch (err) {
    log("email_send_error", { error: String(err?.message || err), reqId: req.id });
    res.status(500).json({ ok: false, error: "send_failed", reqId: req.id });
  }
});

app.post("/api/email/template", authGate(isAuthRequired()), async (req, res) => {
  try {
    const ip = req.ip || "unknown";
    const gate = emailLimiter(ip);
    if (!gate.allowed) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAt: gate.resetAt, reqId: req.id });
    }

    const { to, subject, template = "basic", vars = {}, from } = req.body || {};
    if (!isValidEmail(to)) return res.status(400).json({ ok: false, error: "invalid_to", reqId: req.id });

    if (!subject || typeof subject !== "string")
      return res.status(400).json({ ok: false, error: "invalid_subject", reqId: req.id });

    const html = renderTemplate(template, vars);
    const sender = from && isValidEmail(from) ? from : process.env.SMTP_USER;

    const t = await getTransporter();
    const info = await t.sendMail({ from: sender, to, subject, html });

    res.json({
      ok: true,
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
      reqId: req.id,
    });
  } catch (err) {
    log("email_template_error", { error: String(err?.message || err), reqId: req.id });
    res.status(500).json({ ok: false, error: "send_failed", reqId: req.id });
  }
});

/* =========================
   Demo Ingest
   ========================= */
app.post("/api/ingest/demo", (req, res) => {
  const reqId = req.id;
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  const userId = String(body.userId || "guest");
  const cartId = body.cartId ? String(body.cartId) : null;
  const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];

  const normalized = normalizeItems(items);
  const counters = normalized.reduce(
    (acc, n) => {
      acc.total += 1;
      acc.byType[n.type] = (acc.byType[n.type] || 0) + 1;
      return acc;
    },
    { total: 0, byType: {} }
  );

  if (cartId) {
    appendItemsToCart({ cartId, userId, items: normalized })
      .then((cart) => {
        log("demo_ingest_ok", { reqId, userId, totalItems: counters.total, cartId });
        res.json({
          ok: true,
          reqId,
          userId,
          cartId,
          tags,
          counts: counters,
          items: normalized,
          cart,
          receivedAt: Date.now(),
        });
      })
      .catch((err) => {
        log("demo_ingest_err", { reqId, error: String(err?.message || err) });
        res.status(500).json({ ok: false, error: "cart_append_failed", reqId });
      });
    return;
  }

  log("demo_ingest_ok", { reqId, userId, totalItems: counters.total, cartId: null });
  res.json({
    ok: true,
    reqId,
    userId,
    cartId: null,
    tags,
    counts: counters,
    items: normalized,
    cart: null,
    receivedAt: Date.now(),
  });
});

/* =========================
   LLM Ingest (primary)
   ========================= */
app.post("/api/ingest/llm", async (req, res) => {
  const reqId = req.id;
  try {
    const body = req.body || {};
    const userId = String(body.userId || "guest");
    const cartId = body.cartId ? String(body.cartId) : null;
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    const text = (body.text || "").trim();

    if (!text) {
      return res.status(400).json({ ok: false, error: "missing_text", reqId });
    }
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "missing_openai_api_key", reqId });
    }

    // Ask the LLM to extract structured items from free text.
    // Output must be strict JSON with: { items: [{ type, title, sourceUrl?, durationSec? }] }
    const prompt = `
You extract recipes/ingredients from user text.
Return STRICT JSON only, no prose, with shape:
{"items":[{"type":"recipe"|"ingredient","title":string,"sourceUrl"?:string,"durationSec"?:number}]}

Rules:
- "type" is "recipe" when the text clearly names a dish; otherwise "ingredient".
- Infer duration only if explicit (minutes/seconds); else omit.
- If a URL is present, put it into "sourceUrl".
- Titles should be concise, human-friendly.

Text:
"""${text}"""
`;

    const chat = await openai.chat.completions.create({
      model: LLM_MODEL,
      temperature: 0,
      messages: [
        { role: "system", content: "You return strict JSON only. No extra text." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
    });

    const raw = chat?.choices?.[0]?.message?.content || "{}";
    let json;
    try {
      json = JSON.parse(raw);
    } catch (_e) {
      return res.status(502).json({ ok: false, error: "llm_invalid_json", raw, reqId });
    }

    const items = Array.isArray(json.items) ? json.items : [];
    const normalized = normalizeItems(items);

    const counts = normalized.reduce(
      (acc, it) => {
        acc.total += 1;
        acc.byType[it.type] = (acc.byType[it.type] || 0) + 1;
        return acc;
      },
      { total: 0, byType: {} }
    );

    if (cartId) {
      try {
        const cart = await appendItemsToCart({ cartId, userId, items: normalized });
        log("llm_ingest_ok", { reqId, userId, totalItems: counts.total, cartId });
        return res.json({
          ok: true,
          reqId,
          userId,
          cartId,
          tags,
          counts,
          items: normalized,
          cart,
          receivedAt: Date.now(),
        });
      } catch (err) {
        log("llm_ingest_err", { reqId, error: String(err?.message || err) });
        return res.status(500).json({ ok: false, error: "cart_append_failed", reqId });
      }
    }

    // If no cartId provided, just return the parsed items (same pattern as demo)
    log("llm_ingest_ok", { reqId, userId, totalItems: counts.total, cartId: null });
    return res.json({
      ok: true,
      reqId,
      userId,
      cartId: null,
      tags,
      counts,
      items: normalized,
      cart: null,
      receivedAt: Date.now(),
    });
  } catch (err) {
    log("llm_ingest_uncaught", { reqId: req?.id, error: String(err?.stack || err) });
    return res.status(500).json({ ok: false, error: "internal_error", reqId: req?.id });
  }
});

/* =========================
   Cart API
   ========================= */
app.post("/api/cart/upsert", async (req, res) => {
  const { cartId, userId, items } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId", reqId: req.id });

  const normalized = Array.isArray(items) ? normalizeItems(items) : [];
  const cart = await upsertCart({ cartId, userId: String(userId), items: normalized });
  res.json({ ok: true, cart, reqId: req.id });
});

app.post("/api/cart/:cartId/items", async (req, res) => {
  const { cartId } = req.params;
  const { userId, items } = req.body || {};
  if (!cartId) return res.status(400).json({ ok: false, error: "missing_cartId", reqId: req.id });
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId", reqId: req.id });

  const normalized = Array.isArray(items) ? normalizeItems(items) : [];
  const cart = await appendItemsToCart({ cartId: String(cartId), userId: String(userId), items: normalized });
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

app.post("/api/cart/:cartId/email-summary", authGate(isAuthRequired()), async (req, res) => {
  try {
    const ip = req.ip || "unknown";
    const gate = emailLimiter(ip);
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

app.get("/api/cart/:cartId/export.json", async (req, res) => {
  const { cartId } = req.params;
  const cart = await getCart(String(cartId));
  if (!cart) return res.status(404).json({ ok: false, error: "cart_not_found", reqId: req.id });

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify({ ok: true, cart, exportedAt: new Date().toISOString() }));
});

/* =========================
   Error handler (last)
   ========================= */
app.use((err, req, res, _next) => {
  log("uncaught_error", { reqId: req?.id, error: String(err?.stack || err) });
  res.status(500).json({ ok: false, error: "internal_error", reqId: req?.id });
});

/* =========================
   Start
   ========================= */
app.listen(PORT, () => {
  log("listening", {
    port: String(PORT),
    version: VERSION,
    commit: COMMIT,
    shortCommit: SHORT_COMMIT,
  });
});
