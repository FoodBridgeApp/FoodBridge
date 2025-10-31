// server/library.js
// Loads your cookbook/library metadata and provides simple candidate matching.
// It will read from docs/data/recipes.json in your repo. You can swap to another
// path later (e.g., server/data/recipes.json) if you move your source.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try to load the shared repo JSON (the one you already committed).
const LIB_PATHS = [
  path.join(__dirname, "..", "docs", "data", "recipes.json"),
  path.join(__dirname, "..", "data", "recipes.json"),
];

let LIB = [];
let loadedFrom = null;

for (const p of LIB_PATHS) {
  try {
    const raw = fs.readFileSync(p, "utf8");
    const json = JSON.parse(raw);
    if (Array.isArray(json)) {
      LIB = json;
      loadedFrom = p;
      break;
    }
  } catch (_) {}
}

if (!LIB.length) {
  console.warn("[library] No recipes found. Add docs/data/recipes.json (array).");
} else {
  console.log(`[library] Loaded ${LIB.length} entries from: ${loadedFrom}`);
}

// Very small fuzzy score by word overlap on (title + book + tags).
function score(query, rec) {
  if (!query) return 0;
  const q = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${rec.title || ""} ${rec.book || ""} ${(rec.tags || []).join(" ")}`
    .toLowerCase();
  let s = 0;
  for (const w of q) if (hay.includes(w)) s += 1;
  return s;
}

export function findCandidates({ query, diet = "" }, { limit = 5 } = {}) {
  if (!LIB.length) return [];
  const scored = LIB
    .map(r => ({ r, s: score(query, r) + (diet && r.tags?.some(t => t.toLowerCase() === diet.toLowerCase()) ? 0.5 : 0) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(x => ({
      title: String(x.r.title || ""),
      book: x.r.book || null,
      sourceUrl: x.r.sourceUrl || null,
      tags: Array.isArray(x.r.tags) ? x.r.tags : [],
      note: x.r.note || null,
      durationSec: Number.isFinite(x.r.durationSec) ? x.r.durationSec : null,
      _score: x.s,
    }));
  return scored;
}
