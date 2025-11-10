import { Router } from "express";
import { parseRecipeDeterministic } from "../parsers";

export const parseRouter = Router();

parseRouter.post("/", async (req, res) => {
  const text = String(req.body?.text ?? "");
  const mode = (String(req.query?.mode ?? "auto") as "auto"|"rules"|"llm");
  const recipe = await parseRecipeDeterministic(text, mode);
  res.json({ ok: true, recipe });
});
