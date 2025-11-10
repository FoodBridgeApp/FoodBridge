import { Recipe, RecipeSchema } from "../../../packages/shared/src/schemas/RecipeSchema";
import { parseRecipeLLM } from "./llmParser";
import { parseRecipeRules } from "./rulesParser";

function toStr(v: any): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(toStr).join(" ");
  if (typeof v === "object") {
    // common wrappers
    if ("text" in v)  return toStr((v as any).text);
    if ("value" in v) return toStr((v as any).value);
    if ("content" in v) return toStr((v as any).content);
    // last resort: JSON dump trimmed (short)
    try {
      const s = JSON.stringify(v);
      return s.length > 200 ? s.slice(0,200) + "â€¦" : s;
    } catch { /* fall through */ }
  }
  try { return String(v); } catch { return ""; }
}

function sanitizeRecipe(r: Recipe): Recipe {
  return {
    ...r,
    title: toStr(r.title),
    ingredients: r.ingredients.map(i => ({
      ...i,
      raw: toStr(i.raw),
      name: toStr(i.name)
    })),
    steps: r.steps.map(s => ({
      ...s,
      text: toStr(s.text)
    }))
  };
}

export async function parseRecipeDeterministic(input: string): Promise<Recipe> {
  try {
    const maybe = await parseRecipeLLM(input);
    if (maybe) {
      const ok = RecipeSchema.safeParse(maybe);
      if (ok.success) return sanitizeRecipe(ok.data);
    }
  } catch { /* ignore and fallback */ }

  const ruled = parseRecipeRules(input);
  return sanitizeRecipe(ruled);
}








