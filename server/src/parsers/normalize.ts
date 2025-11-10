import { Ingredient } from "../../../packages/shared/src/schemas/RecipeSchema";

/** Parse "1 1/2" or "1/2" or "1.5" -> number */
function parseQuantity(q: string): number | null {
  q = q.trim();
  // "1 1/2"
  const mix = q.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mix) {
    const whole = parseFloat(mix[1]);
    const num = parseFloat(mix[2]);
    const den = parseFloat(mix[3]);
    if (!Number.isNaN(whole) && !Number.isNaN(num) && !Number.isNaN(den) && den !== 0) {
      return whole + (num / den);
    }
  }
  // "1/2"
  const frac = q.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const num = parseFloat(frac[1]);
    const den = parseFloat(frac[2]);
    if (!Number.isNaN(num) && !Number.isNaN(den) && den !== 0) return num / den;
  }
  const f = parseFloat(q);
  return Number.isNaN(f) ? null : f;
}

// normalize common unit spellings/plurals/periods
const UNIT_SET = new Set([
  "g","kg","mg","lb","lbs","oz",
  "ml","l","tsp","tbsp","cup","cups","pint","pints","qt","gal",
  "clove","cloves","slice","slices","can","cans","packet","packets",
  "stick","sticks","dash","pinch"
]);

function cleanUnit(u: string): string {
  const x = u.toLowerCase().replace(/\.$/, "");
  if (x === "teaspoon" || x === "teaspoons") return "tsp";
  if (x === "tablespoon" || x === "tablespoons") return "tbsp";
  if (x === "pounds") return "lb";
  if (x === "liter" || x === "liters") return "l";
  if (UNIT_SET.has(x)) return x;
  return x; // unknown unit will be rejected by membership test later
}

/** Pull "(...)" from tail into notes */
function extractParenNote(s: string): { name: string; note: string | null } {
  const m = s.match(/\(([^)]*)\)\s*$/);
  if (m) {
    const name = s.replace(/\(([^)]*)\)\s*$/, "").trim();
    const note = m[1].trim();
    return { name, note: note.length ? note : null };
  }
  return { name: s.trim(), note: null };
}

export function normalizeIngredient(rawLine: string, id: string): Ingredient {
  // strip bullets and squeeze spaces
  let line = rawLine.trim().replace(/^[-•]\s*/, "").replace(/\s+/g, " ");
  if (!line) {
    return { id, raw: rawLine, name: "", quantity: null, unit: null, notes: null };
  }

  // tokens split (preserve things like "1/2")
  const tokens = line.split(" ").filter(Boolean);

  // 1) qty + unit + name   e.g., "200 g spaghetti", "2 tbsp olive oil", "1/2 cup milk"
  // 2) qty + name (no unit) e.g., "3 cloves garlic", "1 onion"
  // 3) bare name            e.g., "salt"
  let qty: number | null = null;
  let unit: string | null = null;
  let restStart = 0;

  // candidate qty is first token or first two tokens (for "1 1/2")
  const t0 = tokens[0] ?? "";
  const t1 = tokens[1] ?? "";

  // Try "1 1/2"
  if (/^\d+$/.test(t0) && /^\d+\/\d+$/.test(t1)) {
    qty = parseQuantity(t0 + " " + t1);
    restStart = 2;
  } else {
    // Try "1/2" or "1.5" or "2"
    const q = parseQuantity(t0);
    if (q !== null) {
      qty = q;
      restStart = 1;
    }
  }

  if (qty !== null) {
    // There might be a unit next
    const maybeUnit = tokens[restStart] ? cleanUnit(tokens[restStart]) : "";
    if (maybeUnit && UNIT_SET.has(maybeUnit)) {
      unit = maybeUnit;
      restStart += 1;
    }
    const { name, note } = extractParenNote(tokens.slice(restStart).join(" "));
    return { id, raw: rawLine, name, quantity: qty, unit, notes: note };
  }

  // No numeric qty at start -> treat full line as name (but pull notes out)
  const { name, note } = extractParenNote(line);
  return { id, raw: rawLine, name, quantity: null, unit: null, notes: note };
}
