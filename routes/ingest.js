// server/routes/ingest.js (ESM)
import express from "express";

const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// Util: ask OpenAI to produce a normalized recipe JSON
async function llmRecipeFromText(raw, diet) {
  if (!OPENAI_API_KEY) {
    // Safe fallback so UI still moves
    return {
      title: diet ? `${diet} Dish` : "Generated Dish",
      meta: diet ? `Diet: ${diet}` : "",
      ingredients: ["1 tbsp olive oil", "2 cloves garlic", "Salt", "Pepper"],
      steps: ["Preheat pan.", "Add ingredients.", "Cook to taste."]
    };
  }

  const content = [
    {
      role: "system",
      content:
        "You are a chef that outputs STRICT JSON. Keys: title, meta, ingredients[], steps[]. No extra text."
    },
    {
      role: "user",
      content:
        `Make a clear, realistic recipe from this:\n\n${raw}\n\n` +
        `If a diet is provided (${diet || "none"}), keep it compliant. Output JSON only.`
    }
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      messages: content,
      response_format: { type: "json_object" }
    })
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || res.statusText);

  // data.choices[0].message.content should be the JSON
  const recipe = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  // Normalize fields
  recipe.title ||= "Recipe";
  recipe.meta ||= diet ? `Diet: ${diet}` : "";
  recipe.ingredients ||= [];
  recipe.steps ||= [];
  return recipe;
}

// POST /api/ingest/free-text  { dish, diet }
router.post("/free-text", async (req, res) => {
  try {
    const { dish, diet } = req.body || {};
    if (!dish) return res.status(400).json({ ok: false, error: 'Missing "dish".' });

    const recipe = await llmRecipeFromText(dish, diet);
    res.json({ ok: true, recipe });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// POST /api/ingest/url  { url }
router.post("/url", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ ok: false, error: 'Missing "url".' });

    // Fetch the page (very simple extraction)
    const r = await fetch(url, { redirect: "follow" });
    const html = await r.text();
    // crude text extraction
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000); // keep prompt small

    const recipe = await llmRecipeFromText(text);
    res.json({ ok: true, recipe });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// POST /api/ingest/audio  (placeholder; wire Whisper later)
router.post("/audio", async (_req, res) => {
  res.status(501).json({ ok: false, error: "Audio ingest not implemented yet." });
});

export default router;
