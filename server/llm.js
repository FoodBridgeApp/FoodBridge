// server/llm.js
/**
 * LLM client + two helpers:
 *  - llmMakeRecipe: returns { title, ingredients[], steps[], durationSec?, tags? }
 *  - llmSuggestIngredients: returns { ingredients: string[] }
 *
 * ENV:
 *   OPENAI_API_KEY        (required)
 *   LLM_MODEL=gpt-4o-mini (default)
 *   LLM_API_URL=https://api.openai.com/v1/chat/completions (default)
 */

const API_KEY   = process.env.OPENAI_API_KEY;
const API_URL   = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

if (!API_KEY) {
  console.warn("[llm] OPENAI_API_KEY not set. LLM endpoints will 500 until you add it.");
}

async function chatJSON(messages) {
  if (!API_KEY) throw new Error("OPENAI_API_KEY missing");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  const content = json?.choices?.[0]?.message?.content || "{}";
  let parsed = {};
  try { parsed = JSON.parse(content); } catch {}
  return { raw: json, parsed };
}

export async function llmMakeRecipe({ dish, diet = "", context = [] }) {
  // context is an array of candidate cookbook entries {title, sourceUrl, tags, note, durationSec}
  const system = `
You are a precise recipe normalizer. Always return JSON:
{
  "title": string,
  "ingredients": string[],      // concrete grocery-line items (qty + unit when obvious)
  "steps": string[],            // clear numbered steps, 1 sentence each
  "durationSec": number|null,   // total time if obvious, else null
  "tags": string[]              // include diet and any clear tags like cuisine
}
Rules:
- NEVER return empty ingredients; if uncertain, infer a sensible, basic set from context.
- If dish is vague (e.g., "pizza"), produce a standard, minimal vetted version.
- Respect diet when present (vegan/vegetarian/paleo/gluten-free/dairy-free/keto/pescatarian) and avoid conflicts.
- Prefer cookbook CONTEXT facts over guesswork. Do NOT invent fancy items absent from context unless typical.
- Keep ingredients practical for U.S. grocery shopping (no brand names, no exotic items unless obvious).
`.trim();

  const user = {
    dish,
    diet,
    context, // top matches from your library to ground the LLM
  };

  const { parsed } = await chatJSON([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(user) },
  ]);

  const title = String(parsed?.title || dish || "Recipe").trim();
  const ingredients = Array.isArray(parsed?.ingredients) ? parsed.ingredients.map(String).filter(Boolean) : [];
  const steps = Array.isArray(parsed?.steps) ? parsed.steps.map(String).filter(Boolean) : [];
  const durationSec = Number.isFinite(parsed?.durationSec) ? Math.max(0, Math.round(parsed.durationSec)) : null;
  const tags = Array.isArray(parsed?.tags) ? parsed.tags.map(String).filter(Boolean) : (diet ? [diet] : []);

  return { ok: true, title, ingredients, steps, durationSec, tags, model: LLM_MODEL };
}

export async function llmSuggestIngredients({ query, diet = "" }) {
  const system = `
Return JSON: { "ingredients": string[] } with 3–6 concrete items that pair with the query ingredient or dish.
Rules:
- Match the user's query; avoid unrelated pantry oils/spices unless they are core to the pairing.
- Respect diet if given (vegan/vegetarian/paleo/gluten-free/dairy-free/keto/pescatarian).
- Keep each item a simple grocery line (no recipes, no brands).
`.trim();

  const user = { query, diet };

  const { parsed } = await chatJSON([
    { role: "system", content: system },
    { role: "user", content: JSON.stringify(user) },
  ]);

  const list = Array.isArray(parsed?.ingredients) ? parsed.ingredients.map(String).filter(Boolean) : [];
  return { ok: true, ingredients: list.slice(0, 8), model: LLM_MODEL };
}
