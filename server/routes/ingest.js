// server/routes/ingest.js — URL ingest with Open Graph/HTML fallback and timeout
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { Router } from "express";

const router = Router();

async function fetchHTML(url) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 6000); // 6s timeout
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FoodBridgeBot/1.0)" },
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(id);
  }
}

function scrapeOG(html) {
  const $ = cheerio.load(html);
  const ogTitle = $('meta[property="og:title"]').attr("content") || $("title").text() || "";
  const ogDesc = $('meta[property="og:description"]').attr("content") || "";
  const text = $("article, main, .recipe, .instructions").text() || $("body").text() || "";
  return {
    ogTitle: ogTitle.trim(),
    ogDesc: ogDesc.trim(),
    text: text.replace(/\s+\n/g, "\n").trim()
  };
}

router.post("/url", async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!/^https?:\/\//i.test(String(url || ""))) return res.status(400).json({ error: "invalid url" });
    const html = await fetchHTML(url);
    const scraped = scrapeOG(html);
    res.json({ ok: true, data: scraped });
  } catch (e) {
    res.status(504).json({ ok: false, error: "Timed out or blocked by site. Try copy–pasting the caption or content." });
  }
});

export default router;
