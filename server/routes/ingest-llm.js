// server/routes/ingest-llm.js
// POST /api/ingest/llm
// Accepts:
//   { dish?: string, diet?: string, text?: string, sourceUrl?: string, userId?: string, cartId?: string, tags?: string[] }
// Behavior:
//   - If dish present: produce full structured recipe (title/ingredients/steps) using LLM with optional cookbook context
//   - Else: use sourceUrl/text to extract a real recipe (title/ingredients/steps) via LLM
// Response (both modes):
//   {
//     ok: true,
//     mode: "dish" | "text",
//     recipe: { title, ingredients: string[], steps: string[], durationSec?: number, tags?: string[], model?: string },
//     items:  [ { type:"recipe"| "ingredient", title, ... } ]   // Back-compat for /ingest.html & cart code
//     cart?:  {...},  // if cartId supplied
//     reqId
//   }

import express from "express";
import { appendItemsToCart, normalizeItems } from "../cart.js";
import { log } from "../logger.js";
import { chatJSON } from "../llm.js";

// Optional cookbook context (safe if library.js exists; otherwise we no-op)
let findCandidates = () => [];
try {
  const lib = await import("../library.js");
  if (typeof lib.findCandidates === "function") {
    findCandidates = lib.findCandidates;
  }
} catch {
  // library.js may be minimal in your build; it's okay to continue without context
}

