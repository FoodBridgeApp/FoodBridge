import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { Router } from "express";
const router = Router();

/** Fetch URL with a short timeout */
async function fetchHTML(url) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      headers: {
        // Friendly desktop UA; some sites block default Node UA
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Fetch failed ${r.status}`);
    const ct = r.headers.get("content-type") || "";
    const text = await r.text();
    return { ok: true, text, contentType: ct };
  } finally {
    clearTimeout(id);
  }
}

/** Fallback: readable proxy that returns page content as text */
async function fetchReadable(url) {
  // r.jina.ai/http://<full url w/o scheme>
  const passthrough = "https://r.jina.ai/" + url.replace(/^https?:\/\//i, "");
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(passthrough, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept": "text/plain,*/*;q=0.8",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`Reader fetch failed ${r.status}`);
    const txt = await r.text();
    // This comes back as plain text/markdown-ish. Return as text body directly.
    return { ok: true, text: txt, contentType: "text/plain" };
  } finally {
    clearTimeout(id);
  }
}

function scrapeOGfromHTML(html) {
  const $ = cheerio.load(html);
  const ogTitle =
    $('meta[property="og:title"]').attr("content") ||
    $("title").text() ||
    "";
  const ogDesc =
    $('meta[property="og:description"]').attr("content") ||
    $('meta[name="description"]').attr("content") ||
    "";
  // Try to grab the main body text
  const text =
    $("article, main, .recipe, .instructions").text() ||
    $("body").text() ||
    "";
  return {
    ogTitle: ogTitle.trim(),
    ogDesc: ogDesc.trim(),
    text: text.replace(/\s+\n/g, "\n").trim(),
  };
}

router.post("/url", async (req, res) => {
  try {
    const { url } = req.body || {};
    const u = String(url || "");
    if (!/^https?:\/\//i.test(u)) {
      return res.status(400).json({ error: "invalid url" });
    }

    // 1) Try direct fetch
    try {
      const result = await fetchHTML(u);
      if (result.ok) {
        if ((result.contentType || "").includes("text/html")) {
          const scraped = scrapeOGfromHTML(result.text);
          // If we got very little, try fallback too
          if (scraped.text && scraped.text.length > 400) {
            return res.json({ ok: true, data: scraped });
          }
        }
      }
      // Fall through to fallback
      throw new Error("direct fetch insufficient");
    } catch {
      // 2) Fallback via reader proxy
      const result = await fetchReadable(u);
      if (!result.ok || !result.text?.trim()) {
        throw new Error("reader proxy failed");
      }
      // Return as plain text (let the LLM normalize it)
      return res.json({
        ok: true,
        data: {
          ogTitle: "",
          ogDesc: "",
          text: result.text.trim(),
        },
      });
    }
  } catch (e) {
    return res
      .status(504)
      .json({
        ok: false,
        error:
          "Timed out or the site blocked scraping. Copy–paste the recipe text, or try another link.",
      });
  }
});

export default router;
