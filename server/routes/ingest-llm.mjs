import express from "express";
import { log } from "../logger.js";
import { generateRecipe } from "../llm.js";

const router = express.Router();

/**
 * POST /api/ingest/llm
 * Body: { dish: string, diet?: string, withContext?: boolean, context?: string }
 */
router.post("/llm", async (req, res) => {
  try {
    const { dish = "", diet = "", withContext = false, context = "" } = req.body || {};
    const recipe = await generateRecipe({ dish, diet, withContext, context });
    log("llm_recipe_ok", { reqId: req.id, dish, diet, withContext: withContext ? 1 : 0 });
    res.json({ ok: true, reqId: req.id, mode: "dish", recipe });
  } catch (e) {
    log("llm_recipe_err", { reqId: req.id, error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: "llm_failed", reqId: req.id });
  }
});

export default router;
