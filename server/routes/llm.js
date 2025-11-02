// server/routes/llm.js — strict JSON recipe parser via OpenAI-compatible endpoint
import fetch from "node-fetch";
import { Router } from "express";

const router = Router();

// Tiny validator (no extra deps)
const RecipeSchema = {
  parse(obj) {
    if (typeof obj !== "object" || obj === null) throw new Error("not object");
    const { title, ingredients, steps, yields, time } = obj;
    if (typeof title !== "string" || !title.trim()) throw new Error("title string required");
    if (!Array.isArray(ingredients) || ingredients.length < 1) throw new Error("ingredients[] required");
    if (!Array.isArray(steps) || steps.length < 1) throw new Error("steps[] required");
    if (yields !== undefined && typeof yields !== "string") throw new Error("yields must be string if present");
    if (time !== undefined) {
      if (typeof time !== "object" || time === null) throw new Error("time must be object");
      for (const k of ["prep", "cook", "total"]) {
        if (time[k] !== undefined && typeof time[k] !== "string") throw new Error(`time.${k} must be string`);
      }
    }
    return obj;
  }
};

const PROMPT = `
You are a strict recipe normalizer. Output ONLY JSON matching this schema:
{
 "title": string,
 "ingredients": string[],
 "steps": string[],
 "yields": string?, 
 "time"?: { "prep"?: string, "cook"?: string, "total"?: string }
}
Rules:
- Do NOT invent ingredients.
- Convert quantities to a consistent readable format (e.g., "1 1/2 cups").
- Steps must be short, imperative sentences without numbering.
- If the source is malformed, omit unknown fields rather than hallucinating.
`;

router.post("/parse", async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || !String(text).trim()) return res.status(400).json({ error: "text required" });

    const url = process.env.LLM_URL || "https://api.openai.com/v1/chat/completions";
    const key = process.env.LLM_KEY || "";
    const model = process.env.LLM_MODEL || "gpt-4o-mini";
    if (!key) return res.status(500).json({ error: "LLM_KEY missing" });

    const aiResp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: String(text) }
        ]
      })
    }).then(r => r.json());

    const raw = typeof aiResp?.choices?.[0]?.message?.content === "string"
      ? aiResp.choices[0].message.content
      : JSON.stringify(aiResp?.choices?.[0]?.message?.content ?? {});

    const parsed = RecipeSchema.parse(JSON.parse(raw));
    res.json({ ok: true, data: parsed });
  } catch (e) {
    res.status(422).json({ ok: false, error: e?.message ?? "parse failed" });
  }
});

export default router;
