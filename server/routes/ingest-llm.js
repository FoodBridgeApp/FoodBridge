// server/routes/ingest-llm.js
// POST /api/ingest/llm
// Accepts:
//   { dish?: string, diet?: string, text?: string, sourceUrl?: string, userId?: string, cartId?: string }
// Behavior:
//   - If dish present: produce full structured recipe (title/ingredients/steps) with cookbook context
//   - If sourceUrl present: fetch & parse page, pass extracted text to the LLM
//   - Else, classic text extraction (recipe + ingredient items)
// Response:
//   For dish flow: { ok, mode:"dish", recipe:{...}, cart, reqId }
//   For text/url flow: { ok, mode:"text", items:[...], cart, reqId }

import express from "express";
import { findCandidates } from "../library.js";
import { llmMakeRecipe, llmSuggestIngredients } from "../llm.js";
import { appendItemsToCart, normalizeItems } from "../cart.js";
import { log } from "../logger.js";

const router = express.Router();

// ---------- tiny HTML → text helpers (no extra deps) ----------
function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// grab candidate “ingredients” sections by simple patterns
function extractIngredientCandidates(htmlText) {
  const text = stripTags(htmlText);
  const blocks = [];

  // Look for “Ingredients” header and grab up to ~800 chars after
  const hdrRe = /ingredients?\s*[:\-\n]/i;
  const idx = text.search(hdrRe);
  if (idx >= 0) {
    blocks.push(text.slice(idx, idx + 1200));
  }

  // Try list-like patterns (bullet-like words followed by commas/newlines)
  const listy = text.match(/(?:\b|\n)(?:-|\u2022|\*)\s*[A-Za-z][^\n]{2,80}(?:\n|,)/g);
  if (listy && listy.length) {
    blocks.push(listy.slice(0, 30).join("\n"));
  }

  // Generic foody terms around commas
  const foody = text.match(/\b([A-Za-z][a-z]+(?:\s+[A-Za-z][a-z]+){0,3})\s*(?:,|and)\s*/g);
  if (foody) {
    blocks.push(foody.slice(0, 50).join(" "));
  }

  // Return a conservative merged blurb
  return blocks.join("\n").slice(0, 3000);
}

async function safeFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "user-agent": "FoodBridgeBot/1.0" } });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(to);
  }
}

// ---------- sanity GET for quick checks ----------
router.get("/llm", (_req, res) => {
  res.json({
    ok: true,
    info: "POST { dish?, diet?, text?, sourceUrl?, userId?, cartId? }",
    examples: {
      dishFlow: { dish: "fish tacos", diet: "Pescatarian" },
      textFlow: { text: "Ingredients: 12 oz spaghetti, garlic... Steps: ..." },
      urlFlow: { sourceUrl: "https://www.instagram.com/p/xyz/" },
    },
  });
});

// ---------- main endpoint ----------
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

    // 1) Dish → structured recipe w/ cookbook grounding
    if (trimmedDish) {
      const context = findCandidates({ query: trimmedDish, diet }, { limit: 5 });
      const out = await llmMakeRecipe({ dish: trimmedDish, diet, context });

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

    // 2) URL provided → fetch & parse HTML, then ask LLM
    let workingText = String(text || "");
    let titleHint = null;

    if (sourceUrl) {
      try {
        const html = await safeFetch(String(sourceUrl));
        // Get a rough title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        titleHint = titleMatch ? stripTags(titleMatch[1]) : null;

        const extracted = extractIngredientCandidates(html);
        // Build a focused prompt combining the URL + extracted text
        workingText = [
          `You are reading a recipe page content extracted below.`,
          `SOURCE URL: ${sourceUrl}`,
          titleHint ? `PAGE TITLE: ${titleHint}` : "",
          "",
          `EXTRACTED TEXT (may be noisy):`,
          extracted || "(none found)",
          "",
          `TASK: Return the recipe name (if clear) and the ingredient list ONLY.`,
          `- 10–24 short grocery-style ingredient names (no brands/quantities/utensils).`,
          `- If no clear ingredients are present, try to infer from context but keep items realistic.`,
        ].filter(Boolean).join("\n");
      } catch (e) {
        // Fall back to classic text mode using just the URL string
        workingText = [
          `Attempt to infer the likely ingredient list for the recipe at this URL: ${sourceUrl}`,
          `Return 8–16 short ingredient names.`,
        ].join("\n");
      }
    }

    // 3) Classic text extraction (for URL or free text)
    const classicSystem = `
You are a recipe normalizer. Return strictly JSON:
{
  "items": [
    { "type":"recipe"|"ingredient", "title":string, "sourceUrl"?:string, "durationSec"?:number }
  ]
}
Rules:
- Use "recipe" for the single main dish name if identifiable; otherwise omit.
- Return realistic grocery ingredients (short names). No brands, no quantities, no utensils.
- Prefer 10–24 ingredients when confident, 8–16 otherwise.
`.trim();

    const API_KEY = process.env.OPENAI_API_KEY;
    const API_URL = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
    const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

    const payload = { text: workingText.slice(0, 120000), sourceUrl: sourceUrl || null, titleHint };
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
    try { parsed = JSON.parse(content); } catch {}

    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const cleaned = items
      .map((it, idx) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
        type: it.type === "ingredient" ? "ingredient" : "recipe",
        title: String(it.title || "").trim(),
        sourceUrl: it.sourceUrl ? String(it.sourceUrl) : (sourceUrl || null),
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

    log("llm_extract_ok", { reqId, totalItems: cleaned.length, fromUrl: !!sourceUrl });
    return res.json({
      ok: true,
      reqId,
      mode: "text",
      items: cleaned,
      cart: attachedCart,
      meta: { model: json?.model, fromUrl: !!sourceUrl, titleHint },
    });
  } catch (err) {
    log("llm_ingest_error", { reqId, error: String(err?.message || err) });
    return res.status(500).json({ ok: false, error: "ingest_failed", reqId: req.id });
  }
});

// Optional helper used later if you wire it in the UI
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
