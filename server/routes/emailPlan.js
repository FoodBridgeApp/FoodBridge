const express = require("express");
const router = express.Router();

const EMAIL_TRANSPORT = (process.env.EMAIL_TRANSPORT || "smtp").toLowerCase();
const DEFAULT_FROM =
  process.env.SMTP_FROM ||
  process.env.RESEND_FROM ||
  process.env.EMAIL_FROM ||
  "FoodBridge <onboarding@resend.dev>";

let transportName = EMAIL_TRANSPORT;

// ---------- SMTP (Gmail) ----------
let smtpSend = null;
if (EMAIL_TRANSPORT === "smtp") {
  const nodemailer = require("nodemailer");
  const host    = process.env.SMTP_HOST || "smtp.gmail.com";
  const port    = Number(process.env.SMTP_PORT || 587);
  const secure  = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user    = process.env.SMTP_USER || "";
  const pass    = process.env.SMTP_PASS || "";

  if (user && pass) {
    const transporter = nodemailer.createTransport({
      host, port, secure,
      auth: { user, pass },
    });

    smtpSend = async ({ from, to, subject, html, text, replyTo }) => {
      const info = await transporter.sendMail({
        from, to, subject, html, text, replyTo
      });
      return { id: info.messageId || null };
    };
  } else {
    transportName = "smtp-misconfigured";
  }
}

// ---------- Resend (fallback/alt) ----------
let resendSend = null;
if (EMAIL_TRANSPORT === "resend") {
  try {
    const { Resend } = require("resend");
    const key = process.env.RESEND_API_KEY || "";
    if (key) {
      const resend = new Resend(key);
      resendSend = async ({ from, to, subject, html, text, replyTo }) => {
        const payload = { from, to: Array.isArray(to) ? to : [to], subject, html };
        if (text) payload.text = text;
        if (replyTo) payload.reply_to = replyTo;
        const result = await resend.emails.send(payload);
        if (result?.error) {
          const msg = result.error?.message || "Resend error";
          const err = new Error(msg);
          err.details = result.error;
          throw err;
        }
        return { id: result?.data?.id || null };
      };
    } else {
      transportName = "resend-misconfigured";
    }
  } catch (e) {
    transportName = "resend-not-installed";
  }
}

// ---------- Active send function ----------
const activeSend = (EMAIL_TRANSPORT === "smtp") ? smtpSend
                 : (EMAIL_TRANSPORT === "resend") ? resendSend
                 : null;

// Health
router.get("/health", (_req, res) => {
  const t = EMAIL_TRANSPORT;
  const obf = (s) => (s ? `${s.slice(0,3)}…${s.slice(-2)}` : "");
  res.json({
    ok: Boolean(activeSend),
    transport: t,
    details: {
      smtp: {
        host: process.env.SMTP_HOST || null,
        port: process.env.SMTP_PORT || null,
        secure: process.env.SMTP_SECURE || "false",
        user: process.env.SMTP_USER ? obf(process.env.SMTP_USER) : null,
        hasPass: Boolean(process.env.SMTP_PASS)
      },
      resend: {
        hasKey: Boolean(process.env.RESEND_API_KEY),
      },
      from: DEFAULT_FROM,
      status: transportName
    }
  });
});

// Send
router.post("/send", async (req, res) => {
  try {
    if (!activeSend) {
      return res.status(500).json({ ok: false, error: `Email transport '${EMAIL_TRANSPORT}' not ready` });
    }
    const { to, subject, html, text, from, replyTo } = req.body || {};
    if (!to || !subject || !html) {
      return res.status(400).json({ ok: false, error: "Missing required fields: to, subject, html" });
    }
    const info = await activeSend({
      from: from || DEFAULT_FROM,
      to, subject, html, text, replyTo
    });
    return res.json({ ok: true, id: info.id || null });
  } catch (e) {
    console.error("[email] send error:", e);
    return res.status(502).json({ ok: false, error: e?.message || "Email send failed", details: e?.details || null });
  }
});

// Convenience: /send-test using RESEND_TEST_TO or SMTP_USER as a fallback
router.post("/send-test", async (_req, res) => {
  try {
    if (!activeSend) {
      return res.status(500).json({ ok: false, error: `Email transport '${EMAIL_TRANSPORT}' not ready` });
    }
    const to = process.env.RESEND_TEST_TO || process.env.SMTP_USER;
    if (!to) return res.status(400).json({ ok: false, error: "No test recipient (set RESEND_TEST_TO or SMTP_USER)" });

    const info = await activeSend({
      from: DEFAULT_FROM,
      to,
      subject: "FoodBridge SMTP test",
      html: "<b>Hello from FoodBridge via SMTP 🎉</b>"
    });
    res.json({ ok: true, id: info.id || null, to });
  } catch (e) {
    res.status(502).json({ ok: false, error: e?.message || "Email send failed" });
  }
});

module.exports = router;
