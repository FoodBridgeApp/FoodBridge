
// ===== FB minimal endpoints on 'app' (prefixed with /api) =====
app.post('/api/ingest/url', async (req, res) => {
  try {
    const url = (req.body && req.body.url) || '';
    if (!url) return res.status(400).json({ error: 'url required' });
    const r = await fetch(url, { redirect: 'follow' });
    if (!r.ok) return res.status(502).json({ error: 'failed to fetch source url', status: r.status });
    let html = await r.text();
    html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
    const pickMeta = (name) => {
      const rx = new RegExp($(new RegExp(`<meta[^>]+(?:property|name)=["']["'][^>]*content=["']([^"']+)["'][^>]*>`,  'i').Groups[1].Value), 'i');
      const m = rx.exec(html); return m ? m[1] : '';
    };
    const ogTitle = pickMeta('og:title') || pickMeta('twitter:title') || '';
    const ogDesc  = pickMeta('og:description') || pickMeta('description') || '';
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    res.json({ data: { ogTitle, ogDesc, text } });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.post('/api/llm/parse', async (req, res) => {
  try {
    const raw = (req.body && req.body.text) ? String(req.body.text) : '';
    if (!raw) return res.status(400).json({ error: 'text required' });
    const [titlePart, rest] = raw.split(/:\s*/);
    const title = titlePart?.trim() || 'Recipe';
    const ingBlob = rest || raw;
    const ingredients = ingBlob.split(/[;,\n]/).map(s => s.trim()).filter(Boolean);
    const steps = [
      'Prepare ingredients.',
      'Follow standard method based on the recipe text.',
      'Adjust seasoning and serve.'
    ];
    res.json({ data: { title, ingredients, steps }});
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});
// ===== end FB endpoints =====
