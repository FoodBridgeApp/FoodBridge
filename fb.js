// /docs/fb.js
console.log("[FB] boot");

// ---------------- API base ----------------
const API_BASE = (typeof window !== "undefined" && window.FB_API_BASE)
  ? window.FB_API_BASE.replace(/\/+$/, "")
  : (location.hostname === "localhost"
      ? "http://localhost:10000"
      : "https://foodbridge-server-rv0a.onrender.com");

const API = `${API_BASE}/api`;

// ---------------- helpers ----------------
const $ = (id) => document.getElementById(id);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");
const setHTML = (el, s="") => { if (el) el.innerHTML = s; };

// Spinner / loader (supports #spinner or #loader)
const _spinner = () => $("spinner") || $("loader");
function showSpinner(){ const s=_spinner(); if(!s) return; s.classList.remove?.("hidden"); s.style.display="block"; }
function hideSpinner(){ const s=_spinner(); if(!s) return; s.classList.add?.("hidden"); s.style.display="none"; }

// ---------------- cart (renders into #cart-items and total span) ----------------
let cart = JSON.parse(localStorage.getItem("fb_cart") || "[]");
function saveCart(){ localStorage.setItem("fb_cart", JSON.stringify(cart)); }
function updateTotal(v=0){ const el=$("checkout-total"); if (el) el.textContent = Number(v||0).toFixed(2); }
function renderCart(){
  const list = $("cart-items");
  if (!list) return;
  if (!cart.length){
    setHTML(list, `<li><em>Your cart is empty.</em></li>`);
    updateTotal(0);
    return;
  }
  setHTML(list, cart.map(i => `<li>${esc(i)}</li>`).join(""));
  updateTotal(0); // pricing not wired yet
}
function addItemsToCart(items){
  if (!Array.isArray(items)) return;
  cart.push(...items.filter(Boolean));
  saveCart();
  renderCart();
}
// legacy inline support, in case any old buttons call addToCart(name)
function addToCart(name){ if(!name) return; addItemsToCart([name]); }
function printPlan(){ window.print(); }
window.addToCart = addToCart;
window.printPlan  = printPlan;

// ---------------- generic JSON fetch ----------------
async function apiJSON(method, path, body){
  const url = `${API}${path}`;
  console.log(`[FB] ${method} ${url}`, body || "");
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; }
  catch(e){ console.warn("[FB] invalid JSON", text); throw new Error("Invalid JSON from server"); }
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

// ---------------- ingest API wrappers ----------------
async function ingestFreeText({ dish, diet }){  // expects { dish, diet }
  return apiJSON("POST", "/ingest/free-text", { dish, diet });
}
async function ingestUrl({ url }){
  return apiJSON("POST", "/ingest/url", { url });
}
async function ingestAudio(file){
  const url = `${API}/ingest/audio`;
  const fd = new FormData(); fd.append("audio", file);
  const res = await fetch(url, { method: "POST", body: fd });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || res.statusText);
  return j;
}
async function suggest(q){
  const qs = new URLSearchParams({ q: q || "" }).toString();
  return apiJSON("GET", `/suggest?${qs}`);
}

// keep your older helper around for compatibility
async function fbIngestText(text, diet){
  try{
    const j = await ingestFreeText({ dish: text, diet });
    console.log("[FB] ingest result", j);
    return j;
  }catch(e){
    console.error("[FB] ingest fail", e);
    return null;
  }
}
window.fbIngestText = fbIngestText;

// ---------------- UI helpers ----------------
function renderRecipe(prefix, recipe){
  if (!recipe) return;
  setHTML($(prefix + "Title"), esc(recipe.title || ""));
  setHTML($(prefix + "Meta"),  esc(recipe.meta  || ""));
  setHTML($(prefix + "Ingredients"), (recipe.ingredients||[]).map(i=>`<li>${esc(i)}</li>`).join(""));
  setHTML($(prefix + "Steps"),       (recipe.steps||[]).map(s=>`<li>${esc(s)}</li>`).join(""));
}

