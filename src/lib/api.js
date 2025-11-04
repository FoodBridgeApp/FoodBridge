import { emptyRecipe, coerceRecipe } from "./shape";

export const API_BASE = "https://foodbridge-server-rv0a.onrender.com";

export async function parseRecipe(q) {
  const body = { q: String(q ?? "").trim() };
  if (!body.q) return { ok:false, error:"Type something (e.g., 'pizza')", recipe: emptyRecipe };

  let resp;
  try {
    resp = await fetch(\\/api/llm/parse\, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch {
    return { ok:false, error:"Network error", recipe: emptyRecipe };
  }

  let data = null;
  try { data = await resp.json(); } catch { /* ignore */ }

  // Accept any shape; coerce to safe recipe
  const recipe = coerceRecipe(data?.recipe);
  const ok = !!(data && (data.ok ?? resp.ok) && recipe);
  return ok ? { ok:true, recipe } : { ok:false, error:(data?.error||"LLM parse failed"), recipe: emptyRecipe };
}
