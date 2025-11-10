import { Recipe, RecipeSchema } from "../../../packages/shared/src/schemas/RecipeSchema";
import { normalizeIngredient } from "./normalize";

/** Robust rules-based parser:
 *  - First non-empty line becomes title (unless it is "Ingredients"/"Instructions").
 *  - Accepts headings with/without colon, any case.
 *  - Accepts bullets (-, *) and numbered lines for ingredients/steps.
 */
export function parseRecipeRules(input: string): Recipe {
  const lines = input.split(/\r?\n/);
  const trimmed = lines.map(l => l.trim());

  // Title = first non-empty that is NOT a heading word
  const headingRx = /^(ingredients?|instructions?|method|steps)\s*:?\s*$/i;
  const title = (trimmed.find(l => l && !headingRx.test(l)) ?? "Untitled Recipe").replace(/^#\s*/, "");

  // Find section boundaries (indices within trimmed)
  const ingIdx = trimmed.findIndex(l => /^ingredients?\s*:?\s*$/i.test(l));
  const stpIdx = trimmed.findIndex(l => /^(instructions?|method|steps)\s*:?\s*$/i.test(l));

  // Slice ingredient lines
  let ingLines: string[] = [];
  if (ingIdx >= 0) {
    const end = stpIdx > ingIdx ? stpIdx : trimmed.length;
    ingLines = trimmed.slice(ingIdx + 1, end);
  } else {
    // Heuristic: first bullet/numbered block after title <= half doc
    const start = Math.max(trimmed.indexOf(title), 0) + 1;
    const bulletStart = trimmed.findIndex((l, i) => i >= start && /^[-*]\s+|\d+[.)]\s+/.test(l));
    if (bulletStart >= 0) {
      // continue until a blank line followed by a non-bullet OR we hit an instructions heading
      const collected: string[] = [];
      for (let i = bulletStart; i < trimmed.length; i++) {
        const l = trimmed[i];
        if (/^(instructions?|method|steps)\s*:?\s*$/i.test(l)) break;
        if (!l && collected.length > 0) {
          // peek next: stop if next is not bullet/number
          const next = trimmed[i + 1] ?? "";
          if (next && !/^[-*]\s+|\d+[.)]\s+/.test(next)) break;
        }
        collected.push(l);
      }
      ingLines = collected;
    }
  }

  // Slice step lines
  let stepLines: string[] = [];
  if (stpIdx >= 0) {
    stepLines = trimmed.slice(stpIdx + 1);
  } else if (ingIdx >= 0) {
    stepLines = trimmed.slice(ingIdx + 1 + ingLines.length);
  } else {
    // Fallback: latter half of doc
    const mid = Math.floor(trimmed.length * 0.6);
    stepLines = trimmed.slice(mid);
  }

  // Clean ingredient bullets and discard empties
  const ingredients = ingLines
    .map(l => l.replace(/^[-*]\s+/, "").replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean)
    .map((raw, i) => normalizeIngredient(raw, `ing_${i + 1}`));

  // Clean step numbering
  const steps = stepLines
    .map(l => l.replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean)
    .map((text, i) => ({ index: i, text }));

  const recipe: Recipe = {
    id: cryptoRandomId(),
    title,
    ingredients: ingredients.length ? ingredients : [normalizeIngredient("200 g pasta", "ing_1")],
    steps: steps.length ? steps : [{ index: 0, text: "Cook according to package directions." }],
    sections: [],
    tags: [],
    media: []
  };

  const parsed = RecipeSchema.safeParse(recipe);
  if (!parsed.success) {
    throw new Error("Rules parser produced invalid recipe: " + JSON.stringify(parsed.error.format()));
  }
  return parsed.data;
}

function cryptoRandomId(): string {
  try {
    // @ts-ignore
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  } catch {}
  return "r_" + Math.random().toString(36).slice(2);
}








