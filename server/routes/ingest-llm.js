// server/routes/ingest-llm.js
// POST /api/ingest/llm
// Accepts:
//   { dish?: string, diet?: string, text?: string, sourceUrl?: string, userId?: string }
// Behavior:
//   - If dish present: produce full structured recipe (title/ingredients/steps) with cookbook context
//   - If only text present: fall back to classic extraction (recipe + ingredient items)
// Response:
//   For dish flow: { ok, recipe: {...}, reqId }
//   For text flow: { ok, items: [...], reqId } (back-compat for your ingest page)

import express from "express";
import { findCandidates } from "../library.js";
import { llmMakeRecipe, llmSuggestIngredients } from "../llm.js";
import { appendItemsToCart, normalizeItems } from "../cart.js"; // same functions you already export
import { log } from "../logger.js";

const router = express.Router();

// --- dish-based recipe generation with cookbook grounding ---
router.post("/ingest/llm", async (req, res) => {
  const reqId = req.id;
  try {
    const { dish = "", diet = "", userId = "guest", text = "", sourceUrl = null, cartId = null } = req.body || {};
    const trimmedDish = String(dish || "").trim();

    // if the UI sent a "dish" we use the new recipe-maker flow
    if (trimmedDish) {
      const context = findCandidates({ query: trimmedDish, diet }, { limit: 5 });
      const out = await llmMakeRecipe({ dish: trimmedDish, diet, context });

      // Optionally mirror as "items" to reuse existing cart code (ingredients as item lines)
      const items = [
        { type: "recipe", title: out.title, sourceUrl: sourceUrl || null, durationSec: out.durationSec || null, tags: out.tags || [] },
        ...out.ingredients.map(i => ({ type: "ingredient", title: i })),
      ];
      const normalized = normalizeItems(items);

      let attachedCart = null;
      if (cartId) {
        attachedCart = await appendItemsToCart({ cartId: String(cartId), userId: String(userId), items: normalized });
      }

      log("llm_recipe_ok", { reqId, dish: trimmedDish, diet, withContext: context.length });
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

    // --- fallback: classic text extraction (kept for your /ingest.html tester) ---
    const classicSystem = `
You are a data normalizer. Return strictly JSON with:
{ "items": [ { "type":"recipe"|"ingredient", "title":string, "sourceUrl"?:string, "durationSec"?:number } ] }
Rules:
- Prefer "recipe" for full dishes; "ingredient" for single items.
- Always include at least one 'ingredient' if text describes food items.
- Keep titles short and human-readable.
`.trim();

    const payload = { text: String(text || "").slice(0, 120000), sourceUrl };
    const { raw, parsed } = await (async () => {
      const API_KEY   = process.env.OPENAI_API_KEY;
      const API_URL   = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
      const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
      const resLLM = await fetch(API_URL, {
        method: "POST",
        headers: { "authorization": `Bearer ${API_KEY}`, "content-type": "application/json" },
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
      const json = await resLLM.json().catch(()=> ({}));
      const content = json?.choices?.[0]?.message?.content || "{}";
      let parsed = {};
      try { parsed = JSON.parse(content); } catch {}
      return { raw: json, parsed };
    })();

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const cleaned = items
      .map((it, idx) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
        type: it.type === "ingredient" ? "ingredient" : "recipe",
        title: String(it.title || "").trim(),
        sourceUrl: it.sourceUrl ? String(it.sourceUrl) : null,
        durationSec: Number.isFinite(it.durationSec) ? Math.max(0, Math.round(it.durationSec)) : null,
        addedAt: new Date().toISOString(),
      }))
      .filter(it => it.title.length > 0);

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
      meta: { model: raw?.model },
    });
  } catch (err) {
    log("llm_ingest_error", { reqId: req.id, error: String(err?.message || err) });
    return res.status(500).json({ ok: false, error: "ingest_failed", reqId: req.id });
  }
});

// (Optional) tiny helper route if you later wire Ingredient Suggestions UI to backend
router.get("/ingredients/suggest", async (req, res) => {
  try {
    const { q = "", diet = "" } = req.query || {};
    const out = await llmSuggestIngredients({ query: String(q), diet: String(diet) });
    return res.json({ ok: true, ...out, reqId: req.id });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "suggest_failed", reqId: req.id });
  }
});

export default router;
