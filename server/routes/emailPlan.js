// /server/routes/emailPlan.js (ESM)
import { Router } from "express";
import { sendMail, verifySmtp } from "../../lib/mailer.js";

const router = Router();

// quick health (SMTP verify)
router.get("/health", async (_req, res) => {
  try {
    await verifySmtp();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// self-test: sends to SMTP_USER (no body required)
router.post("/send-test", async (_req, res) => {
  try {
    const to = process.env.SMTP_USER;
    if (!to) return res.status(400).json({ ok: false, error: "SMTP_USER not set" });
    const info = await sendMail({
      to,
      subject: "FoodBridge self-test ✅",
      html: "<p>Email pipeline works. (Route: /api/email/send-test)</p>",
      text: "Email pipeline works. (Route: /api/email/send-test)"
    });
    res.json({ ok: true, messageId: info.messageId, to });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// main UI route: POST /api/email/send { to, subject, text?, html? }
router.post("/send", async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: 'Missing "to" or "subject".' });
    }
    const info = await sendMail({ to, subject, text, html });
    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default function mountEmailRoutes(app) {
  app.use("/api/email", router);
}
