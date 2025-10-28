// server/index.js
import "dotenv/config";
import express from "express";
import cors from "cors";

// Each of these files should export a default function: (app) => { ... }
import mountEmailRoutes from "./routes/emailPlan.js";
import mountPricesRoutes from "./routes/version.js" assert { type: "json" }; // <-- REMOVE THIS LINE IF WRONG
import mountVersionRoutes from "./routes/version.js";

// If you don't actually have a prices router, delete the import+call above and keep version only.
// (Most repos have routes/emailPlan.js, routes/prices.js, routes/version.js. Adjust imports to match YOUR tree.)

const app = express();

/** CORS allowlist */
const fromEnv = (process.env.FRONTEND_ORIGIN || "https://foodbridgeapp.github.io")
  .split(",")
  .map(s => s.trim());
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
      cb(null, allowList.has(origin));
    },
  })
);
app.use(express.json({ limit: "2mb" }));

// Health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge API", ts: new Date().toISOString() });
});

// Mount feature routes
mountEmailRoutes(app);   // exposes POST /api/email/send (and /api/email/health if you kept it)
// If you have these, keep them; otherwise remove.
// mountPricesRoutes(app);
mountVersionRoutes(app);

// 404 for unknown /api
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
