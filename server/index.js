// server/index.js
const express = require("express");

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// --- Routers (make sure these files exist) ---
const prices    = require("./routes/prices");
const emailPlan = require("./routes/emailPlan");
const version   = require("./routes/version");

// --- Simple health & root checks ---
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

// --- Mount API routes (before listen) ---
app.use("/api/prices",  prices);
app.use("/api/email",   emailPlan);
app.use("/api/version", version);

// --- Start server ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
