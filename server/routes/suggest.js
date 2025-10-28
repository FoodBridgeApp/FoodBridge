// server/routes/suggest.js (ESM)
import express from "express";
const router = express.Router();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

// GET /api/suggest?q=tomato
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    if (!q) return res.status(400).json({ ok: false, error: "Missing q" });

    if (!OPENAI_API_KEY) {
      return res.json({ ok: true, suggestions: [`${q} (diced)`, `${q} (roasted)`, `${q} (paste)`] });
    }

    const messages = [
      { role: "system", content: "Output a simple JSON array of ingredient suggestions. No prose." },
      { role: "user", content: `Suggest 5 common variations or substitutes for: ${q}. Return JSON array.` }
    ];

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: MODEL, temperature: 0.2, messages, response_format: { type: "json_object" } })
    });

    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || r.statusText);

    // Expect {"suggestions":["...","..."]}
    const obj = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const suggestions = Array.isArray(obj?.suggestions) ? obj.suggestions : [];
    res.json({ ok: true, suggestions });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

export default router;