// ---------------- DOM Ready wiring ----------------
document.addEventListener("DOMContentLoaded", () => {
  // show API base if span exists
  const apiSpan = $("apiBase"); if (apiSpan) apiSpan.textContent = API_BASE;

  // cart
  renderCart();

  // health ping
  fetch(`${API}/health`)
    .then(r => r.json())
    .then(j => console.log("[FB] health", j))
    .catch(e => console.warn("[FB] health error", e));

  // ===== Print & Email buttons in header =====
  const btnPrint = $("btn-print");
  if (btnPrint) btnPrint.addEventListener("click", printPlan);

  const btnEmail = $("btn-email");
  if (btnEmail) {
    btnEmail.addEventListener("click", async () => {
      const to = prompt("Send plan to (email):");
      if (!to) return;
      const htmlBody = document.querySelector("main")?.innerHTML || "<p>(empty plan)</p>";
      showSpinner();
      try{
        const out = await apiJSON("POST", "/email/send", { to, subject: "Your FoodBridge Plan", html: htmlBody });
        console.log("[FB] email result", out);
        alert("✅ Email sent successfully!");
      }catch(e){
        console.error("[FB] email error", e);
        alert("❌ Email failed: " + e.message);
      }finally{
        hideSpinner();
      }
    });
  }

  // ===== AI Recipe (free text) =====
  const btnDish = $("btnDish");
  if (btnDish){
    btnDish.addEventListener("click", async () => {
      const dish = $("dish")?.value?.trim();
      const diet = $("diet")?.value || "";
      if (!dish) { alert("Type a dish name first."); return; }

      showSpinner();
      try{
        const out = await ingestFreeText({ dish, diet });
        console.log("[FB] free-text result", out);
        renderRecipe("dish", out?.recipe);
        $("btnAddIngredients")?.removeAttribute("disabled");
      }catch(e){
        console.error("[FB] free-text error", e);
        alert("Could not generate a recipe ("+e.message+").");
      }finally{
        hideSpinner();
      }
    });
  }

  // add AI ingredients to cart
  const btnAddIngredients = $("btnAddIngredients");
  if (btnAddIngredients){
    btnAddIngredients.addEventListener("click", () => {
      const items = $$("#dishIngredients li").map(li => li.textContent.trim()).filter(Boolean);
      addItemsToCart(items);
    });
  }

  // ===== Import from URL =====
  const btnUrl = $("btn-ingest-url");
  if (btnUrl){
    btnUrl.addEventListener("click", async () => {
      const url = $("txt-url")?.value?.trim();
      if (!url){ alert("Paste a recipe URL first."); return; }
      showSpinner();
      try{
        const out = await ingestUrl({ url });
        console.log("[FB] url result", out);
        renderRecipe("url", out?.recipe);
        $("btnAddIngredientsUrl")?.removeAttribute("disabled");
      }catch(e){
        console.error("[FB] url ingest error", e);
        alert("Could not import that URL ("+e.message+").");
      }finally{
        hideSpinner();
      }
    });
  }

  // add imported ingredients to cart
  const btnAddIngredientsUrl = $("btnAddIngredientsUrl");
  if (btnAddIngredientsUrl){
    btnAddIngredientsUrl.addEventListener("click", () => {
      const items = $$("#urlIngredients li").map(li => li.textContent.trim()).filter(Boolean);
      addItemsToCart(items);
    });
  }

  // ===== Audio (placeholder until backend supports multipart) =====
  const btnAudio = $("btn-ingest-audio");
  if (btnAudio){
    btnAudio.addEventListener("click", async () => {
      const f = $("file-audio")?.files?.[0];
      if (!f){ alert("Choose an audio file first."); return; }
      showSpinner();
      try{
        const out = await ingestAudio(f);
        console.log("[FB] audio result", out);
        renderRecipe("url", out?.recipe); // reuse the right-hand render
        $("btnAddIngredientsUrl")?.removeAttribute("disabled");
      }catch(e){
        console.error("[FB] audio error", e);
        alert("Audio ingest failed ("+e.message+").");
      }finally{
        hideSpinner();
      }
    });
  }

  // ===== Ingredient suggestions =====
  const btnSuggest = $("btn-suggest");
  if (btnSuggest){
    btnSuggest.addEventListener("click", async () => {
      const q = $("q")?.value?.trim();
      if (!q){ alert("Type an ingredient (e.g., tomato)."); return; }
      showSpinner();
      try{
        const out = await suggest(q);
        setHTML($("suggestions"), (out?.suggestions||[]).map(s=>`<li>${esc(s)}</li>`).join(""));
      }catch(e){
        console.error("[FB] suggest error", e);
        alert("No suggestions available ("+e.message+").");
      }finally{
        hideSpinner();
      }
    });
  }

  // ===== Optimize All (placeholder) =====
  const btnOpt = $("btn-opt-all");
  if (btnOpt){
    btnOpt.addEventListener("click", () => {
      alert("Optimization placeholder — pricing API not wired yet.");
    });
  }
});
