import "dotenv/config";
import express from "express";
import cors from "cors";
import pino from "pino";
import { mountOpenAPI } from "./openapi";
import { parseRouter } from "./routes/parse";

const PORT = Number(process.env.PORT ?? 8080);
const ORIGIN = process.env.CORS_ORIGIN ?? `http://localhost:5173`;

const logger = pino({ transport: { target: "pino-pretty" } });
const app = express();

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "foodbridge-server", time: new Date().toISOString() });
});

app.use("/api/parse", parseRouter);
mountOpenAPI(app);

app.listen(PORT, () => {
  logger.info({ PORT, ORIGIN }, "FoodBridge server listening");
});






