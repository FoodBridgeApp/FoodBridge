import { parseRecipeLLM } from "./llmParser";
import { parseRecipeRules } from "./rulesParser";
import type { Recipe } from "../../../packages/shared/src/schemas/RecipeSchema";

/**
 * Deterministic entry point with a simple mode switch:
 *  - "rules": always rules parser
 *  - "llm": try LLM; if it returns null, fall back to rules
 *  - "auto": same as "llm"
 */
export async function parseRecipeDeterministic(
  input: string,
  mode: "auto" | "rules" | "llm" = "auto"
): Promise<Recipe> {
  if (mode === "rules") {
    return parseRecipeRules(input);
  }
  // mode === "llm" | "auto"
  const maybe = await parseRecipeLLM(input);
  return maybe ?? parseRecipeRules(input);
}

export { parseRecipeRules, parseRecipeLLM };
