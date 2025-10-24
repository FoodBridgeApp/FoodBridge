import express from "express";

import prices from "./server/routes/prices.js";
import emailPlan from "./server/routes/emailPlan.js";
import version from "./server/routes/version.js";

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.type("text/plain").send("FoodBridge server is up");
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    env: {
      hasResendKey: Boolean(process.env.RESEND_API_KEY),
      from:
        process.env.RESEND_FROM ||
        process.env.EMAIL_FROM ||
        "FoodBridge <onboarding@resend.dev>",
    },
  });
});

app.use("/api/prices",  prices);
app.use("/api/email",   emailPlan);
app.use("/api/version", version);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`[server] Listening on port ${PORT}`);
});
