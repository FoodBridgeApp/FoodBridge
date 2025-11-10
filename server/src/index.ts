import "dotenv/config";
import express from "express";
import cors from "cors";
import pino from "pino";
import { debugRouter } from "./routes/debug";

import { probeRouter } from "./routes/probe";
import { normalizeIngredient } from "./parsers/normalize";
import { mountOpenAPI } from "./openapi";
import { parseRouter } from "./routes/parse";

const PORT = Number(process.env.PORT ?? 8080);
const ORIGIN = process.env.CORS_ORIGIN ?? `http://localhost:5173`;

const logger = pino({ transport: { target: "pino-pretty" } });
const app = express();
app.use("/__debug", debugRouter);
//
// >>> OBSERVE: short-circuit debug routes BEFORE any other middleware/routers
// (idempotent: we skip if already present)
if (!(globalThis as any).__foodbridgeObsMounted) {
  const __obs = async (req: any, res: any, next: any) => {
    try {
      if (req.path === "/__alive") {
        return res.json({ ok: true, msg: "alive", t: new Date().toISOString() });
      }
      if (req.path === "/__probe") {
        const mod = await import("./parsers/normalize");
        const normalizeIngredient = (mod as any).normalizeIngredient ?? null;
        if (!normalizeIngredient) return res.status(500).json({ ok:false, error:"normalizeIngredient not found" });
        const lines = [
          "200 g spaghetti",
          "2 tbsp olive oil",
          "3 cloves garlic (thinly sliced)",
          "1 tsp chili flakes",
          "salt",
          "parsley (optional)"
        ];
        const out = lines.map((raw, i) => normalizeIngredient(raw, `probe_${i+1}`));
        return res.json({ ok: true, out });
      }
      return next();
    } catch (e: any) {
      return res.status(500).json({ ok:false, error: e?.message ?? String(e) });
    }
  };
  app.use(__obs);
  (globalThis as any).__foodbridgeObsMounted = true;
}
// <<< OBSERVEapp.get("/__alive", (_req, res) => {
  res.json({ ok: true, msg: "server index.ts live", app: "app" });
});
app.use("/__probe", probeRouter);

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








/** __probe: show normalizer output on canonical lines */
app.get("/__probe", (_req, res) => {
  const lines = [
    "200 g spaghetti",
    "2 tbsp olive oil",
    "3 cloves garlic (thinly sliced)",
    "1 tsp chili flakes",
    "salt",
    "parsley (optional)"
  ];
  const out = lines.map((raw, i) => normalizeIngredient(raw, `probe_${i+1}`));
  res.json({ ok: true, out });
});







