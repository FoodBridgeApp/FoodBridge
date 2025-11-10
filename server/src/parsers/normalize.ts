import { Ingredient } from "../../../packages/shared/src/schemas/RecipeSchema";

/** map common spellings/plurals to canonical unit */
const UNIT_MAP: Record<string,string> = {
  "g":"g","kg":"kg","mg":"mg","lb":"lb","lbs":"lb","oz":"oz",
  "ml":"ml","l":"l",
  "tsp":"tsp","tsp.":"tsp","teaspoon":"tsp","teaspoons":"tsp",
  "tbsp":"tbsp","tbsp.":"tbsp","tablespoon":"tbsp","tablespoons":"tbsp",
  "cup":"cup","cups":"cup","pint":"pint","pints":"pint","qt":"qt","gal":"gal",
  "clove":"clove","cloves":"clove","slice":"slice","slices":"slice",
  "can":"can","cans":"can","packet":"packet","packets":"packet",
  "stick":"stick","sticks":"stick","dash":"dash","pinch":"pinch"
};

function canonicalUnit(u: string | null): string | null {
  if (!u) return null;
  const key = u.toLowerCase().replace(/\.$/, "");
  return UNIT_MAP[key] ?? null;
}

/** "1 1/2" / "1/2" / "1.5" -> number */
function toNumber(q: string): number | null {
  q = q.trim();
  const mix = q.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mix) {
    const w = +mix[1], n = +mix[2], d = +mix[3];
    return (Number.isFinite(w) && Number.isFinite(n) && Number.isFinite(d) && d !== 0) ? w + (n/d) : null;
  }
  const frac = q.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const n = +frac[1], d = +frac[2];
    return (Number.isFinite(n) && Number.isFinite(d) && d !== 0) ? n/d : null;
  }
  const f = +q;
  return Number.isFinite(f) ? f : null;
}

/** pull trailing "(...)" into notes */
function pullTailNote(s: string): { name: string; note: string | null } {
  const m = s.match(/\(([^)]*)\)\s*$/);
  if (m) {
    const name = s.replace(/\(([^)]*)\)\s*$/, "").trim();
    const note = m[1].trim();
    return { name, note: note || null };
  }
  return { name: s.trim(), note: null };
}

export function normalizeIngredient(rawLine: string, id: string): Ingredient {
  // Trim, drop bullets, collapse spaces
  let line = rawLine.trim().replace(/^[-•]\s*/, "").replace(/\s+/g, " ");
  if (!line) return { id, raw: rawLine, name: "", quantity: null, unit: null, notes: null };

  // 1) qty (1|1.5|1/2|1 1/2), 2) optional unit token (letters/dot), 3) rest
  // Keep the regex minimal; validate unit after matching.
  const re = /^(?<qty>\d+(?:\.\d+)?|\d+\s+\d+\/\d+|\d+\/\d+)\s*(?<unit>[A-Za-z\.]+)?\s*(?<rest>.+)?$/i;
  const m = line.match(re);

  if (m && m.groups) {
    const qtyRaw  = (m.groups["qty"]  ?? "").trim();
    const unitRaw = (m.groups["unit"] ?? "").trim();
    const restRaw = (m.groups["rest"] ?? "").trim();

    const quantity = toNumber(qtyRaw);
    // Only accept the captured unit if it's a real unit we recognize
    const unit = canonicalUnit(unitRaw || null);

    // If we incorrectly captured something as unit (e.g., "200 spaghetti"), put it back into the name
    const rest = unit ? restRaw : [unitRaw, restRaw].filter(Boolean).join(" ").trim();

    const { name, note } = pullTailNote(rest);
    return { id, raw: rawLine, name, quantity: quantity ?? null, unit, notes: note };
  }

  // No leading qty -> plain name
  const { name, note } = pullTailNote(line);
  return { id, raw: rawLine, name, quantity: null, unit: null, notes: note };
}
