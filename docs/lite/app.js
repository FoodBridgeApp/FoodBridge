const API_BASE = "https://foodbridge-server-rv0a.onrender.com";
const qs = s => document.querySelector(s);
const el = {
  f: qs("#f"), q: qs("#q"), toast: qs("#toast"),
  result: qs("#result"), title: qs("#title"),
  ings: qs("#ings"), steps: qs("#steps"), go: qs("#go")
};

function showToast(msg, kind="error"){
  el.toast.textContent = msg || "Unknown error";
  el.toast.className = "toast " + kind;
  el.toast.hidden = false;
}
function hideToast(){ el.toast.hidden = true; }

function coerceRecipe(x){
  const r = x || {};
  return {
    id: String(r.id || "n/a"),
    title: String(r.title || ""),
    ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
    steps: Array.isArray(r.steps) ? r.steps : []
  };
}
function renderRecipe(rec){
  el.result.hidden = false;
  el.title.textContent = rec.title || "(no title)";
  el.ings.innerHTML = (rec.ingredients.length
    ? rec.ingredients.map(i =>
        `<li>${(i.qty??"")} ${(i.unit??"")} ${i.name??""}`.replace(/\s+/g," ").trim() + `</li>`
      ).join("")
    : "<li>No ingredients found.</li>");
  el.steps.innerHTML = (rec.steps.length
    ? rec.steps.map(s => `<li>${s.text??""}</li>`).join("")
    : "<li>No steps found.</li>");
}

async function parseRecipe(q){
  const body = { q: String(q||"").trim() };
  if (!body.q) { showToast("Type something first."); return; }

  hideToast(); el.result.hidden = true; el.go.disabled = true; el.go.textContent = "Parsing…";
  let resp, data;
  try {
    resp = await fetch(`${API_BASE}/api/llm/parse`, {
      method:"POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch(e){
    showToast("Network error. Is the server up?");
    el.go.disabled = false; el.go.textContent = "Go"; return;
  }
  try { data = await resp.json(); } catch { data = null; }

  if (!resp.ok || !data || (!data.ok && !data.recipe)) {
    // Display whatever error the server sent, but never crash
    const msg = (data && (data.error||data.message)) || `Server ${resp.status}`;
    showToast(msg);
    el.go.disabled = false; el.go.textContent = "Go"; return;
  }

  const safe = coerceRecipe(data.recipe);
  hideToast();
  renderRecipe(safe);
  el.go.disabled = false; el.go.textContent = "Go";
}

el.f.addEventListener("submit", (e)=>{ e.preventDefault(); parseRecipe(el.q.value); });
