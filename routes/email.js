// /server/routes/emailPlan.js
import { Router } from "express";
import nodemailer from "nodemailer";

const router = Router();

/**
 * Gmail SMTP (use App Password)
 * Keep these only in Render env vars:
 *  SMTP_HOST=smtp.gmail.com
 *  SMTP_PORT=587
 *  SMTP_SECURE=false
 *  SMTP_USER=you@gmail.com
 *  SMTP_PASS=your_16_char_app_password
 *  SMTP_FROM="FoodBridge <you@gmail.com>"   (optional)
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true", // true => 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// GET /api/email/health
router.get("/health", async (_req, res) => {
  try {
    await transporter.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// POST /api/email/send-test -> sends to yourself
router.post("/send-test", async (_req, res) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: "FoodBridge: test email",
      text: "If you received this, your FoodBridge email route works ✅"
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// POST /api/email/send  { to, subject, text?, html? }
router.post("/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) return res.status(400).json({ ok: false, error: "Missing to or subject" });
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to, subject, text, html
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// Default export: mount under /api/email
export default function mountEmailRoutes(app) {
  app.use("/api/email", router);
}
