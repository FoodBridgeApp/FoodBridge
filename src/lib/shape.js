export const emptyRecipe = Object.freeze({
  id: "empty",
  title: "",
  ingredients: [],
  sections: [],
  steps: [],
  tags: []
});

export function coerceRecipe(x) {
  const r = x ?? {};
  return {
    id: String(r.id ?? "unknown"),
    title: String(r.title ?? ""),
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    sections: Array.isArray(r.sections) ? r.sections : [],
    steps: Array.isArray(r.steps) ? r.steps : [],
    tags: Array.isArray(r.tags) ? r.tags : []
  };
}
