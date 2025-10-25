// server/routes/emailPlan.js
const express = require('express');
const nodemailer = require('nodemailer');

const router = express.Router();

// create reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true', // false for STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// health check
router.get('/health', async (req, res) => {
  try {
    await transporter.verify();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// send test email
router.post('/send-test', async (req, res) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.SMTP_USER, // send to yourself for testing
      subject: 'Test Email from FoodBridge',
      text: 'This is a test email from FoodBridge backend.',
    });
    res.json({ ok: true, id: info.messageId });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
