/* docs/fb.js — front-end app
   - Renders readable ingredient lines (no [object Object])
   - Per-item selection & add-to-cart
   - Optimize cart (merge/keep selected)
   - Works with /api/ingest/llm, /api/cart/(upsert|merge|export.json?userId=...), /api/cart/email
*/
console.log("[FB] boot");

const CFG = window.FB_CFG || {};
const API = CFG.apiBase || window.__FB_API_BASE__ || "https://foodbridge-server-rv0a.onrender.com";
const CURRENT_USER = "christian";

// ========= helpers =========
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
function el(tag, props = {}, ...kids) { const n = document.createElement(tag); Object.assign(n, props); kids.forEach(k=>n.append(k)); return n; }

function toItem(objOrStr){
  if (typeof objOrStr === "string") return { name: objOrStr, qty: 1, unit: "", type: "ingredient" };
  const o = objOrStr || {};
  const name = o.name || o.title || "";
  return {
    id: o.id ?? null,
    type: o.type || "ingredient",
    title: o.title || name || "Untitled",
    name: name || "Untitled",
    qty: (typeof o.qty === "number" && !Number.isNaN(o.qty)) ? o.qty : 1,
    unit: o.unit || "",
    notes: o.notes ?? null,
    sourceUrl: o.sourceUrl ?? null
  };
}
function fmtItem(i){
  const name = i?.name || i?.title || "Untitled";
  const qty  = (i?.qty || i?.qty === 0) ? String(i.qty) : "";
  const unit = i?.unit ? String(i.unit) : "";
  return `${name}${qty?` ${qty}`:""}${unit?` ${unit}`:""}`;
}
function showSpinner(show){ const s=$("#spinner"); if(!s) return; s.style.display = show ? "flex" : "none"; }
function toast(msg){ console.log("[FB]", msg); }

// ========= API wrappers =========
async function apiJSON(url, init){
  const r = await fetch(url, init);
  const j = await r.json().catch(()=>({ok:false,error:"bad_json"}));
  if (!r.ok || j.ok === false) {
    const code = j.error || r.statusText || "error";
    throw new Error(`${code}`);
  }
  return j;
}

async function ingestLLM(dish, diet){
  const j = await apiJSON(`${API}/api/ingest/llm`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ dish, diet })
  });
  return j.recipe || { title: dish || "Recipe", ingredients:[], steps:[] };
}

async function upsertCart(userId, items){
  const j = await apiJSON(`${API}/api/cart/upsert`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ userId, items })
  });
  return j.cart;
}

async function mergeSources(userId, arraysOfItems){
  const sources = arraysOfItems.map(items => ({ items }));
  const j = await apiJSON(`${API}/api/cart/merge`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ userId, sources })
  });
  return j.cart;
}

async function exportByUser(userId){
  const j = await apiJSON(`${API}/api/cart/export.json?userId=${encodeURIComponent(userId)}`);
  return j.cart;
}

async function emailCart(userId, toEmail){
  const j = await apiJSON(`${API}/api/cart/email`, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ userId, to: toEmail, subject: "Your FoodBridge Cart" })
  });
  return j;
}

// ========= AI Recipe UI =========
const $dish = $("#dish");
const $diet = $("#diet");
const $btnDish = $("#btnDish");
const $dishTitle = $("#dishTitle");
const $dishMeta = $("#dishMeta");
const $dishIngredients = $("#dishIngredients");
const $dishSteps = $("#dishSteps");
const $btnAddIngredients = $("#btnAddIngredients");

let currentRecipe = { title:"", ingredients:[], steps:[] };

function renderRecipe(rec){
  $dishIngredients.innerHTML = "";
  (rec.ingredients || []).forEach((raw, idx) => {
    const it = toItem(raw);
    const li = el("li", { className:"ai-item" });
    const cb = el("input", { type:"checkbox", checked:true });
    cb.dataset.idx = String(idx);
    const label = el("span", { className:"ml-2", textContent: fmtItem(it) });
    li.append(cb, label);
    $dishIngredients.append(li);
  });
  $dishSteps.innerHTML = "";
  (rec.steps || []).forEach(s => $dishSteps.append(el("li", { textContent: String(s) })));
  $dishTitle.textContent = rec.title || "Recipe";
  $dishMeta.textContent = ( $diet?.value ? `Diet: ${$diet.value}` : "" );
  $btnAddIngredients.disabled = (rec.ingredients || []).length === 0;
}

$btnDish?.addEventListener("click", async () => {
  try {
    showSpinner(true);
    const dish = ($dish?.value || "").trim();
    const diet = ($diet?.value || "").trim();
    const rec = await ingestLLM(dish, diet);
    currentRecipe = {
      title: rec.title || dish || "Recipe",
      ingredients: (rec.ingredients || []).map(toItem),
      steps: (rec.steps || [])
    };
    renderRecipe(currentRecipe);
  } catch (e) {
    alert("Generate failed");
    console.error(e);
  } finally {
    showSpinner(false);
  }
});

$btnAddIngredients?.addEventListener("click", async ()=>{
  const picks = $$("#dishIngredients input[type=checkbox]:checked").map(cb => {
    const idx = Number(cb.dataset.idx);
    return currentRecipe.ingredients[idx];
  }).filter(Boolean).map(toItem);
  if (!picks.length) return;
  await mergeSources(CURRENT_USER, [picks]);
  await refreshCart();
  toast("Added selected ingredients to cart.");
});