// ---------------------------
// Small utilities (local)
// ---------------------------
function stripTags(s) {
  return String(s || "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function safeFetch(url, { timeoutMs = 8000 } = {}) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Helps some CDNs return HTML instead of JSON
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

/**
 * Extremely light text pull from generic HTML; we’re not scraping aggressively
 * to stay Render-friendly. LLM will do the final parsing.
 */
function extractTextCandidates(html) {
  const text = stripTags(
    html
      // kill scripts/styles quickly
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      // keep microdata bits if present
      .replace(/itemprop="recipeIngredient"[^>]*>(.*?)</gi, " $1 ")
  );
  // Trim to a sane payload size
  return text.slice(0, 120_000);
}

/**
 * Build a single, strict instruction for the LLM to return a real recipe.
 */
function buildRecipeSystemPrompt() {
  return `
You are a precise recipe normalizer. Return STRICTLY valid JSON:

{
  "title": string,
  "ingredients": string[],   // 6–24 short grocery-style items
  "steps": string[],         // 3–10 clear cooking steps, imperative voice
  "durationSec"?: number,    // total time in seconds if known else omit
  "tags"?: string[]          // optional keywords (diet, cuisine, etc.)
}

Rules:
- "ingredients" must be concrete grocery items (no utensil names, no brand names, no quantities required).
- "steps" must be real, actionable, specific to the dish (not generic filler).
- Use source text faithfully; if the source lacks steps, infer minimal plausible steps for the dish.
- Titles must be human-friendly and concise.
- Do not invent exotic items that aren’t implied by the source or dish context.
- JSON ONLY. No extra commentary.
`.trim();
}

/**
 * For Ingredient Suggestions endpoint.
 */
function buildSuggestSystemPrompt() {
  return `
Return STRICT JSON:
{ "ingredients": string[] }

Rules:
- 8–14 short grocery-style ingredients that pair with the query.
- No brands, no quantities, no utensils.
- Prefer produce, pantry, proteins, dairy/alt; avoid generic "cooking oil" unless central.
`.trim();
}

// Mirror a recipe object into items[] for cart/back-compat
function mirrorRecipeToItems(recipe, sourceUrl = null) {
  const items = [];
  if (recipe?.title) {
    items.push({
      type: "recipe",
      title: recipe.title,
      sourceUrl: sourceUrl || null,
      durationSec: Number.isFinite(recipe.durationSec) ? recipe.durationSec : undefined,
      tags: Array.isArray(recipe.tags) ? recipe.tags.slice(0, 12) : undefined,
    });
  }
  if (Array.isArray(recipe?.ingredients)) {
    for (const t of recipe.ingredients) {
      const title = String(t || "").trim();
      if (title) items.push({ type: "ingredient", title });
    }
  }
  return items;
}

// ---------------------------
// Router
// ---------------------------
const router = express.Router();

// Sanity GET (lets you confirm the route is mounted)
router.get("/llm", (_req, res) => {
  res.json({
    ok: true,
    info: "POST this endpoint with { dish?, diet?, text?, sourceUrl?, userId?, cartId?, tags? }",
    mode: ["dish", "text"],
    examples: {
      dishFlow: { dish: "fish tacos", diet: "Pescatarian" },
      textFlow: { sourceUrl: "https://www.instagram.com/p/...", text: "" },
    },
  });
});

/**
 * POST /api/ingest/llm
 */
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
    let recipeOut = null;

    // ================
    // A) Dish Mode
    // ================
    if (trimmedDish) {
      // optional cookbook grounding
      let contextLines = [];
      try {
        const ctx = findCandidates({ query: trimmedDish, diet }, { limit: 5 }) || [];
        contextLines = ctx.map((c, i) => `• ${c.title || c.name || c.tag || `candidate_${i + 1}`}`);
      } catch {
        // ignore context errors
      }

      const system = buildRecipeSystemPrompt();
      const userMsg = JSON.stringify({
        intent: "make_recipe",
        dish: trimmedDish,
        diet: String(diet || ""),
        notes: [
          contextLines.length ? `COOKBOOK CONTEXT:\n${contextLines.join("\n")}` : "",
          "Return ingredients[] and steps[] as described.",
        ].filter(Boolean).join("\n\n"),
      });

      const { parsed, raw } = await chatJSON(system, userMsg);
      recipeOut = {
        title: String(parsed?.title || trimmedDish).trim() || trimmedDish,
        ingredients: Array.isArray(parsed?.ingredients) ? parsed.ingredients.map(String) : [],
        steps: Array.isArray(parsed?.steps) ? parsed.steps.map(String) : [],
        durationSec: Number.isFinite(parsed?.durationSec) ? Math.max(0, Math.round(parsed.durationSec)) : undefined,
        tags: Array.isArray(parsed?.tags) ? parsed.tags.slice(0, 12) : undefined,
        model: raw?.model,
      };

      // Build items for cart/back-compat
      const items = mirrorRecipeToItems(recipeOut, sourceUrl);
      const normalized = normalizeItems(items);

      let attachedCart = null;
      if (cartId && normalized.length) {
        attachedCart = await appendItemsToCart({
          cartId: String(cartId),
          userId: String(userId),
          items: normalized,
        });
      }

      log("llm_recipe_ok", { reqId, dish: trimmedDish, diet, withContext: contextLines.length });
      return res.json({
        ok: true,
        reqId,
        mode: "dish",
        recipe: recipeOut,
        items,          // keep items for any older UI code that expects it
        cart: attachedCart,
      });
    }

    // ================
    // B) Text/URL Mode
    // ================
    let workingText = String(text || "");
    let titleHint = null;

    if (sourceUrl) {
      try {
        const html = await safeFetch(String(sourceUrl));

        // --- Instagram caption fallback ---
        if (/instagram\.com/i.test(sourceUrl)) {
          // Try modern JSON key first
          let caption = null;
          // Old edge_media_to_caption format
          const legacy = html.match(/"edge_media_to_caption":\s*\{"edges":\s*\[\{"node":\{"text":"([^"]+)/);
          if (legacy && legacy[1]) {
            caption = legacy[1];
          } else {
            // Some deployments have a "caption":"...","shortcode_media" block
            const newer = html.match(/"shortcode_media":\{[\s\S]*?"accessibility_caption":"[^"]*",[\s\S]*?"edge_media_to_caption":\{"edges":\[\{"node":\{"text":"([^"]+)/);
            if (newer && newer[1]) caption = newer[1];
          }
          if (caption) {
            const clean = caption.replace(/\\n/g, "\n");
            workingText = `Instagram caption detected:\n${clean}\n\nTASK: Extract real recipe title, ingredients[], and steps[].`;
          } else {
            // Fallback minimal instruction
            workingText = `Instagram link: ${sourceUrl}\nCaption hidden; infer plausible title, ingredients, and steps for the visible dish.`;
          }
        } else {
          // Generic HTML
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          titleHint = titleMatch ? stripTags(titleMatch[1]) : null;
          const extracted = extractTextCandidates(html);
          workingText = [
            `SOURCE URL: ${sourceUrl}`,
            titleHint ? `PAGE TITLE: ${titleHint}` : "",
            "",
            `EXTRACTED TEXT:`,
            extracted || "(none)",
            "",
            `TASK: Return the recipe title, ingredients[], and steps[].`,
          ].join("\n");
        }
      } catch {
        if (!workingText) {
          workingText = `Infer a plausible recipe (title, ingredients[], steps[]) for: ${sourceUrl}`;
        }
      }
    } else if (!workingText) {
      workingText = "No source provided. Infer nothing.";
    }

    const system = buildRecipeSystemPrompt();
    const userMsg = JSON.stringify({
      intent: "normalize_recipe_from_source",
      sourceUrl,
      text: String(workingText || "").slice(0, 120_000),
      hintTitle: titleHint || null,
    });

    const { parsed, raw } = await chatJSON(system, userMsg);

    recipeOut = {
      title: String(parsed?.title || titleHint || "Imported Recipe").trim(),
      ingredients: Array.isArray(parsed?.ingredients) ? parsed.ingredients.map(String) : [],
      steps: Array.isArray(parsed?.steps) ? parsed.steps.map(String) : [],
      durationSec: Number.isFinite(parsed?.durationSec) ? Math.max(0, Math.round(parsed.durationSec)) : undefined,
      tags: Array.isArray(parsed?.tags) ? parsed.tags.slice(0, 12) : undefined,
      model: raw?.model,
    };

    // Also mirror to items[] for back-compat with any UI that expects it
    const items = mirrorRecipeToItems(recipeOut, sourceUrl);
    const normalized = normalizeItems(items);

    let attachedCart = null;
    if (cartId && normalized.length) {
      attachedCart = await appendItemsToCart({
        cartId: String(cartId),
        userId: String(userId),
        items: normalized,
      });
    }

    log("llm_extract_ok", { reqId, totalItems: normalized.length, hasSteps: Array.isArray(recipeOut.steps) && recipeOut.steps.length > 0 });
    return res.json({
      ok: true,
      reqId,
      mode: "text",
      recipe: recipeOut,
      items,
      cart: attachedCart,
    });
  } catch (err) {
    log("llm_ingest_error", { reqId, error: String(err?.message || err) });
    return res.status(500).json({ ok: false, error: "ingest_failed", reqId });
  }
});

// ---------------------------
// Ingredient Suggestions
// ---------------------------
router.get("/ingredients/suggest", async (req, res) => {
  const reqId = req.id;
  try {
    const q = String((req.query?.q || "")).trim();
    const diet = String((req.query?.diet || "")).trim();

    const system = buildSuggestSystemPrompt();
    const userMsg = JSON.stringify({
      intent: "ingredient_suggestions",
      query: q,
      diet,
    });

    const { parsed, raw } = await chatJSON(system, userMsg);
    const ingredients = Array.isArray(parsed?.ingredients)
      ? parsed.ingredients.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 20)
      : [];

    res.json({
      ok: true,
      reqId,
      ingredients,
      model: raw?.model,
    });
  } catch (e) {
    log("ingredients_suggest_error", { reqId, error: String(e?.message || e) });
    res.status(500).json({ ok: false, error: "suggest_failed", reqId });
  }
});

export default router;
