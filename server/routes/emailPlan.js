// /server/routes/emailPlan.js
import { Router } from "express";
import nodemailer from "nodemailer";

const router = Router();

// Gmail SMTP transporter (use your Gmail App Password)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true", // true => port 465
  auth: {
    user: process.env.SMTP_USER, // your full Gmail address
    pass: process.env.SMTP_PASS  // your Gmail App Password
  }
});

// GET /api/email/health
router.get("/health", async (_req, res) => {
  try {
    await transporter.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// POST /api/email/send-test  -> sends to yourself
router.post("/send-test", async (_req, res) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: "FoodBridge Test Email",
      text: "If you received this, your FoodBridge email route works ✅"
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// POST /api/email/send  { to, subject, text?, html? }
router.post("/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: "Missing to or subject" });
    }
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// Default export: mount under /api/email
export default function mountEmailRoutes(app) {
  app.use("/api/email", router);
}
