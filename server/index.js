import "dotenv/config";
import express from "express";
import cors from "cors";
import mountEmailRoutes from "./routes/emailPlan.js";
import mountPricesRoutes from "./routes/prices.js";
import mountVersionRoutes from "./routes/version.js";

const app = express();

// CORS allowlist
const fromEnv = (process.env.FRONTEND_ORIGIN || "https://foodbridgeapp.github.io")
  .split(",").map(s => s.trim()).filter(Boolean);
const allowList = new Set([
  ...fromEnv,
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
]);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    cb(null, allowList.has(origin));
  }
}));
app.use(express.json({ limit: "2mb" }));

// Basic health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Mount feature routes
mountEmailRoutes(app);
mountPricesRoutes(app);
mountVersionRoutes(app);

// Debug: list mounted routes
app.get("/api/_debug/routes", (_req, res) => {
  try {
    const list = [];
    const stack = app._router?.stack ?? [];
    stack.forEach((s) => {
      if (s.route?.path) {
        const methods = Object.keys(s.route.methods || {}).filter(Boolean);
        list.push({ path: s.route.path, methods });
      } else if (s.name === "router" && s.handle?.stack) {
        s.handle.stack.forEach(r => {
          if (r.route?.path) {
            const methods = Object.keys(r.route.methods || {}).filter(Boolean);
            list.push({ path: r.route.path, methods });
          }
        });
      }
    });
    res.json({ ok: true, routes: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// Fallback for unknown /api/* routes
app.use("/api", (_req, res) => {
  res.status(404).json({ ok: false, error: "API route not found" });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
