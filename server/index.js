import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();

/** CORS allow-list */
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
    if (!origin) return cb(null, true); // curl/same-origin
    cb(null, allowList.has(origin));
  }
}));
app.use(express.json({ limit: "2mb" }));

/** Basic health */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge API", ts: new Date().toISOString() });
});

/** Nodemailer transporter (Gmail or any SMTP) */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true", // STARTTLS if false
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  } : undefined
});

/** Email health (verifies SMTP) */
app.get("/api/email/health", async (_req, res) => {
  try {
    await transporter.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

/** Send email */
app.post("/api/email/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: "Missing 'to' or 'subject'." });
    }
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "foodbridge@example.com";
    const info = await transporter.sendMail({ from, to, subject, text, html });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

/** Version */
app.get("/api/version", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge API", version: process.env.APP_VERSION || "dev" });
});

/** 404 for unknown /api */
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
app.get('/api/_debug/routes', (_req, res) => {
  try {
    const list = [];
    const stack = app._router && app._router.stack ? app._router.stack : [];
    stack.forEach((s) => {
      if (s.route && s.route.path) {
        const methods = Object.keys(s.route.methods || {}).filter(Boolean);
        list.push({ path: s.route.path, methods });
      } else if (s.name === 'router' && s.handle && s.handle.stack) {
        s.handle.stack.forEach(r => {
          if (r.route && r.route.path) {
            const methods = Object.keys(r.route.methods || {}).filter(Boolean);
            list.push({ path: r.route.path, methods });
          }
        });
      }
    });
    res.json({ ok: true, routes: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});
