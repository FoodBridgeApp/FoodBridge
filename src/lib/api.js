export const API_BASE = "https://foodbridge-server-rv0a.onrender.com";
export async function parseRecipe(q) {
  const resp = await fetch(${API_BASE}/api/llm/parse, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q })
  }).catch((e)=>{ throw new Error("Network error: " + (e?.message||e)); });
  if (!resp?.ok) {
    const text = await resp.text().catch(()=> "");
    throw new Error(\Parse failed (\): \\);
  }
  const data = await resp.json();
  if (!data?.ok || !data?.recipe) throw new Error("Invalid payload from server.");
  return data;
}
