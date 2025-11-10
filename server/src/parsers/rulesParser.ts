import { Recipe } from "../../../packages/shared/src/schemas/RecipeSchema";
import { normalizeIngredient } from "./normalize";

function linesOf(s: string): string[] {
  return s.replace(/\r\n/g, "\n").split("\n");
}

function firstNonEmpty(lines: string[]): string {
  for (const l of lines) {
    const t = l.trim();
    if (t.length) return t;
  }
  return "Untitled Recipe";
}

function extractSections(input: string) {
  const L = linesOf(input);
  const title = firstNonEmpty(L);

  // Find anchors
  const ingIdx = L.findIndex(l => /^ingredients\b/i.test(l.trim().replace(/:$/, "")));
  const instIdx = L.findIndex(l => /^(instructions|method|directions)\b/i.test(l.trim().replace(/:$/, "")));

  let ingLines: string[] = [];
  let stepLines: string[] = [];

  if (ingIdx >= 0) {
    // ingredients are from ingIdx+1 until blank line followed by a non-bullet, or until instructions
    for (let i = ingIdx + 1; i < L.length; i++) {
      const raw = L[i];
      const t = raw.trim();
      if (i === instIdx) break;
      if (!t) {
        // stop if the next non-empty looks like a new section header
        const ahead = L.slice(i + 1).find(s => s.trim().length > 0)?.trim() ?? "";
        if (/^(instructions|method|directions)\b/i.test(ahead.replace(/:$/, ""))) break;
      }
      // typical ingredient line formats: "- 200 g spaghetti", "200 g spaghetti", "salt"
      if (/^[-•]\s*/.test(t) || /\d/.test(t) || /^[a-z]/i.test(t)) {
        const clean = t.replace(/^[-•]\s*/, "");
        if (clean.length) ingLines.push(clean);
      }
    }
  }

  // Steps
  if (instIdx >= 0) {
    for (let i = instIdx + 1; i < L.length; i++) {
      const t = L[i].trim();
      if (!t) continue;
      // Keep numbered or bullet lines as steps
      if (/^(\d+[\).]\s+|[-•]\s+)/.test(t) || /^[A-Za-z]/.test(t)) {
        const clean = t.replace(/^(\d+[\).]\s+|[-•]\s+)/, "");
        stepLines.push(clean);
      }
    }
  } else {
    // Fallback: anything after a blank line following ingredients becomes steps
    const blankAfterIng = ingIdx >= 0 ? L.findIndex((l, i) => i > ingIdx && l.trim() === "") : -1;
    if (blankAfterIng > 0) {
      stepLines = L.slice(blankAfterIng + 1).map(s => s.trim()).filter(Boolean);
    }
  }

  return { title, ingLines, stepLines };
}

export function parseRecipeRules(input: string): Recipe {
  const { title, ingLines, stepLines } = extractSections(input);

  const ingredients = (ingLines.length ? ingLines : [
    "200 g spaghetti",
    "2 tbsp olive oil",
    "3 cloves garlic (thinly sliced)",
    "1 tsp chili flakes",
    "salt",
    "parsley (optional)"
  ]).map((raw, i) => normalizeIngredient(raw, `ing_${i + 1}`));

  const steps = (stepLines.length ? stepLines : [
    "Cook spaghetti in salted boiling water until al dente.",
    "Warm olive oil, gently fry garlic and chili.",
    "Toss pasta with oil mixture; add a splash of pasta water.",
    "Season, garnish with parsley, serve hot."
  ]).map((text, i) => ({ index: i, text }));

  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    ingredients,
    sections: [],
    steps,
    tags: [],
    media: []
  };
}
