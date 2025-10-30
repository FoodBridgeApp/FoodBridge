// server/llm.js
/**
 * Minimal LLM client + normalizer.
 * ENV:
 *   OPENAI_API_KEY        (required)
 *   LLM_MODEL=gpt-4o-mini (default)
 *   LLM_API_URL=https://api.openai.com/v1/chat/completions (default)
 */

const API_KEY   = process.env.OPENAI_API_KEY;
const API_URL   = process.env.LLM_API_URL || "https://api.openai.com/v1/chat/completions";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

if (!API_KEY) {
  console.warn("[llm] OPENAI_API_KEY not set. /api/ingest/llm will 500 until you add it.");
}

export async function chatJSON(system, user) {
  if (!API_KEY) throw new Error("OPENAI_API_KEY missing");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user",   content: user   },
      ],
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = json;
    throw err;
  }

  const content = json?.choices?.[0]?.message?.content || "{}";
  let parsed = {};
  try { parsed = JSON.parse(content); } catch {}
  return { raw: json, parsed };
}

export async function llmExtractItems({ text, sourceUrl = null }) {
  const system = `
You are a data normalizer. Return strictly JSON with:
{
  "items": [
    { "type":"recipe"|"ingredient", "title":string, "sourceUrl"?:string, "durationSec"?:number }
  ]
}
Rules:
- Prefer type:"recipe" for full dishes; use "ingredient" for single items.
- title is required (short, human-readable).
- durationSec is total cook time if present; omit if unknown.
- Include sourceUrl only if known.
- Never invent items not implied by the text.
- Keep items count reasonable (1-8).
`.trim();

  // keep payload modest for speed/cost (Render timeouts can bite on long calls)
  const trimmed = String(text || "").slice(0, 120_000);
  const user = JSON.stringify({ sourceUrl, text: trimmed });

  const { raw, parsed } = await chatJSON(system, user);

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const cleaned = items
    .map((it) => ({
      type: it.type === "ingredient" ? "ingredient" : "recipe",
      title: String(it.title || "").trim(),
      sourceUrl: it.sourceUrl ? String(it.sourceUrl) : undefined,
      durationSec: Number.isFinite(it.durationSec) ? Math.max(0, Math.round(it.durationSec)) : undefined,
    }))
    .filter((it) => it.title.length > 0);

  return {
    ok: true,
    items: cleaned,
    meta: {
      model: raw?.model || LLM_MODEL,
      promptTokens: raw?.usage?.prompt_tokens,
      completionTokens: raw?.usage?.completion_tokens,
    },
  };
}
