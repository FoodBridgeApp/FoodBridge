import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { health } from "./routes/health.js";

const app = express();

const PORT = Number(process.env.PORT ?? 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? "http://localhost:5173";

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use(health);
app.get("/", (_req, res) => res.send("FoodBridge server is alive. See /health"));
app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] CORS origin: ${CORS_ORIGIN}`);
});
