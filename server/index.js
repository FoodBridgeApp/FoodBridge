// server/index.js  (ESM)

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";

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

app.use(express.json());

// Basic rate-limit on all /api routes (300 req/min per IP)
app.use(
  "/api",
  rateLimit({
    windowMs: 60_000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* =========================
   Routes
   ========================= */

// Health
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "healthy", ts: Date.now() });
});

// Version
app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    shortCommit: COMMIT ? COMMIT.slice(0, 7) : null,
    startedAt: STARTED_AT,
  });
});

// Email health (placeholder)
app.get("/api/email/health", (req, res) => {
  const emailConfigured = !!process.env.SMTP_HOST;
  res.json({
    ok: emailConfigured,
    smtpHostSet: emailConfigured,
    ts: Date.now(),
  });
});

// Debug: whoami
app.get("/api/_debug/whoami", (req, res) => {
  res.json({
    ok: true,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    ts: Date.now(),
  });
});

// Debug: info
app.get("/api/_debug/info", (req, res) => {
  res.json({
    ok: true,
    env: process.env.NODE_ENV || "development",
    region: process.env.RENDER_REGION || null,
    commit: COMMIT || null,
    ts: Date.now(),
  });
});

// Ping
app.get("/api/ping", (req, res) => {
  res.json({ ok: true, pong: true, ts: Date.now() });
});

// Runtime config (SAFE only; no secrets)
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

// Aggregated status
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
   Start server
   ========================= */
const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ level: "info", msg, ...extra }));

app.listen(PORT, () => {
  log("listening", { port: PORT, version: VERSION });
});
