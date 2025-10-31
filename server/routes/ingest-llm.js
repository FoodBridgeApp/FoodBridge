// server/routes/ingest-llm.js
// POST /api/ingest/llm
// Accepts:
//   { dish?: string, diet?: string, text?: string, sourceUrl?: string, userId?: string, cartId?: string, tags?: string[] }
// Behavior:
//   - dish flow -> AI creates full structured recipe (title/ingredients/steps) with cookbook context
//   - url flow  -> fetch URL server-side, parse recipe schema/markup, then LLM normalizes
//   - text flow -> classic extraction
// Response:
//   Dish: { ok, mode:"dish", recipe:{...}, cart?, reqId }
//   URL/Text: { ok, mode:"text", items:[...], cart?, reqId }

import express from "express";
import { findCandidates } from "../library.js";
import { llmMakeRecipe, llmSuggestIngredients } from "../llm.js";
import { appendItemsToCart, normalizeItems } from "../cart.js";
import { log } from "../logger.js";

// Node 18+ global fetch is available on Render
const router = express.Router();

// Quick GET to prove the route exists
router.get("/llm", (_req, res) => {
  res.json({
    ok: true,
    usage: "POST /api/ingest/llm with { dish?, diet?, sourceUrl?, text?, userId?, cartId? }",
    examples: {
      dishFlow: { dish: "fish tacos", diet: "Pescatarian" },
      urlFlow:  { sourceUrl: "https://www.seriouseats.com/some-recipe" },
      textFlow: { text: "Ingredients: ... Steps: ..." },
    },
  });
});

// ---- helpers to pull content from recipe pages ----
function extractBetween(html, start, end) {
  const s = html.indexOf(start);
  if (s === -1) return null;
  const e = html.indexOf(end, s + start.length);
  if (e === -1) return null;
  return html.slice(s + start.length, e);
}

