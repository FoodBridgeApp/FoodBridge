// lib/mailer.js
import nodemailer from "nodemailer";

const {
  SMTP_HOST = "smtp.gmail.com",
  SMTP_PORT = "587",
  SMTP_SECURE = "false",  // use "true" for port 465
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,              // e.g., 'FoodBridge <yourname@gmail.com>'
} = process.env;

if (!SMTP_USER || !SMTP_PASS) {
  console.warn("[mailer] Missing SMTP_USER/SMTP_PASS env vars");
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: String(SMTP_SECURE).toLowerCase() === "true",
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

transporter.verify().then(
  () => console.log("[mailer] SMTP verified"),
  (e) => console.warn("[mailer] SMTP verify failed:", e?.message || e)
);

export async function sendMail({ to, subject, text, html }) {
  const from = SMTP_FROM || SMTP_USER;
  return transporter.sendMail({
    from,
    to,
    subject,
    text: text || "",
    html: html || "<p>(empty body)</p>",
  });
}
