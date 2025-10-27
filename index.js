// index.js (ESM)
// -----------------
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { verifySmtp, sendMail } from './lib/mailer.js';

const app = express();

// === Middleware ===
app.use(cors());
app.use(express.json());

// === Health check ===
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// === SMTP endpoints ===

// Probe (useful only in dev/debug)
app.get('/debug/smtp', async (_req, res) => {
  try {
    await verifySmtp();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Send generic email
// POST /mail/send
// Body: { to: string, subject: string, text?: string, html?: string }
app.post('/mail/send', async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) {
      return res.status(400).json({ ok: false, error: 'Missing "to" or "subject".' });
    }
    const info = await sendMail({ to, subject, text, html });
    res.json({ ok: true, messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// === Custom routes (mount your existing routers here) ===
// Example:
// import myRoutes from './routes/index.js';
// app.use('/api', myRoutes);

// === Server listen ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
