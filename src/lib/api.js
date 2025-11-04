import { coerceRecipe, emptyRecipe } from "./shape";

export const API_BASE = "https://foodbridge-server-rv0a.onrender.com";

export async function parseRecipe(q) {
  let resp;
  try {
    resp = await fetch(\\/api/llm/parse\, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: String(q ?? "").trim() })
    });
  } catch (e) {
    return { ok: false, error: "Network error", recipe: emptyRecipe };
  }

  // If server returns non-200, still try to read JSON; if that fails, fall back
  let data = null;
  try { data = await resp.json(); } catch { /* ignore */ }

  if (!resp.ok || !data || data.ok === false) {
    const msg = (data && (data.error || data.message)) || "LLM parse failed";
    return { ok: false, error: msg, recipe: emptyRecipe };
  }

  const recipe = coerceRecipe(data.recipe);
  return { ok: true, recipe };
}
