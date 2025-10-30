// server/index.js  (ESM, no rate-limit)

import express from "express";
import cors from "cors";

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
