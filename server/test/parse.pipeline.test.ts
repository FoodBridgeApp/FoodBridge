import { describe, it, expect, beforeAll } from "vitest";
import { parseRecipeDeterministic } from "../src/parsers";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { RecipeSchema } from "../../packages/shared/src/schemas/RecipeSchema";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

beforeAll(() => {
  // give CI/Windows a little grace
  // @ts-ignore
  setTimeout(() => {}, 0);
});

describe("parse pipeline", () => {
  it("parses golden sample deterministically (rules fallback ok)", async () => {
    const txt = fs.readFileSync(join(__dirname, "golden", "sample.recipe.txt"), "utf-8");
    const out = await parseRecipeDeterministic(txt);
    const res = RecipeSchema.safeParse(out);
    expect(res.success).toBe(true);
    expect(out.title.toLowerCase()).toContain("aglio");
    expect(out.ingredients.length).toBeGreaterThan(0);
    expect(out.steps.length).toBeGreaterThan(0);
  }, 15000); // <= longer timeout on Windows
});








