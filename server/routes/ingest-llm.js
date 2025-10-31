// server/routes/ingest-llm.js
// POST /api/ingest/llm
// Accepts:
//   { dish?: string, diet?: string, text?: string, sourceUrl?: string, userId?: string, cartId?: string }
// Behavior:
//   - If dish present: produce full structured recipe (title/ingredients/steps) with cookbook context
//   - If only text present: fall back to classic extraction (recipe + ingredient items)
// Response:
//   For dish flow: { ok, mode:"dish", recipe:{...}, cart, reqId }
//   For text flow: { ok, mode:"text", items:[...], cart, reqId }

import express from "express";
import { findCandidates } from "../library.js";
import { llmMakeRecipe, llmSuggestIngredients } from "../llm.js";
import { appendItemsToCart, normalizeItems } from "../cart.js";
import { log } from "../logger.js";

const router = express.Router();

// Sanity GET so you can hit it in the browser
router.get("/llm", (_req, res) => {
  res.json({
    ok: true,
    info: "POST this endpoint with { dish?, diet?, text?, sourceUrl?, userId?, cartId? }",
    examples: {
      dishFlow: { dish: "fish tacos", diet: "Pescatarian" },
      textFlow: { text: "Ingredients: 12 oz spaghetti, garlic... Steps: ..." },
    },
  });
});

// --- dish-based recipe generation with cookbook grounding ---
router.post("/llm", async (req, res) => {
  const reqId = req.id;
  try {
    const {
      dish = "",
      diet = "",
      userId = "guest",
      text = "",
      sourceUrl = null,
      cartId = null,
      tags = [],
    } = req.body || {};

    const trimmedDish = String(dish || "").trim();

    // If the UI sent a "dish" we use the new recipe-maker flow
    if (trimmedDish) {
      const context = findCandidates({ query: trimmedDish, diet }, { limit: 5 });
      const out = await llmMakeRecipe({ dish: trimmedDish, diet, context });

      // Mirror as "items" so existing cart code can re-use it
      const items = [
        {
          type: "recipe",
          title: out.title,
          sourceUrl: sourceUrl || null,
          durationSec: out.durationSec || null,
          tags: out.tags || [],
        },
        ...out.ingredients.map((i) => ({ type: "ingredient", title: i })),
      ];
      const normalized = normalizeItems(items);

      let attachedCart = null;
      if (cartId) {
        attachedCart = await appendItemsToCart({
          cartId: String(cartId),
          userId: String(userId),
          items: normalized,
        });
      }

      log("llm_recipe_ok", {
        reqId,
        dish: trimmedDish,
        diet,
        withContext: context.length,
      });

      return res.json({
        ok: true,
        reqId,
        mode: "dish",
        recipe: {
          title: out.title,
          ingredients: out.ingredients,
          steps: out.steps,
          durationSec: out.durationSec,
          tags: out.tags,
          model: out.model,
        },
        cart: attachedCart,
      });
    }

    // --- fallback: classic text extraction (kept for /ingest.html tester & URL imports) ---
    const classicSystem = `
You are a recipe normalizer. Return strictly JSON:
{
  "items": [
    { "type":"recipe"|"ingredient", "title":string, "sourceUrl"?:string, "durationSec"?:number }
  ]
}
Rules:
- Use "recipe" for a full dish; "ingredient" for a single item.
- Prefer including at least a few 'ingredient' items when the text contains them.
- Titles must be short and human-readable.
`.trim();

    const API_KEY = process.env.OPENAI_API_KEY;
    const API_URL = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
    const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

    const payload = { text: String(text || "").slice(0, 120000), sourceUrl };
    const resLLM = await fetch(API_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: classicSystem },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });

    const json = await resLLM.json().catch(() => ({}));
    const content = json?.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try {
      parsed = JSON.parse(content);
    } catch {}

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const cleaned = items
      .map((it, idx) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
        type: it.type === "ingredient" ? "ingredient" : "recipe",
        title: String(it.title || "").trim(),
        sourceUrl: it.sourceUrl ? String(it.sourceUrl) : null,
        durationSec: Number.isFinite(it.durationSec)
          ? Math.max(0, Math.round(it.durationSec))
          : null,
        addedAt: new Date().toISOString(),
      }))
      .filter((it) => it.title.length > 0);

    let attachedCart = null;
    if (cartId && cleaned.length) {
      attachedCart = await appendItemsToCart({
        cartId: String(cartId),
        userId: String(userId),
        items: normalizeItems(cleaned),
      });
    }

    log("llm_extract_ok", { reqId, totalItems: cleaned.length });

    return res.json({
      ok: true,
      reqId,
      mode: "text",
      items: cleaned,
      cart: attachedCart,
      meta: { model: json?.model },
    });
  } catch (err) {
    log("llm_ingest_error", { reqId, error: String(err?.message || err) });
    return res.status(500).json({ ok: false, error: "ingest_failed", reqId });
  }
});

// Ingredient suggestions (optional helper used by UI)
router.get("/ingredients/suggest", async (req, res) => {
  try {
    const { q = "", diet = "" } = req.query || {};
    const out = await llmSuggestIngredients({
      query: String(q),
      diet: String(diet),
    });
    return res.json({ ok: true, ...out, reqId: req.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "suggest_failed", reqId: req.id });
  }
});

export default router;
