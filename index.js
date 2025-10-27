// index.js (root)
// FoodBridge Backend API
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { verifySmtp, sendMail } from './lib/mailer.js';
import { analyzeText } from './lib/ingest.js';

const app = express();

/* ---------- CORS ---------- */
const allowOrigin = process.env.FRONTEND_ORIGIN || '*';
app.use(cors({ origin: allowOrigin }));
app.use(express.json());

/* ---------- API: Health ---------- */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/* ---------- API: SMTP Debug ---------- */
app.get('/api/debug/smtp', async (_req, res) => {
  try {
    await verifySmtp();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ---------- API: Send Mail ---------- */
app.post('/api/mail/send', async (req, res) => {
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

/* ---------- API: Ingest Free Text ---------- */
app.post('/api/ingest/free-text', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text) return res.status(400).json({ ok: false, error: 'Missing "text".' });

    const recipe = await analyzeText(text);

    res.json({ ok: true, recipe });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ---------- Catch-all for unknown /api ---------- */
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'API route not found' });
});

/* ---------- Start ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
