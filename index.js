// index.js (ESM, Node 20+)
import "dotenv/config";
import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";

const app = express();

// ----- BOOT LOGS -----
console.log("=== FoodBridge API boot ===");
console.log("NODE_ENV:", process.env.NODE_ENV || "(none)");
console.log("Running file: index.js at", new Date().toISOString());

// ----- CORS -----
const FRONTEND = process.env.FRONTEND_ORIGIN || "https://foodbridgeapp.github.io";
app.use(cors({
  origin: [
    FRONTEND, `${FRONTEND}/`,
    "http://localhost:3000","http://localhost:4000","http://localhost:5173","http://localhost:8080"
  ],
  methods: ["GET","POST","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization"],
}));

app.use(express.json({ limit: "1mb" }));

// ----- Health -----
app.get("/api/health", (_req,res) => {
  res.json({ ok:true, service:"FoodBridge API", ts:new Date().toISOString() });
});

// ----- Gmail SMTP -----
function makeTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASS;
  if (!user || !pass) {
    throw new Error("Missing GMAIL_USER or GMAIL_APP_PASS");
  }
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}
async function sendMail({ to, subject, text, html }) {
  const transporter = makeTransport();
  const fromName  = process.env.FROM_NAME  || "FoodBridge";
  const fromEmail = process.env.FROM_EMAIL || process.env.GMAIL_USER;
  const info = await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text: text || "",
    html: html || "<p>(empty)</p>",
  });
  return info;
}

// ----- ROUTE REGISTRATION (with logs) -----
console.log("Registering routes: /api/email/send, /api/mail/send, /api/email/ping, /api/email/send-test");

// Quick GET test to confirm this file is active
app.get("/api/email/send-test", (_req,res) => {
  res.json({ ok:true, route:"/api/email/send-test" });
});

// SMTP verify
app.get("/api/email/ping", async (_req,res) => {
  try {
    await makeTransport().verify();
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Your frontend calls this one:
app.post("/api/email/send", async (req,res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) return res.status(400).json({ ok:false, error:'Missing "to" or "subject".' });
    const info = await sendMail({ to, subject, text, html });
    res.json({ ok:true, messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Alias
app.post("/api/mail/send", async (req,res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to || !subject) return res.status(400).json({ ok:false, error:'Missing "to" or "subject".' });
    const info = await sendMail({ to, subject, text, html });
    res.json({ ok:true, messageId: info.messageId });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// ----- KEEP THIS LAST: /api 404 -----
app.use("/api", (_req,res) => {
  res.status(404).json({ ok:false, error:"API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
