// index.js
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

// 1. Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "FoodBridge API healthy" });
});

// 2. Free-text recipe ingestion via OpenAI
app.post("/api/ingest/free-text", async (req, res) => {
  try {
    const { text, diet } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    const prompt = `
      Generate a recipe based on this dish: "${text}".
      Diet restriction: ${diet || "None"}.
      Provide JSON with fields: {title, meta, ingredients[], steps[]}.
    `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      })
    });

    const data = await response.json();
    let recipe;

    try {
      recipe = JSON.parse(data.choices[0].message.content);
    } catch (e) {
      return res.status(500).json({ error: "Bad JSON from LLM", raw: data });
    }

    res.json(recipe);
  } catch (err) {
    console.error("Error ingest free-text:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 3. Placeholder for URL ingest (expand later)
app.post("/api/ingest/url", (req, res) => {
  res.json({ title: "Imported URL Recipe (stub)", ingredients: [], steps: [] });
});

// 4. Placeholder for audio ingest (expand later)
app.post("/api/ingest/audio", (req, res) => {
  res.json({ title: "Transcribed Audio Recipe (stub)", ingredients: [], steps: [] });
});

// Start server
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
