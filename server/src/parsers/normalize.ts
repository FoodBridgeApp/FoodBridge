import { Ingredient, UnitEnum } from "../../../packages/shared/src/schemas/RecipeSchema";

export function normalizeIngredient(rawLine: string, id: string): Ingredient {
  const raw = rawLine.trim();
  if (!raw) {
    return { id, raw: "", name: "", quantity: null, unit: null, notes: null };
  }
  const qtyUnitRegex = /^([\\d/.\\s]+)?\\s*(cup|cups|tsp|teaspoon|teaspoons|tbsp|tablespoon|tablespoons|oz|ounce|ounces|lb|pound|pounds|g|gram|grams|kg|ml|l)?\\s*(.*)$/i;
  const match = raw.match(qtyUnitRegex);

  let quantity: number | null = null;
  let unit: string | null = null;
  let name = raw;
  let notes: string | null = null;

  if (match) {
    const [, qtyPart, unitPart, tail] = match as any;
    if (qtyPart) quantity = parseQuantity(qtyPart.trim());
    if (unitPart) unit = mapUnit(unitPart.trim().toLowerCase());
    else if (quantity !== null) unit = "unit";
    name = (tail || raw).replace(/\\s*\\(.*?\\)\\s*/g, "").trim();
    const notesMatch = raw.match(/\\((.*?)\\)/);
    if (notesMatch) notes = notesMatch[1];
  }

  return {
    id,
    raw,
    name: canonicalizeName(name),
    quantity,
    unit: unit ? (UnitEnum.options.includes(unit as any) ? (unit as any) : null) : null,
    notes
  };
}

function parseQuantity(q: string): number | null {
  try {
    const parts = q.split(" ").filter(Boolean);
    let total = 0;
    for (const p of parts) {
      if (p.includes("/")) {
        const [a,b] = p.split("/").map(Number);
        if (!Number.isNaN(a) && !Number.isNaN(b) && b !== 0) total += a/b;
      } else {
        const n = Number(p);
        if (!Number.isNaN(n)) total += n;
      }
    }
    return total === 0 ? null : total;
  } catch { return null; }
}

function mapUnit(u: string): string | null {
  const m: Record<string,string> = {
    teaspoon: "tsp", teaspoons: "tsp",
    tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
    cup: "cup", cups: "cup",
    ounce: "oz", ounces: "oz",
    pound: "lb", pounds: "lb",
    g: "g", gram: "g", grams: "g",
    kg: "kg", ml: "ml", l: "l"
  };
  return m[u] ?? null;
}
function canonicalizeName(n: string): string {
  return n.toLowerCase().replace(/\\s+/g, " ").trim();
}







