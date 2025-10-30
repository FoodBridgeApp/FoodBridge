export function toCartItems(llmJson) {
  const items = [];
  const title = (llmJson?.title || "").trim() || "Untitled";
  const durationSec = Number.isFinite(llmJson?.durationSec) ? llmJson.durationSec : null;
  const sourceUrl = llmJson?.sourceUrl || null;

  // The recipe itself
  items.push({
    type: "recipe",
    title,
    sourceUrl,
    durationSec
  });

  // Ingredients (optional)
  const ing = Array.isArray(llmJson?.ingredients) ? llmJson.ingredients : [];
  for (const it of ing) {
    const t = (it?.title || "").trim();
    if (t) items.push({ type: "ingredient", title: t });
  }
  return items;
}