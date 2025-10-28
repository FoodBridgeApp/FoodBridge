// /lib/mailer.js (ESM)
import nodemailer from "nodemailer";

let transporter;

function createTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP_USER/SMTP_PASS not set");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure, // false for STARTTLS (587)
    auth: { user, pass }
  });

  return transporter;
}

export async function verifySmtp() {
  const t = createTransporter();
  return t.verify();
}

export async function sendMail({ to, subject, text, html }) {
  const t = createTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const info = await t.sendMail({
    from,
    to,
    subject,
    text,
    html
  });
  return info;
}
