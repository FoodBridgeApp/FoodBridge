export const SYSTEM_PROMPT = `
You extract a SINGLE recipe from raw webpage text and return STRICT JSON:
{
  "title": "string",
  "durationSec": number|null,
  "sourceUrl": "string|null",
  "ingredients": [ { "title": "string" } ]
}
- durationSec is total cook+prep seconds if known; else null.
- ingredients list is short titles (e.g., "tomato", "olive oil", "garlic").
- Do NOT add commentary. JSON only.
`;

export function userPromptFromText(sourceUrl, text) {
  const trimmed = String(text || "").slice(0, 20000); // cap input
  return `SOURCE_URL: ${sourceUrl || "unknown"}
RAW_TEXT:
${trimmed}`;
}