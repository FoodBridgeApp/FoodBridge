/** docs/js/library.js — browse/search books and add recipes to cart */
import { api } from "./api.js";

const $ = (s) => document.querySelector(s);
const els = {
  q: $("[data-field=q]"),
  book: $("[data-field=book]"),
  maxMin: $("[data-field=maxMin]"),
  btnRefresh: $("[data-btn=refresh]"),
  btnLoadCart: $("[data-btn=loadCart]"),
  grid: $("[data-out=grid]"),
  raw: $("[data-out=raw]"),
  cartId: $("[data-out=cartId]"),
  status: $("[data-out=status]")
};

const USER_ID = "christian";
const LS_KEY = "fb.cartId";
const DATA_URL = "./data/recipes.json";

let CATALOG = [];
let CART_ID = "";

/* utils */
const setRaw = (x) => els.raw.textContent = (typeof x === "string" ? x : JSON.stringify(x, null, 2));
const setStatus = (s) => els.status.textContent = s || "";
const getCartId = () => window.localStorage.getItem(LS_KEY) || "";
const setCartId = (id) => { CART_ID = id || ""; els.cartId.textContent = CART_ID || "(none)"; if (id) window.localStorage.setItem(LS_KEY, id); };
const escapeHtml = (s="") => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");

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

function minutesToSecField(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 60);
}

/* renderers */
function populateBookFilter() {
  const books = [...new Set(CATALOG.map(r => r.book).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  els.book.innerHTML = `<option value="">(all)</option>` + books.map(b => `<option>${escapeHtml(b)}</option>`).join("");
}

function renderGrid(list) {
  if (!list.length) {
    els.grid.innerHTML = `<div class="muted">No recipes matched.</div>`;
    return;
  }
  els.grid.innerHTML = list.map(rec => {
    const durMin = rec.durationSec != null ? Math.round(rec.durationSec/60) : "";
    const tags = Array.isArray(rec.tags) ? rec.tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join(" ") : "";
    const link = rec.sourceUrl ? `<a href="${escapeHtml(rec.sourceUrl)}" target="_blank" rel="noopener">open</a>` : "";
    return `
      <div class="item">
        <div class="head">
          <div><strong>${escapeHtml(rec.title)}</strong><div class="muted">${escapeHtml(rec.book || "")}</div></div>
          <div class="right">${durMin ? `${durMin} min` : ""}</div>
        </div>
        <div class="chips">${tags}</div>
        <div class="toolbar">
          ${link}
          <button class="btn" data-act="add" data-id="${escapeHtml(rec.id)}">Add to Cart</button>
        </div>
      </div>
    `;
  }).join("");

  // bind add buttons
  els.grid.querySelectorAll("[data-act=add]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const rec = CATALOG.find(r => r.id === id);
      if (!rec) return;
      const cartId = await ensureCart();
      const payload = { userId: USER_ID, items: [{ type:"recipe", title: rec.title, sourceUrl: rec.sourceUrl || null, durationSec: rec.durationSec ?? null }] };
      setStatus("Adding…");
      try {
        const r = await api.appendItems(cartId, payload);
        setRaw(r);
        setStatus("Added to cart.");
      } catch (e) {
        setStatus("Add failed.");
        setRaw(e?.payload || String(e));
      }
    });
  });
}

function applyFilters() {
  const q = (els.q?.value || "").toLowerCase().trim();
  const book = (els.book?.value || "").trim();
  const maxMin = minutesToSecField(els.maxMin?.value || "");

  let list = CATALOG.slice();
  if (book) list = list.filter(r => String(r.book || "").toLowerCase() === book.toLowerCase());
  if (q) {
    list = list.filter(r => {
      const hay = `${r.title} ${(r.book||"")} ${(r.tags||[]).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if (maxMin != null) list = list.filter(r => (r.durationSec == null) || (r.durationSec <= maxMin));

  renderGrid(list);
  setStatus(`${list.length} shown / ${CATALOG.length} total`);
}

/* bootstrap */
async function loadCatalog() {
  setStatus("Loading recipes…");
  const res = await fetch(DATA_URL, { cache:"no-store" });
  const json = await res.json();
  CATALOG = Array.isArray(json) ? json : [];
  populateBookFilter();
  applyFilters();
  setStatus(`${CATALOG.length} recipes loaded.`);
}

function bindUI() {
  els.btnRefresh?.addEventListener("click", applyFilters);
  els.q?.addEventListener("input", applyFilters);
  els.book?.addEventListener("change", applyFilters);
  els.maxMin?.addEventListener("input", applyFilters);
  els.btnLoadCart?.addEventListener("click", async () => {
    const id = await ensureCart();
    setRaw(await api.getCart(id));
  });

  // init cart id display
  setCartId(getCartId());
}

async function init() {
  bindUI();
  await loadCatalog();
}
init();