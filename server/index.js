import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();

/** CORS allow-list **/
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

/** Simple health */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge API", ts: new Date().toISOString() });
});

/** Version */
app.get("/api/version", (_req, res) => {
  res.json({
    ok: true,
    service: "FoodBridge API",
    version: process.env.APP_VERSION || "2025-10-28"
  });
});

/** Minimal SMTP transporter (Gmail friendly) */
function makeTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/** Email health */
app.get("/api/email/health", async (_req, res) => {
  try {
    const t = makeTransporter();
    await t.verify();
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
    const t = makeTransporter();
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text, html
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

/** final 404 guard only for unknown /api paths */
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
