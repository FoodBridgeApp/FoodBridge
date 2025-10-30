/** docs/js/app.js — main UI wiring for FoodBridge app */
import { api } from "./api.js";

const $ = (s) => document.querySelector(s);
const els = {
  outRaw: $("[data-out=raw]"),
  outCartId: $("[data-out=cartId]"),
  outItems: $("[data-out=items]"),

  // fields
  emailTo: $("[data-field=emailTo]"),
  recipeTitle: $("[data-field=recipeTitle]"),
  recipeUrl: $("[data-field=recipeUrl]"),
  recipeDur: $("[data-field=recipeDur]"),
  ingTitle: $("[data-field=ingTitle]"),

  // buttons
  btnHealth: $("[data-btn=health]"),
  btnLoadCart: $("[data-btn=loadCart]"),
  btnExport: $("[data-btn=export]"),
  btnClearCartId: $("[data-btn=clearCartId]"),
  btnEmailHealth: $("[data-btn=emailHealth]"),
  btnEmailSend: $("[data-btn=emailSend]"),
  btnAddRecipe: $("[data-btn=addRecipe]"),
  btnAddIngredient: $("[data-btn=addIngredient]"),
};

const USER_ID = "christian";
const LS_KEY = "fb.cartId";

function setRaw(x) {
  els.outRaw.textContent = typeof x === "string" ? x : JSON.stringify(x, null, 2);
}
function getCartId() {
  return window.localStorage.getItem(LS_KEY) || "";
}
function setCartId(id) {
  if (id) window.localStorage.setItem(LS_KEY, id);
  els.outCartId.textContent = id || "(none)";
}
function clearItemsTable() {
  els.outItems.innerHTML = `<tr><td colspan="5" class="muted">No items yet.</td></tr>`;
}
function renderItems(cart) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  if (!items.length) return clearItemsTable();
  const rows = items.map((it) => {
    const t = escapeHtml(it.type || "");
    const title = escapeHtml(it.title || "");
    const src = it.sourceUrl ? `<a href="${escapeHtml(it.sourceUrl)}" target="_blank" rel="noopener">link</a>` : "";
    const dur = it.durationSec != null ? String(it.durationSec) : "";
    const added = it.addedAt ? new Date(it.addedAt).toLocaleString() : "";
    return `<tr><td>${t}</td><td>${title}</td><td>${src}</td><td class="right">${dur}</td><td>${added}</td></tr>`;
  }).join("");
  els.outItems.innerHTML = rows;
}
function escapeHtml(s=""){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

async function ensureCart() {
  // If we have a cartId, try reading it; otherwise create via upsert with no items
  const id = getCartId();
  if (id) {
    try {
      const r = await api.getCart(id);
      if (r?.ok && r.cart) {
        setCartId(r.cart.cartId);
        renderItems(r.cart);
        return r.cart.cartId;
      }
    } catch {}
  }
  const r = await api.upsertCart({ userId: USER_ID, items: [] });
  setRaw(r);
  setCartId(r.cart.cartId);
  renderItems(r.cart);
  return r.cart.cartId;
}

async function addRecipe() {
  const title = (els.recipeTitle?.value || "").trim() || "Untitled";
  const sourceUrl = (els.recipeUrl?.value || "").trim() || null;
  const durRaw = (els.recipeDur?.value || "").trim();
  const durationSec = durRaw ? Number(durRaw) : null;

  const cartId = await ensureCart();
  const payload = { userId: USER_ID, items: [{ type: "recipe", title, sourceUrl, durationSec }] };
  const r = await api.appendItems(cartId, payload);
  setRaw(r);
  renderItems(r.cart);
}

async function addIngredient() {
  const title = (els.ingTitle?.value || "").trim();
  if (!title) return setRaw("Enter an ingredient title");
  const cartId = await ensureCart();
  const payload = { userId: USER_ID, items: [{ type: "ingredient", title }] };
  const r = await api.appendItems(cartId, payload);
  setRaw(r);
  renderItems(r.cart);
}

async function loadCart() {
  const id = await ensureCart();
  const r = await api.getCart(id);
  setRaw(r);
  renderItems(r.cart);
}

async function exportJson() {
  const id = await ensureCart();
  const r = await api.exportJson(id);
  setRaw(r);
}

async function emailHealth() {
  const r = await api.emailHealth();
  setRaw(r);
}

async function emailSend() {
  const id = getCartId();
  if (!id) return setRaw("No cartId—add an item first.");
  const to = (els.emailTo?.value || "").trim();
  if (!to) return setRaw("Enter recipient email.");
  const r = await api.sendCartEmail(id, { to });
  setRaw(r);
}

function clearCartId() {
  window.localStorage.removeItem(LS_KEY);
  setCartId("");
  clearItemsTable();
  setRaw("Cleared local cart id. Add an item to create a new one.");
}

function init() {
  setCartId(getCartId());
  els.btnHealth?.addEventListener("click", async () => setRaw(await api.health()));
  els.btnLoadCart?.addEventListener("click", loadCart);
  els.btnExport?.addEventListener("click", exportJson);
  els.btnClearCartId?.addEventListener("click", clearCartId);
  els.btnEmailHealth?.addEventListener("click", emailHealth);
  els.btnEmailSend?.addEventListener("click", emailSend);
  els.btnAddRecipe?.addEventListener("click", addRecipe);
  els.btnAddIngredient?.addEventListener("click", addIngredient);
}

init();