function parseJSONSafe(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function pickFirst(arrOrOne) {
  return Array.isArray(arrOrOne) ? (arrOrOne[0] ?? null) : arrOrOne ?? null;
}

async function fetchRecipeSource(sourceUrl) {
  // Best effort: try to fetch HTML and parse common structures
  // Note: Some sites (IG/TikTok) are JS-rendered or block bots; we still try
  const resp = await fetch(sourceUrl, { redirect: "follow" });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  const html = await resp.text();

  // Try JSON-LD (schema.org/Recipe)
  const scripts = Array.from(html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const m of scripts) {
    const json = parseJSONSafe(m[1]);
    if (!json) continue;
    const graph = Array.isArray(json["@graph"]) ? json["@graph"] : [json];
    for (const entry of graph) {
      if ((entry["@type"] === "Recipe") || (Array.isArray(entry["@type"]) && entry["@type"].includes("Recipe"))) {
        const name = pickFirst(entry.name) || "Recipe";
        const ingr = Array.isArray(entry.recipeIngredient) ? entry.recipeIngredient : [];
        const instr = Array.isArray(entry.recipeInstructions)
          ? entry.recipeInstructions.map((x) => (typeof x === "string" ? x : (x.text || ""))).filter(Boolean)
          : (typeof entry.recipeInstructions === "string" ? [entry.recipeInstructions] : []);
        return {
          title: name,
          ingredients: ingr,
          steps: instr,
          rawText: [name, ...ingr, ...instr].join("\n"),
        };
      }
    }
  }

  // Try Open Graph description or Twitter description as a weak fallback
  const og = extractBetween(html, '<meta property="og:description" content="', '">')
         || extractBetween(html, '<meta name="description" content="', '">')
         || extractBetween(html, '<meta name="twitter:description" content="', '">');

  const title = extractBetween(html, "<title>", "</title>")?.trim() || "Recipe";
  const rawText = [title, og].filter(Boolean).join("\n");
  return { title, ingredients: [], steps: [], rawText };
}

// --- dish-based recipe generation with cookbook grounding ---
router.post("/llm", async (req, res) => {
  const reqId = req.id;
  try {
    const {
      dish = "",
      diet = "",
      userId = "guest",
      text = "",
      sourceUrl = "",
      cartId = null,
      tags = [],
    } = req.body || {};

    const trimmedDish = String(dish || "").trim();
    const trimmedUrl  = String(sourceUrl || "").trim();
    const hasText     = String(text || "").trim().length > 0;

    // 1) Dish → structured recipe (title/ingredients/steps)
    if (trimmedDish) {
      const context = findCandidates({ query: trimmedDish, diet }, { limit: 5 });
      const out = await llmMakeRecipe({ dish: trimmedDish, diet, context });

      // mirror as items so cart code can reuse
      const items = [
        { type: "recipe", title: out.title, sourceUrl: trimmedUrl || null, durationSec: out.durationSec || null, tags: out.tags || [] },
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

    // 2) URL → try fetch & parse, then LLM normalize
    if (trimmedUrl && !hasText) {
      let page = null;
      try {
        page = await fetchRecipeSource(trimmedUrl);
      } catch (e) {
        log("llm_url_fetch_warn", { reqId, sourceUrl: trimmedUrl, error: String(e?.message || e) });
      }

      const baseText = page?.rawText || (`URL: ${trimmedUrl}`);
      const classicSystem = `
You are a recipe normalizer. Return strictly JSON:
{
  "items": [
    { "type":"recipe"|"ingredient", "title":string, "sourceUrl"?:string, "durationSec"?:number }
  ]
}
Rules:
- If the text contains a real recipe with ingredient lines, include them as 'ingredient' items (not placeholders).
- Keep titles short and human-readable.
- Include a top-level "recipe" item if a specific dish is clearly described.
`.trim();

      const API_KEY   = process.env.OPENAI_API_KEY;
      const API_URL   = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
      const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

      const payload = { text: String(baseText).slice(0, 120000), sourceUrl: trimmedUrl };
      const resLLM = await fetch(API_URL, {
        method: "POST",
        headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: LLM_MODEL,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: classicSystem },
            { role: "user",   content: JSON.stringify(payload) },
          ],
        }),
      });

      const json = await resLLM.json().catch(() => ({}));
      const content = json?.choices?.[0]?.message?.content || "{}";
      let parsed = {};
      try { parsed = JSON.parse(content); } catch {}

      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const cleaned = items
        .map((it, idx) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
          type: it.type === "ingredient" ? "ingredient" : "recipe",
          title: String(it.title || "").trim(),
          sourceUrl: it.sourceUrl ? String(it.sourceUrl) : trimmedUrl,
          durationSec: Number.isFinite(it.durationSec) ? Math.max(0, Math.round(it.durationSec)) : null,
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

      log("llm_url_ok", { reqId, items: cleaned.length, hadSchema: (page?.ingredients?.length || 0) > 0 });
      return res.json({ ok: true, reqId, mode: "text", items: cleaned, cart: attachedCart });
    }

    // 3) Text fallback
    const classicSystem = `
You are a recipe normalizer. Return strictly JSON:
{
  "items": [
    { "type":"recipe"|"ingredient", "title":string, "sourceUrl"?:string, "durationSec"?:number }
  ]
}
Rules:
- Use "recipe" for full dish; "ingredient" for single items.
- Prefer including real ingredient lines if present (no placeholders).
- Titles must be short and human-readable.
`.trim();

    const API_KEY   = process.env.OPENAI_API_KEY;
    const API_URL   = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
    const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

    const payload = { text: String(text || "").slice(0, 120000), sourceUrl: trimmedUrl || null };
    const resLLM = await fetch(API_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: classicSystem },
          { role: "user",   content: JSON.stringify(payload) },
        ],
      }),
    });

    const json = await resLLM.json().catch(() => ({}));
    const content = json?.choices?.[0]?.message?.content || "{}";
    let parsed = {};
    try { parsed = JSON.parse(content); } catch {}

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
    return res.json({ ok: true, reqId, mode: "text", items: cleaned, cart: attachedCart });
  } catch (err) {
    log("llm_ingest_error", { reqId, error: String(err?.message || err) });
    return res.status(500).json({ ok: false, error: "ingest_failed", reqId });
  }
});

// Ingredient suggestions (helper for UI). Returns top suggestions.
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
