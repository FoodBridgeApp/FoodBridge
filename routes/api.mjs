import { Router } from 'express';

const api = Router();

// Simple health
api.get('/health', (req, res) => {
  res.json({ ok: true, status: 'healthy', ts: Date.now() });
});

// Ingest a URL (very basic scrape)
api.post('/ingest/url', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url) return res.status(400).json({ ok:false, error: 'url required' });
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ ok:false, error: 'failed to fetch source url', status: r.status });
    let html = await r.text();
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');

    const pickMeta = (name) => {
      const rx = /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
      let m, out = {};
      while ((m = rx.exec(html)) !== null) { out[m[1].toLowerCase()] = m[2]; }
      return out[name] || '';
    };

    const ogTitle = pickMeta('og:title') || pickMeta('twitter:title') || '';
    const ogDesc  = pickMeta('og:description') || pickMeta('description') || '';
    const text    = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

    res.json({ ok: true, data: { ogTitle, ogDesc, text } });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

// Ultra-minimal LLM-ish parse
api.post('/llm/parse', async (req, res) => {
  try {
    const raw = (req.body && req.body.text) ? String(req.body.text) : '';
    if (!raw) return res.status(400).json({ ok:false, error: 'text required' });
    const [titlePart, rest] = raw.split(/:\s*/);
    const title = (titlePart || 'Recipe').trim();
    const ingBlob = rest || raw;
    const ingredients = ingBlob.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
    const steps = [
      'Prepare ingredients.',
      'Follow standard method based on the recipe text.',
      'Adjust seasoning and serve.'
    ];
    res.json({ ok: true, data: { title, ingredients, steps }});
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e?.message || e) });
  }
});

export default api;