/**
 * server/llm.js  — tiny deterministic recipe generator used by /api/ingest/llm
 * ESM module (importable from .mjs routes)
 */

export async function generateRecipe({ dish = "", diet = "", withContext = false, context = "" } = {}) {
  const title = titleCase(dish || "Recipe");
  const base = [
    { name: "olive oil", qty: 1, unit: "tbsp", type: "ingredient" },
    { name: "salt", qty: 1, unit: "tsp", type: "ingredient" },
    { name: "black pepper", qty: 0.5, unit: "tsp", type: "ingredient" },
  ];

  const main = dish ? [{ name: dish.toLowerCase(), qty: 1, unit: "", type: "main" }] : [];
  const ingredients = [...main, ...base];

  const steps = [
    "Prep ingredients.",
    "Warm a pan and add olive oil.",
    dish ? `Add ${dish.toLowerCase()} and cook until done.` : "Cook main ingredient until done.",
    "Season with salt and pepper. Serve.",
  ];

  return {
    title,
    diet,
    withContext: withContext ? 1 : 0,
    context: withContext ? String(context || "").slice(0, 400) : "",
    ingredients,
    steps,
  };
}

function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Recipe";
}
