import { normalizeIngredient } from "../parsers/normalize";
import { Router } from "express";
import { parseRecipeDeterministic } from "../parsers";

export export const parseRouter = Router();

parseRouter.post("/", async (req, res) => {
  const text = String(req.body?.text ?? "");
  const mode = (String(req.query?.mode ?? "auto") as "auto"|"rules"|"llm");
  const recipe = await parseRecipeDeterministic(text, mode);
  res.json({ ok: true, recipe });
});

parseRouter.get("/__alive", (_req, res) => {
  res.json({ ok: true, msg: "alive (parse router)", t: new Date().toISOString() });
});

parseRouter.get("/__probe", (_req, res) => {
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

parseRouter.get("/__paths", (_req, res) => {
  // @ts-ignore
  const stack = (parseRouter as any).stack ?? [];
  const routes = stack
    .map((l:any) => l.route?.path ? { method: Object.keys(l.route.methods||{})[0], path: l.route.path } : null)
    .filter(Boolean);
  res.json({ ok: true, base: "/api/parse", routes });
});


