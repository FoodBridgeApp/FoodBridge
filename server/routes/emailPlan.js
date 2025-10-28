// /server/routes/emailPlan.js
import { Router } from "express";
import nodemailer from "nodemailer";

const router = Router();

// create transporter (using Gmail app password)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: String(process.env.SMTP_SECURE || "false") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// /api/email/health
router.get("/health", async (_req, res) => {
  try {
    await transporter.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// /api/email/send-test
router.post("/send-test", async (_req, res) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: "FoodBridge Test Email",
      text: "If you got this, your backend email route works ✅",
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// /api/email/send
router.post("/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;
    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: "Missing to or subject" });
    }
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
      html,
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

// Proper ESM export
export default function mountEmailRoutes(app) {
  app.use("/api/email", router);
}
