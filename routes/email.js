const express = require("express");
const router = express.Router();

const toAddress = process.env.FB_EMAIL_TO || process.env.EMAIL_TO || ""; // fallback
const fromAddress = process.env.FB_EMAIL_FROM || "noreply@foodbridge.app";
const provider = (process.env.FB_EMAIL_PROVIDER || "resend").toLowerCase();

router.post("/plan", async (req, res) => {
  try {
    const { items = [], total = 0, page = "", api = "" } = req.body || {};
    const lines = items.map(i => `- ${i.name || ""}  x${i.qty || 1}  $${Number(i.unitPrice||0).toFixed(2)}`).join("\n");
    const text = `FoodBridge Plan

Items:
${lines || "(none)"}

Estimated total: $${Number(total||0).toFixed(2)}

API: ${api}
Page: ${page}
Time: ${new Date().toISOString()}
`;

    if (!toAddress) return res.status(400).json({ ok:false, error:"Missing FB_EMAIL_TO/EMAIL_TO env var" });

    if (provider === "resend") {
      const { Resend } = require("resend");
      const resend = new Resend(process.env.RESEND_API_KEY || process.env.FB_RESEND_KEY);
      await resend.emails.send({
        from: fromAddress,
        to: toAddress,
        subject: "FoodBridge Plan",
        text
      });
    } else {
      // simple SMTP fallback via nodemailer if configured
      const nodemailer = require("nodemailer");
      const t = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await t.sendMail({ from: fromAddress, to: toAddress, subject: "FoodBridge Plan", text });
    }

    res.json({ ok:true });
  } catch (e) {
    console.error("email/plan error", e);
    res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
});

module.exports = router;
