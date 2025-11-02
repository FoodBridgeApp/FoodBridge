export async function ingestUrl(url: string) {
  const r = await fetch(`/api/ingest/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error("URL ingest failed");
  const j = await r.json();
  return j.data as { ogTitle: string; ogDesc: string; text: string };
}
