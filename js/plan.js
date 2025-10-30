/** docs/js/plan.js — Weekly planner wiring */
import { api } from "./api.js";

const $ = (s) => document.querySelector(s);
const els = {
  grid: $("[data-out=grid]"),
  raw: $("[data-out=raw]"),
  status: $("[data-out=status]"),
  cartId: $("[data-out=cartId]"),
  emailTo: $("[data-field=emailTo]"),

  btnLoadCatalog: $("[data-btn=loadCatalog]"),
  btnSavePlan: $("[data-btn=savePlan]"),
  btnLoadPlan: $("[data-btn=loadPlan]"),
  btnClearPlan: $("[data-btn=clearPlan]"),
  btnAddAllToCart: $("[data-btn=addAllToCart]"),
  btnExportPlan: $("[data-btn=exportPlan]"),
  btnEmailHealth: $("[data-btn=emailHealth]"),
  btnEmailSend: $("[data-btn=emailSend]"),
};

const USER_ID = "christian";
const LS_CART = "fb.cartId";
const LS_PLAN = "fb.mealplan.v1";
const DATA_URL = "./data/recipes.json";

const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MEALS = ["Breakfast","Lunch","Dinner"];

let CATALOG = []; // {id,title,book,sourceUrl,durationSec,tags}
let PLAN = {};    // { Mon: {Breakfast: recId|null, Lunch: recId|null, Dinner: recId|null}, ... }
let CART_ID = "";

function setRaw(x){ els.raw.textContent = (typeof x === "string" ? x : JSON.stringify(x, null, 2)); }
function setStatus(s=""){ els.status.textContent = s; }
const getCartId = () => window.localStorage.getItem(LS_CART) || "";
function setCartId(id){ CART_ID = id || ""; els.cartId.textContent = CART_ID || "(none)"; if(id) window.localStorage.setItem(LS_CART, id); }
function escapeHtml(s=""){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function emptyPlan(){
  const p = {};
  DAYS.forEach(d => { p[d] = { Breakfast:null, Lunch:null, Dinner:null }; });
  return p;
}

async function ensureCart() {
  const cur = getCartId();
  if (cur) {
    try {
      const r = await api.getCart(cur);
      if (r?.ok && r.cart) { setCartId(r.cart.cartId); return CART_ID; }
    } catch {}
  }
  const r = await api.upsertCart({ userId: USER_ID, items: [] });
  setRaw(r);
  setCartId(r.cart.cartId);
  return CART_ID;
}

function optionList() {
  const opts = ['<option value="">(none)</option>'];
  CATALOG.forEach(r => {
    const tag = r.tags && r.tags.length ? ` [${r.tags.join(", ")}]` : "";
    opts.push(`<option value="${escapeHtml(r.id)}">${escapeHtml(r.title)}${tag}</option>`);
  });
  return opts.join("");
}

function renderGrid(){
  const opts = optionList();
  els.grid.innerHTML = DAYS.map(day => {
    return `
      <tr>
        <td><strong>${day}</strong></td>
        ${MEALS.map(m => `
          <td>
            <div class="muted" style="margin-bottom:6px">${m}</div>
            <select data-day="${day}" data-meal="${m}">${opts}</select>
          </td>
        `).join("")}
      </tr>
    `;
  }).join("");

  // set current selections
  els.grid.querySelectorAll("select").forEach(sel => {
    const d = sel.getAttribute("data-day");
    const m = sel.getAttribute("data-meal");
    const val = PLAN?.[d]?.[m] || "";
    if (val) sel.value = val;
    sel.addEventListener("change", () => {
      PLAN[d][m] = sel.value || null;
      setStatus("Edited (not saved).");
    });
  });
}

async function loadCatalog(){
  setStatus("Loading recipes…");
  const res = await fetch(DATA_URL, { cache:"no-store" });
  const json = await res.json();
  CATALOG = Array.isArray(json) ? json : [];
  setStatus(`${CATALOG.length} recipes loaded.`);
  renderGrid();
}

function savePlan(){
  window.localStorage.setItem(LS_PLAN, JSON.stringify(PLAN));
  setStatus("Plan saved.");
}

function loadPlan(){
  try{
    const raw = window.localStorage.getItem(LS_PLAN);
    PLAN = raw ? JSON.parse(raw) : emptyPlan();
  } catch { PLAN = emptyPlan(); }
  setStatus("Plan loaded.");
  renderGrid();
}

function clearPlan(){
  PLAN = emptyPlan();
  setStatus("Plan cleared.");
  renderGrid();
}

async function addAllToCart(){
  const cartId = await ensureCart();
  // build items from PLAN
  const items = [];
  DAYS.forEach(d => {
    MEALS.forEach(m => {
      const recId = PLAN?.[d]?.[m];
      if (!recId) return;
      const rec = CATALOG.find(r => r.id === recId);
      if (!rec) return;
      items.push({
        type: "recipe",
        title: `${d} ${m}: ${rec.title}`,
        sourceUrl: rec.sourceUrl || null,
        durationSec: rec.durationSec ?? null
      });
    });
  });
  if (!items.length) { setStatus("Nothing to add."); return; }

  setStatus("Adding plan to cart…");
  try{
    const r = await api.appendItems(cartId, { userId: USER_ID, items });
    setRaw(r);
    setStatus("All plan items added to cart.");
  } catch(e){
    setRaw(e?.payload || String(e));
    setStatus("Add failed.");
  }
}

function exportPlan(){
  const out = { plan: PLAN, generatedAt: new Date().toISOString() };
  setRaw(out);
}

async function emailHealth(){
  const r = await api.emailHealth();
  setRaw(r);
}
async function emailSend(){
  const id = getCartId();
  if (!id) return setRaw("No cartId—add items first.");
  const to = (els.emailTo?.value || "").trim();
  if (!to) return setRaw("Enter recipient email.");
  const r = await api.sendCartEmail(id, { to });
  setRaw(r);
}

function bindUI(){
  els.btnLoadCatalog?.addEventListener("click", loadCatalog);
  els.btnSavePlan?.addEventListener("click", savePlan);
  els.btnLoadPlan?.addEventListener("click", loadPlan);
  els.btnClearPlan?.addEventListener("click", clearPlan);
  els.btnAddAllToCart?.addEventListener("click", addAllToCart);
  els.btnExportPlan?.addEventListener("click", exportPlan);
  els.btnEmailHealth?.addEventListener("click", emailHealth);
  els.btnEmailSend?.addEventListener("click", emailSend);
}

async function init(){
  PLAN = emptyPlan();
  bindUI();
  setCartId(getCartId());
  await loadCatalog();
  // If a saved plan exists, load it over the fresh grid
  const raw = window.localStorage.getItem(LS_PLAN);
  if (raw) { loadPlan(); }
}
init();