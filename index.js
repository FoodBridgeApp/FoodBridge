// index.js
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

// health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    env: {
      hasResendKey: !!process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || null
    }
  });
});

// email health
app.get('/api/email/health', (req, res) => {
  res.json({
    ok: true,
    hasKey: !!process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM || null,
    envChecked: {
      RESEND_FROM: !!process.env.RESEND_FROM,
      EMAIL_FROM: !!process.env.EMAIL_FROM
    }
  });
});

// send email
app.post('/api/email/send', async (req, res) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      return res.status(401).json({ ok: false, error: 'Missing API key' });
    }

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const out = await r.json();
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: out });
    }
    res.json({ ok: true, data: out });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
