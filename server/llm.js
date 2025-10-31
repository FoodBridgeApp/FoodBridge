// server/llm.js
/**
<<<<<<< HEAD
 * Minimal LLM helpers for FoodBridge.
=======
 * Minimal LLM client + normalizer.
>>>>>>> 3083ca3 (Auto-add ingest-llm route for hybrid LLM-cookbook logic)
 * ENV:
 *   OPENAI_API_KEY        (required)
 *   LLM_MODEL=gpt-4o-mini (default)
 *   LLM_API_URL=https://api.openai.com/v1/chat/completions (default)
 */

const API_KEY   = process.env.OPENAI_API_KEY;
const API_URL   = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

if (!API_KEY) {
<<<<<<< HEAD
  console.warn("[llm] OPENAI_API_KEY not set. LLM endpoints will 500 until you add it.");
}

async function chatJSON(system, user, { temperature = 0.2 } = {}) {
=======
  console.warn("[llm] OPENAI_API_KEY not set. /api/ingest/llm will 500 until you add it.");
}

export async function chatJSON(system, user) {
>>>>>>> 3083ca3 (Auto-add ingest-llm route for hybrid LLM-cookbook logic)
  if (!API_KEY) throw new Error("OPENAI_API_KEY missing");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
<<<<<<< HEAD
      authorization: `Bearer ${API_KEY}`,
=======
      "authorization": `Bearer ${API_KEY}`,
>>>>>>> 3083ca3 (Auto-add ingest-llm route for hybrid LLM-cookbook logic)
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
<<<<<<< HEAD
      temperature,
=======
      temperature: 0.2,
>>>>>>> 3083ca3 (Auto-add ingest-llm route for hybrid LLM-cookbook logic)
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user   },
      ],
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

<<<<<<< HEAD
/**
 * Classic extractor kept for /ingest.html tester
 */
=======
>>>>>>> 3083ca3 (Auto-add ingest-llm route for hybrid LLM-cookbook logic)
export async function llmExtractItems({ text, sourceUrl = null }) {
  const system = `
You are a data normalizer. Return strictly JSON with:
{
  "items": [
    { "type":"recipe"|"ingredient", "title":string, "sourceUrl"?:string, "durationSec"?:number }
  ]
}
Rules:
- Prefer type:"recipe" for full dishes; use "ingredient" for single items.
- title is required (short, human-readable).
- durationSec is total cook time if present; omit if unknown.
- Include sourceUrl only if known.
- Never invent items not implied by the text.
- Keep items count reasonable (1-8).
`.trim();

<<<<<<< HEAD
=======
  // keep payload modest for speed/cost (Render timeouts can bite on long calls)
>>>>>>> 3083ca3 (Auto-add ingest-llm route for hybrid LLM-cookbook logic)
  const trimmed = String(text || "").slice(0, 120_000);
  const user = JSON.stringify({ sourceUrl, text: trimmed });

  const { raw, parsed } = await chatJSON(system, user);

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const cleaned = items
    .map((it) => ({
      type: it.type === "ingredient" ? "ingredient" : "recipe",
      title: String(it.title || "").trim(),
      sourceUrl: it.sourceUrl ? String(it.sourceUrl) : undefined,
      durationSec: Number.isFinite(it.durationSec) ? Math.max(0, Math.round(it.durationSec)) : undefined,
    }))
    .filter((it) => it.title.length > 0);

  return {
    ok: true,
    items: cleaned,
    meta: {
      model: raw?.model || LLM_MODEL,
      promptTokens: raw?.usage?.prompt_tokens,
      completionTokens: raw?.usage?.completion_tokens,
    },
  };
}
<<<<<<< HEAD

/**
 * New: Make a structured recipe for a {dish, diet} using optional cookbook/library context.
 * context: array of strings or objects with {title, bullets[]} to guide the model.
 */
export async function llmMakeRecipe({ dish, diet = "", context = [] }) {
  const system = `
You generate clear, practical recipes. Return strictly JSON:
{
  "title": string,
  "ingredients": string[],      // 5–20 concise lines, quantities when known
  "steps": string[],            // 4–12 numbered steps, actionable
  "durationSec": number|null,   // total time in seconds if can be inferred
  "tags": string[]              // optional helpful tags
}
Rules:
- Keep it realistic for a home cook. If diet is provided, honor it (e.g., Vegan, Gluten-Free).
- If context is provided, use it to bias ingredient choices and methods, but don't copy verbatim.
- Never return an empty ingredients list.
`.trim();

  // normalize context a bit
  const ctx = Array.isArray(context) ? context : [];
  const userPayload = {
    dish: String(dish || ""),
    diet: String(diet || ""),
    context: ctx.slice(0, 5).map((c) => {
      if (typeof c === "string") return { note: c };
      if (c && typeof c === "object") return c;
      return { note: String(c) };
    }),
  };

  const { parsed, raw } = await chatJSON(system, JSON.stringify(userPayload));

  const title = String(parsed?.title || dish || "").trim() || "Untitled Dish";
  const ingredients = Array.isArray(parsed?.ingredients) ? parsed.ingredients.map(String).filter(Boolean) : [];
  const steps = Array.isArray(parsed?.steps) ? parsed.steps.map(String).filter(Boolean) : [];
  const durationSec = Number.isFinite(parsed?.durationSec) ? Math.max(0, Math.round(parsed.durationSec)) : null;
  const tags = Array.isArray(parsed?.tags) ? parsed.tags.map(String).filter(Boolean) : [];

  return {
    title,
    ingredients,
    steps,
    durationSec,
    tags,
    model: raw?.model || LLM_MODEL,
  };
}

/**
 * New: Suggest ingredients related to a query (used by "Ingredient Suggestions" UI)
 */
export async function llmSuggestIngredients({ query = "", diet = "" }) {
  const system = `
Return strictly JSON:
{
  "query": string,
  "suggestions": string[] // up to 8 short ingredient names, relevant to query and diet if provided
}
Rules:
- Suggestions must be specific grocery items (e.g., "penne", "parmesan", "garlic"), not vague actions.
- Respect diet constraints (e.g., Vegan -> no meat/dairy; Gluten-Free -> GF pasta/breads).
`.trim();

  const { parsed } = await chatJSON(system, JSON.stringify({ query, diet }), { temperature: 0.3 });
  const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions.map(String).filter(Boolean).slice(0, 8) : [];

  return {
    ok: true,
    query: String(parsed?.query || query || ""),
    suggestions,
  };
}

export { chatJSON };
=======
>>>>>>> 3083ca3 (Auto-add ingest-llm route for hybrid LLM-cookbook logic)
