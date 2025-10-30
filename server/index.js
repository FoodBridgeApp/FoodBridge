// server/index.js  (ESM, no external rate-limit deps)

import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();

/* =========================
   Config & constants
   ========================= */
const PORT = process.env.PORT || 10000;
const STARTED_AT = new Date().toISOString();
const COMMIT = process.env.RENDER_GIT_COMMIT || "";
const VERSION = process.env.FB_VERSION || COMMIT || "dev-local";

// Allowed UI origins (adjust if you add more)
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
      // allow non-browser tools (curl, Invoke-WebRequest) with no origin
      if (!origin) return cb(null, true);
      cb(null, ALLOW_ORIGINS.includes(origin));
    },
  })
);

// keep request body reasonable
app.use(express.json({ limit: "256kb" }));

/* =========================
   Utilities
   ========================= */
const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ level: "info", msg, ...extra }));

// Very small in-memory limiter for /api/email/send (per-IP)
const emailLimiter = (() => {
  const bucket = new Map(); // ip -> { count, resetAt }
  const WINDOW_MS = 60_000; // 1 minute
  const MAX = 20;           // 20 req / minute per IP
  return (ip) => {
    const now = Date.now();
    const cur = bucket.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
    if (now > cur.resetAt) {
      cur.count = 0;
      cur.resetAt = now + WINDOW_MS;
    }
    cur.count += 1;
    bucket.set(ip, cur);
    return { allowed: cur.count <= MAX, remaining: Math.max(0, MAX - cur.count), resetAt: cur.resetAt };
  };
})();

// Create transporter lazily (at first send) so boot is fast
let _transporter = null;
async function getTransporter() {
  if (_transporter) return _transporter;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = String(process.env.SMTP_SECURE || "").toLowerCase() === "true"; // true for 465

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
   Routes (existing)
   ========================= */
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "healthy", ts: Date.now() });
});

app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    shortCommit: COMMIT ? COMMIT.slice(0, 7) : null,
    startedAt: STARTED_AT,
  });
});

app.get("/api/email/health", async (req, res) => {
  const emailConfigured = !!process.env.SMTP_HOST && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;
  // Optional: try verify() without throwing
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
  });
});

app.get("/api/_debug/whoami", (req, res) => {
  res.json({
    ok: true,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    ts: Date.now(),
  });
});

app.get("/api/_debug/info", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    region: process.env.RENDER_REGION || null,
    commit: COMMIT || null,
    ts: Date.now(),
  });
});

app.get("/api/ping", (req, res) => {
  res.json({ ok: true, pong: true, ts: Date.now() });
});

app.get("/api/config", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    nodeEnv: process.env.NODE_ENV || "development",
    startedAt: STARTED_AT,
    region: process.env.RENDER_REGION || null,
    commit: COMMIT || null,
    features: {
      demoIngest: true,
      emailEnabled: !!process.env.SMTP_HOST,
    },
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    uptimeSec: process.uptime(),
    version: VERSION,
    shortCommit: COMMIT ? COMMIT.slice(0, 7) : null,
    emailReady: !!process.env.SMTP_HOST,
    startedAt: STARTED_AT,
  });
});

/* =========================
   NEW: Send Email
   ========================= */
app.post("/api/email/send", async (req, res) => {
  try {
    const ip = req.ip || "unknown";
    const gate = emailLimiter(ip);
    if (!gate.allowed) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAt: gate.resetAt });
    }

    const { to, subject, text, html, from } = req.body || {};
    if (!isValidEmail(to)) {
      return res.status(400).json({ ok: false, error: "invalid_to" });
    }
    if (!subject || typeof subject !== "string") {
      return res.status(400).json({ ok: false, error: "invalid_subject" });
    }
    if (!text && !html) {
      return res.status(400).json({ ok: false, error: "missing_body" });
    }

    // Default 'from' = SMTP_USER
    const sender = from && isValidEmail(from) ? from : process.env.SMTP_USER;

    const t = await getTransporter();
    const info = await t.sendMail({
      from: sender,
      to,
      subject,
      text: text || undefined,
      html: html || undefined,
    });

    res.json({
      ok: true,
      messageId: info.messageId || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
    });
  } catch (err) {
    log("email_send_error", { error: String(err?.message || err) });
    res.status(500).json({ ok: false, error: "send_failed" });
  }
});

/* =========================
   404 + Error handler
   ========================= */
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not_found" });
});

/* =========================
   Start server
   ========================= */
app.listen(PORT, () => {
  log("listening", { port: PORT, version: VERSION });
});
