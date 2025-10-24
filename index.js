// index.js (root) — mounts routes from server/routes/*
const express = require("express");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// Routers that live under server/routes
const prices    = require("./server/routes/prices");
const emailPlan = require("./server/routes/emailPlan");
const version   = require("./server/routes/version");

// Simple root + health
app.get("/", (_req, res) => {
  res.type("text/plain").send("FoodBridge server is up");
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    env: {
      hasResendKey: Boolean(process.env.RESEND_API_KEY),
      from: process.env.RESEND_FROM || process.env.EMAIL_FROM || "FoodBridge <onboarding@resend.dev>",
    },
  });
});

// Mount API (before listen)
app.use("/api/prices",  prices);
app.use("/api/email",   emailPlan);
app.use("/api/version", version);

// Start server (Render provides PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
