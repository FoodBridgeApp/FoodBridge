// server/index.js  (ESM-friendly)

import express from "express";
import cors from "cors";

const app = express();

// --- Config & constants ---
const PORT = process.env.PORT || 10000;
const STARTED_AT = new Date().toISOString();
const VERSION = process.env.FB_VERSION || "dev-local";

// --- Middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --- Health & version routes ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true, status: "healthy", ts: Date.now() });
});

app.get("/api/version", (req, res) => {
  res.json({ ok: true, version: VERSION, startedAt: STARTED_AT });
});

// --- Email health route (placeholder check) ---
app.get("/api/email/health", (req, res) => {
  const emailConfigured = !!process.env.SMTP_HOST;
  res.json({
    ok: emailConfigured,
    smtpHostSet: emailConfigured,
    ts: Date.now(),
  });
});

// --- Debug routes ---
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
    commit: process.env.RENDER_GIT_COMMIT || null,
    ts: Date.now(),
  });
});

// --- New routes ---
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
    commit: process.env.RENDER_GIT_COMMIT || null,
    features: {
      demoIngest: true,
      emailEnabled: !!process.env.SMTP_HOST,
    },
  });
});

// --- Aggregated status route ---
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    uptimeSec: process.uptime(),
    version: VERSION,
    emailReady: !!process.env.SMTP_HOST,
    startedAt: STARTED_AT,
  });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`[server] listening on ${PORT} (version=${VERSION})`);
});