// ========= URL Import (safe demo wiring to avoid 404s) =========
// If you don’t have a real URL-ingest endpoint yet, we’ll just
// echo a small demo list so the UI stays functional.
const $txtUrl = $("#txt-url");
const $btnIngestUrl = $("#btn-ingest-url");
const $urlTitle = $("#urlTitle");
const $urlMeta = $("#urlMeta");
const $urlIngredients = $("#urlIngredients");
const $urlSteps = $("#urlSteps");
const $btnAddIngredientsUrl = $("#btnAddIngredientsUrl");

let urlRecipe = { title:"", ingredients:[], steps:[] };

$btnIngestUrl?.addEventListener("click", async ()=>{
  const u = ($txtUrl?.value || "").trim();
  showSpinner(true);
  try {
    // Demo fallback payload so the section works now:
    urlRecipe = {
      title: u ? `Imported from ${u}` : "Imported Recipe",
      ingredients: [toItem("tomato"), toItem("onion"), toItem({ name:"olive oil", qty:1, unit:"tbsp" })],
      steps: ["Open the link", "Extract ingredients", "Cook with love"]
    };
    $urlIngredients.innerHTML = "";
    urlRecipe.ingredients.forEach((it, idx) => {
      const li = el("li", { className:"ai-item" });
      const cb = el("input", { type:"checkbox", checked:true });
      cb.dataset.idx = String(idx);
      const label = el("span", { className:"ml-2", textContent: fmtItem(it) });
      li.append(cb, label);
      $urlIngredients.append(li);
    });
    $urlSteps.innerHTML = "";
    urlRecipe.steps.forEach(s => $urlSteps.append(el("li", { textContent: s })));
    $urlTitle.textContent = urlRecipe.title;
    $urlMeta.textContent = u ? u : "";
    $btnAddIngredientsUrl.disabled = urlRecipe.ingredients.length === 0;
  } finally {
    showSpinner(false);
  }
});

$btnAddIngredientsUrl?.addEventListener("click", async ()=>{
  const picks = $$("#urlIngredients input[type=checkbox]:checked").map(cb => {
    const idx = Number(cb.dataset.idx);
    return urlRecipe.ingredients[idx];
  }).filter(Boolean).map(toItem);
  if (!picks.length) return;
  await mergeSources(CURRENT_USER, [picks]);
  await refreshCart();
  toast("Added imported ingredients to cart.");
});

// ========= Suggestions (local demo) =========
const $q = $("#q");
const $btnSuggest = $("#btn-suggest");
const $suggestions = $("#suggestions");

$btnSuggest?.addEventListener("click", ()=>{
  const term = ($q?.value || "").trim().toLowerCase();
  const pool = ["tomato","onion","garlic","cilantro","lime","chicken","tortilla","butter","rice","beans"];
  const hits = pool.filter(x => !term || x.includes(term)).slice(0,6).map(toItem);
  $suggestions.innerHTML = "";
  hits.forEach((it)=> $suggestions.append(el("li", { textContent: fmtItem(it) })));
});

// ========= Cart UI =========
const $cartItems = $("#cart-items");
const $btnOptAll = $("#btn-opt-all");
const $total = $("#checkout-total");
const $savings = $("#savings");

function fakePrice(item){
  const base = (String(item.name || item.title || "").length % 3) + 1; // 1..3
  return base;
}

async function refreshCart(){
  try{
    const cart = await exportByUser(CURRENT_USER);
    $cartItems.innerHTML = "";
    let subtotal = 0;
    (cart.items || []).forEach((it, idx) => {
      const price = fakePrice(it); subtotal += price;
      const row = el("li", { className:"cart-line" },
        el("input", { type:"checkbox", checked:true, dataset:{ idx:String(idx) } }),
        el("span", { className:"ml-2", textContent: fmtItem(it) }),
        el("span", { className:"ml-2 op-60", textContent: ` $${price.toFixed(2)}` })
      );
      $cartItems.append(row);
    });
    $total.textContent = `$${subtotal.toFixed(2)}`.replace("$$","$");
    $savings.textContent = (cart.items?.length || 0) > 5 ? "Bundle savings applied (demo)" : "";
  } catch {
    $cartItems.innerHTML = "";
    $total.textContent = "0.00";
    $savings.textContent = "";
  }
}

$btnOptAll?.addEventListener("click", async ()=>{
  // keep only selected, and merge duplicates
  let cart; try { cart = await exportByUser(CURRENT_USER); } catch { cart = { items:[] }; }
  const selectedIdx = $$("#cart-items input[type=checkbox]:checked").map(cb=>Number(cb.dataset.idx));
  const picked = (cart.items || []).filter((_, i) => selectedIdx.includes(i)).map(toItem);
  if (!picked.length) return;
  await mergeSources(CURRENT_USER, [picked]);
  await refreshCart();
});

// ========= Header actions =========
$("#btn-print")?.addEventListener("click", ()=> window.print());

$("#btn-email")?.addEventListener("click", async ()=>{
  const to = prompt("Send plan to email:");
  if (!to) return;
  try {
    showSpinner(true);
    await emailCart(CURRENT_USER, to);
    alert("Email sent (if SMTP is configured on the server).");
  } catch (e) {
    alert("Email failed. Check server SMTP settings.");
  } finally {
    showSpinner(false);
  }
});

// ========= boot =========
(async function boot(){
  try {
    // Preload an example recipe so UI isn't empty
    const rec = await ingestLLM("tacos", "");
    currentRecipe = {
      title: rec.title || "Tacos",
      ingredients: (rec.ingredients || []).map(toItem),
      steps: (rec.steps || [])
    };
    renderRecipe(currentRecipe);
  } catch (e) {
    console.warn("Initial recipe load failed", e);
  }
  await refreshCart();
  console.log("[FB] ready", { API });
})();
