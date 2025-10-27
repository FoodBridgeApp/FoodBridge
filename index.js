// index.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { sendMail } from "./lib/mailer.js";

const app = express();

// CORS: allow your GitHub Pages origin or default to *
const allowOrigin = process.env.FRONTEND_ORIGIN || "*";
app.use(cors({ origin: allowOrigin }));
app.use(bodyParser.json());

// --- Health check ---
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge API", ts: new Date().toISOString() });
});

// --- Email send (alias path used by your current frontend) ---
app.post("/api/email/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: 'Missing "to" or "subject".' });
    }
    const info = await sendMail({ to, subject, text, html });
    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// (Optional) canonical path if you want to migrate the frontend later
app.post("/api/mail/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: 'Missing "to" or "subject".' });
    }
    const info = await sendMail({ to, subject, text, html });
    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// --- 404 for unknown /api paths ---
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
