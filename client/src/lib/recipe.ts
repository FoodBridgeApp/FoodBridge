export async function parseRecipeText(text: string) {
  const r = await fetch(`/api/llm/parse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error("LLM parse failed");
  const j = await r.json();
  return j.data as {
    title: string;
    ingredients: string[];
    steps: string[];
    time?: any;
    yields?: string;
  };
}
