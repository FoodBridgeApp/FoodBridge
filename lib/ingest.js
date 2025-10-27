// lib/ingest.js
import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Converts free text into a structured recipe card via OpenAI.
 * Returns: { title, summary, ingredients[], steps[], keywords[] }
 */
export async function analyzeText(text) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are FoodBridge, an AI that turns free-text into structured recipe cards.
Return valid JSON ONLY with fields:
{
  "title": "string",
  "summary": "string",
  "ingredients": ["string", "..."],
  "steps": ["string", "..."],
  "keywords": ["string", "..."]
}`
      },
      { role: 'user', content: text }
    ],
    temperature: 0.4
  });

  let recipe;
  try {
    recipe = JSON.parse(completion.choices[0].message.content);
  } catch {
    recipe = {
      title: 'Recipe',
      summary: completion.choices[0].message.content,
      ingredients: [],
      steps: [],
      keywords: []
    };
  }
  return recipe;
}
