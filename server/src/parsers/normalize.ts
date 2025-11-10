import { Ingredient, UnitEnum } from "../../../packages/shared/src/schemas/RecipeSchema";

/** Convert "1 1/2" or "1/2" to 1.5 */
function parseQuantity(q: string): number | null {
  q = q.trim();
  // "1 1/2"
  const mix = q.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mix) {
    const whole = parseFloat(mix[1]);
    const num = parseFloat(mix[2]);
    const den = parseFloat(mix[3]);
    if (!isNaN(whole) && !isNaN(num) && !isNaN(den) && den !== 0) return whole + (num/den);
  }
  // "1/2"
  const frac = q.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (!isNaN(num) && !isNaN(den) && den !== 0) return num/den;
  }
  const f = parseFloat(q);
  return isNaN(f) ? null : f;
}

const UNIT_WORDS = [
  "g","kg","mg","lb","lbs","oz",
  "ml","l","tsp","tbsp","cup","cups","pint","pints","qt","gal",
  "clove","cloves","slice","slices","can","cans","packet","packets",
  "stick","sticks","dash","pinch"
];

export function normalizeIngredient(rawLine: string, id: string): Ingredient {
  const line = rawLine.trim().replace(/\s+/g, " ");

  // 1) qty + unit + name  (e.g., "200 g spaghetti", "2 tbsp olive oil")
  let m = line.match(/^(\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s*([a-zA-Z]+)\s+(.+)$/);
  if (m) {
    const qty = parseQuantity(m[1]) ?? parseFloat(m[1]);
    const unitRaw = m[2].toLowerCase();
    const unit = UNIT_WORDS.includes(unitRaw) ? unitRaw : null;
    const name = m[3].trim();
    return { id, raw: rawLine, name, quantity: qty ?? null, unit, notes: null };
  }

  // 2) qty + name (no obvious unit)  (e.g., "3 cloves garlic", "1 onion")
  m = line.match(/^(\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s+(.+)$/);
  if (m) {
    const qty = parseQuantity(m[1]) ?? parseFloat(m[1]);
    const rest = m[2].trim();

    // if the next token is a unit word, split it
    const parts = rest.split(" ");
    if (parts.length > 1 && UNIT_WORDS.includes(parts[0].toLowerCase())) {
      const unit = parts.shift()!.toLowerCase();
      const name = parts.join(" ").trim();
      return { id, raw: rawLine, name, quantity: qty ?? null, unit, notes: null };
    }

    return { id, raw: rawLine, name: rest, quantity: qty ?? null, unit: null, notes: null };
  }

  // 3) bare name
  return { id, raw: rawLine, name: line, quantity: null, unit: null, notes: null };
}
