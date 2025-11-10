import OpenAI from "openai";
import { Recipe, RecipeSchema } from "../../../packages/shared/src/schemas/RecipeSchema";

export async function parseRecipeLLM(input: string): Promise<Recipe | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null; // no key -> caller will fallback to rules
  const client = new OpenAI({ apiKey });

  const system = "You convert plain-text recipes into strict JSON matching the schema fields exactly.";
  const user = `Text recipe:\\n\\n${input}\\n\\nReturn ONLY JSON with: id,title,description?,yield?,ingredients[],sections[],steps[],tags[],media[]`;

  const resp = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    response_format: { type: "json_object" }
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw);
    const parsed = RecipeSchema.safeParse(obj);
    if (parsed.success) return parsed.data as Recipe;
  } catch {
    return null;
  }
  return null;
}









