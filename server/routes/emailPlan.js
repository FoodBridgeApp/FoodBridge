import express from "express";
import { Resend } from "resend";

const router = express.Router();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.warn("[emailPlan] RESEND_API_KEY is not set. /api/email/send will 500.");
}
const resend = new Resend(RESEND_API_KEY);

const DEFAULT_FROM =
  process.env.RESEND_FROM ||
  process.env.EMAIL_FROM ||
  "FoodBridge <onboarding@resend.dev>";

router.post("/send", async (req, res) => {
  try {
    if (!RESEND_API_KEY) {
      return res.status(500).json({ ok: false, error: "Server missing RESEND_API_KEY" });
    }
    const { to, subject, html, from, replyTo, text } = req.body || {};
    if (!to || !subject || !html) {
      return res.status(400).json({ ok: false, error: "Missing required fields: to, subject, html" });
    }

    const toArr = Array.isArray(to) ? to : [to];
    const fromAddr = from || DEFAULT_FROM;

    const payload = { from: fromAddr, to: toArr, subject, html };
    if (replyTo) payload.reply_to = replyTo; // Resend uses snake_case
    if (text) payload.text = text;

    const result = await resend.emails.send(payload);
    if (result?.error) {
      return res.status(502).json({ ok: false, error: result.error.message || "Resend error", details: result.error });
    }
    return res.json({ ok: true, id: result?.data?.id || null, info: { from: fromAddr, to: toArr } });
  } catch (e) {
    console.error("[emailPlan] send error:", e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown server error" });
  }
});

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    hasKey: Boolean(RESEND_API_KEY),
    from: DEFAULT_FROM,
    envChecked: {
      RESEND_FROM: Boolean(process.env.RESEND_FROM),
      EMAIL_FROM: Boolean(process.env.EMAIL_FROM),
    },
  });
});

export default router;
