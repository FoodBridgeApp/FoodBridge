const API_BASE = "https://foodbridge-server-rv0a.onrender.com";

const $ = (s)=>document.querySelector(s);
const statusEl = $("#status");
const resultEl = $("#result");
const form = $("#f");
const input = $("#q");

function setStatus(t, kind="hint"){
  statusEl.className = kind; statusEl.textContent = t;
}
function showResult(recipe){
  // Defensive defaults so we never crash on undefined
  const title = recipe?.title ?? "(No title)";
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe?.steps) ? recipe.steps : [];

  resultEl.innerHTML = `
    <h2>${title}</h2>
    <section><h3>Ingredients</h3>
      <ul>${ingredients.map(i=>`<li>${(i.qty??"")} ${(i.unit??"")} ${i.name??""}`.trim()+"</li>").join("") || "<li>(none)</li>"}</ul>
    </section>
    <section><h3>Steps</h3>
      <ol>${steps.map(s=>`<li>${s?.text??""}</li>`).join("") || "<li>(none)</li>"}</ol>
    </section>
  `;
  resultEl.hidden = false;
}

async function parse(q){
  const res = await fetch(`${API_BASE}/api/llm/parse`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ q })
  });

  // Bubble up server diagnostics in the UI
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  if(!res.ok){
    const msg = data?.error || text || `HTTP ${res.status}`;
    throw new Error(`Server error: ${msg}`);
  }
  // Normalize payload shape so UI never explodes
  const recipe = data?.recipe ?? {
    id: `empty-${Date.now()}`,
    title: data?.title || `Result for: ${q}`,
    ingredients: Array.isArray(data?.ingredients) ? data.ingredients : [],
    steps: Array.isArray(data?.steps) ? data.steps : [],
    sections: Array.isArray(data?.sections) ? data.sections : [],
    tags: Array.isArray(data?.tags) ? data.tags : []
  };
  return { ok: true, recipe };
}

form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const q = input.value.trim();
  if(!q){ setStatus("Type something to parse.", "hint"); return; }
  resultEl.hidden = true;
  setStatus("Parsing…", "loader");
  try{
    const out = await parse(q);
    setStatus("Done.", "ok");
    showResult(out.recipe);
  }catch(err){
    setStatus(err?.message || "Unknown error", "error");
    // Keep screen intact; do not crash
    resultEl.innerHTML = `<pre class="log">${(err?.stack||"").slice(0,4000)}</pre>`;
    resultEl.hidden = false;
  }
});
