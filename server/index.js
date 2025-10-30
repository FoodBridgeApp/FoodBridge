// server/index.js  (ESM, stable commit/version handling, no external rate-limit deps)

import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();

/* =========================
   Config & constants
   ========================= */
const PORT = process.env.PORT || 10000;
const STARTED_AT = new Date().toISOString();

// Prefer Render’s injected commit; fall back to "dev-local"
const COMMIT = process.env.RENDER_GIT_COMMIT || "";
const SHORT_COMMIT = COMMIT ? COMMIT.slice(0, 7) : null;
const VERSION = COMMIT || "dev-local";

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
  const secure = String(process.env.SMTP_SECURE || "")_
