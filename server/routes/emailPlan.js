// server/routes/emailPlan.js  (ESM)
import { Router } from 'express';
import { sendMail } from '../../lib/mailer.js';

const router = Router();

// Verify mailer / basic health
router.get('/health', async (_req, res) => {
  try {
    // sendMail's transporter verify happens on boot; we can just return ok here
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

// *** This is the endpoint your frontend calls ***
router.post('/send', async (req, res) => {
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

// Mount this router under /api/email in index.js
export default function mountEmailRoutes(app) {
  app.use('/api/email', router);
}
