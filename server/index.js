// server/index.js  (ESM)
// Features: health, version, config, logging, email send, demo ingest,
//           NEW: in-memory cart API, templated email send

import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import { requestLogger, log } from "./logger.js";
import {
  getCart,
  upsertCart,
  appendItemsToCart,
  deleteCart,
  normalizeItems,
} from "./cart.js";
import { renderTemplate } from "./templates.js";

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
];

/* =========================
   Middleware
   ========================= */
app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // CLI tools
      cb(null, ALLOW_ORIGINS.includes(origin));
    },
  })
);

app.use(express.json({ limit: "512kb" }));

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

// Simple per-IP limiter for email endpoints
const emailLimiter = (() => {
  const bucket = new Map();
  const WINDOW_MS = 60_000;
  const MAX = 20;
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
   Root endpoints (avoid 404 on probes)
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

/* =========================
   Platform info
   ========================= */
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
  res.json({ ok: true, reqId: req.id, headers: req.headers, body: req.body, ts: Date.now() });
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

app.post("/api/email/send", async (req, res) => {
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

/* =========================
   NEW: Templated Email
   ========================= */
/**
 * Body: { to, subject, template: "basic", vars: {...}, from? }
 * vars supports: title, intro, ctaText, ctaUrl, footer
 */
app.post("/api/email/template", async (req, res) => {
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
   Demo Ingest (also writes to a cart if cartId present)
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

  // If a cartId is specified, append to that cart
  let cartResult = null;
  if (cartId) {
    cartResult = appendItemsToCart({ cartId, userId, items: normalized });
  }

  const result = {
    ok: true,
    reqId,
    userId,
    cartId,
    tags,
    counts: counters,
    items: normalized,
    cart: cartResult,
    receivedAt: Date.now(),
  };

  log("demo_ingest_ok", { reqId, userId, totalItems: counters.total, cartId });
  res.json(result);
});

/* =========================
   NEW: Cart API
   ========================= */

// Create or update a cart (upsert). Body: { cartId?, userId, items? }
app.post("/api/cart/upsert", (req, res) => {
  const { cartId, userId, items } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId", reqId: req.id });

  const normalized = Array.isArray(items) ? normalizeItems(items) : [];
  const cart = upsertCart({ cartId, userId: String(userId), items: normalized });
  res.json({ ok: true, cart, reqId: req.id });
});

// Append items to a cart. Body: { items: [...] }
app.post("/api/cart/:cartId/items", (req, res) => {
  const { cartId } = req.params;
  const { userId, items } = req.body || {};
  if (!cartId) return res.status(400).json({ ok: false, error: "missing_cartId", reqId: req.id });
  if (!userId) return res.status(400).json({ ok: false, error: "missing_userId", reqId: req.id });

  const normalized = Array.isArray(items) ? normalizeItems(items) : [];
  const cart = appendItemsToCart({ cartId: String(cartId), userId: String(userId), items: normalized });
  res.json({ ok: true, cart, reqId: req.id });
});

// Read a cart
app.get("/api/cart/:cartId", (req, res) => {
  const { cartId } = req.params;
  const c = getCart(String(cartId));
  if (!c) return res.status(404).json({ ok: false, error: "cart_not_found", reqId: req.id });
  res.json({ ok: true, cart: c, reqId: req.id });
});

// Delete a cart
app.delete("/api/cart/:cartId", (req, res) => {
  const { cartId } = req.params;
  const ok = deleteCart(String(cartId));
  res.json({ ok, reqId: req.id });
});

/* =========================
   404 + Error handler
   ========================= */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found", reqId: req.id || null });
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
