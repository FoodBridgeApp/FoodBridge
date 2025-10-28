// server/routes/emailPlan.js  (ESM)
import { Router } from "express";
import { sendMail } from "../../lib/mailer.js";

const router = Router();

// optional quick check (doesn't hit Gmail each time)
router.get("/health", (_req, res) => res.json({ ok: true }));

// *** This is what the frontend calls: POST /api/email/send ***
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

// export a mount function
export default function mountEmailRoutes(app) {
  app.use("/api/email", router);
}
