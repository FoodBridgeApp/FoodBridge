import { Router } from "express";
import { normalizeIngredient } from "../parsers/normalize";

export const debugRouter = Router();

debugRouter.get("/alive", (_req, res) => {
  res.json({ ok: true, msg: "alive", t: new Date().toISOString() });
});

debugRouter.get("/probe", (_req, res) => {
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

// optional: show the endpoints in this router
debugRouter.get("/routes", (_req, res) => {
  // @ts-ignore
  const stack = (debugRouter as any).stack ?? [];
  const routes = stack
    .map((l:any) => l.route?.path ? { method: Object.keys(l.route.methods||{})[0], path: l.route.path } : null)
    .filter(Boolean);
  res.json({ ok: true, routes });
});
