import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();

/** CORS allowlist */
const fromEnv = (process.env.FRONTEND_ORIGIN || "https://foodbridgeapp.github.io")
  .split(",").map(s => s.trim());
const allowList = new Set([
  ...fromEnv,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, allowList.has(origin));
  }
}));
app.use(express.json({ limit: "2mb" }));

/** DEBUG: commit + whoami */
const COMMIT = process.env.RENDER_GIT_COMMIT
  || process.env.VERCEL_GIT_COMMIT_SHA
  || process.env.GIT_COMMIT
  || "local";

/** REAL ROUTES — defined BEFORE any 404 fallback */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

app.get("/api/version", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge API", version: process.env.APP_VERSION || "unset", commit: COMMIT });
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

app.get("/api/email/health", async (_req, res) => {
  try { await transporter.verify(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ ok: false, error: String(err?.message || err) }); }
});

app.post("/api/email/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) return res.status(400).json({ ok: false, error: "Missing to or subject" });
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text, html,
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

app.get("/api/_debug/whoami", (_req, res) => {
  res.json({ ok: true, file: import.meta.url, commit: COMMIT, ts: new Date().toISOString() });
});

app.get("/api/_debug/info", (_req, res) => {
  try {
    const stack = (app._router && app._router.stack) || [];
    const routes = [];
    for (const s of stack) {
      if (s.route?.path) {
        routes.push({ path: s.route.path, methods: Object.keys(s.route.methods || {}) });
      } else if (s.name === "router" && s.handle?.stack) {
        for (const r of s.handle.stack) {
          if (r.route?.path) {
            routes.push({ path: r.route.path, methods: Object.keys(r.route.methods || {}) });
          }
        }
      }
    }
    res.json({ ok: true, commit: COMMIT, version: process.env.APP_VERSION || "unset", routes });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

/** 404 fallback — MUST be last */
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
