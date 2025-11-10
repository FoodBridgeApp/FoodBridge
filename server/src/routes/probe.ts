import { Router } from "express";
import { normalizeIngredient } from "../parsers/normalize";

export const probeRouter = Router();

probeRouter.get("/", (_req, res) => {
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
