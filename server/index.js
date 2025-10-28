// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";

// Routers (ESM, each exports default mountFn(app))
import mountEmailRoutes from "./routes/emailPlan.js";
import mountPricesRoutes from "./routes/prices.js";
import mountVersionRoutes from "./routes/version.js";

const app = express();

/**
 * CORS
 * FRONTEND_ORIGIN can be a single origin or comma-separated list.
 * We also allow common localhost dev ports.
 */
const fromEnv = (process.env.FRONTEND_ORIGIN || "https://foodbridgeapp.github.io").split(",").map(s => s.trim());
const allowList = new Set([
  ...fromEnv,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / same-origin
      return cb(null, allowList.has(origin));
    },
  })
);

app.use(express.json({ limit: "2mb" }));

// --- Health ---
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge API", ts: new Date().toISOString() });
});

// --- Mount feature routes ---
// Exposes: POST /api/email/send  (+ /api/email/health, /api/email/send-test if you kept them)
mountEmailRoutes(app);

// Exposes: POST /api/prices/optimize (or whatever your prices router defines)
mountPricesRoutes(app);

// Exposes: GET /api/version
mountVersionRoutes(app);

// --- 404 for any unknown /api paths ---
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
