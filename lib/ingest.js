// lib/ingest.js
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Analyze free-text and produce a structured recipe card.
 * @param {string} text - Free text from user
 * @returns {object} recipe - { title, summary, ingredients[], steps[], keywords[] }
 */
export async function analyzeText(text) {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are FoodBridge, an AI that converts free-text into structured recipe cards.
Always respond in valid JSON with fields:
- title (string)
- summary (string)
- ingredients (array of strings)
- steps (array of strings)
- keywords (array of strings)`,
      },
      {
        role: 'user',
        content: `Create a recipe card from this input: "${text}"`,
      },
    ],
    temperature: 0.4,
  });

  let recipe;
  try {
    recipe = JSON.parse(completion.choices[0].message.content);
  } catch {
    recipe = {
      title: 'Recipe Suggestion',
      summary: completion.choices[0].message.content,
      ingredients: [],
      steps: [],
      keywords: [],
    };
  }

  return recipe;
}
