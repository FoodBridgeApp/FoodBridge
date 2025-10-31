/** docs/js/ingest.js — paste text → /api/ingest/llm → (optional) cart append */
const API_BASE = window.__FB_API_BASE__ || "";
const $ = (s) => document.querySelector(s);
const els = {
  txt: $("[data-field=txt]"),
  src: $("[data-field=src]"),
  cartIdInput: $("[data-field=cartId]"),
  btnIngest: $("[data-btn=ingest]"),
  btnIngestToCart: $("[data-btn=ingestToCart]"),
  raw: $("[data-out=raw]"),
  status: $("[data-out=status]"),
  cartIdOut: $("[data-out=cartId]")
};

const USER_ID = "christian";
const LS_KEY = "fb.cartId";

function setStatus(s){ els.status.textContent = s || ""; }
function setRaw(x){ els.raw.textContent = typeof x==="string" ? x : JSON.stringify(x,null,2); }
function getSavedCartId(){ return window.localStorage.getItem(LS_KEY) || ""; }
function setSavedCartId(id){
  if (!id) return;
  window.localStorage.setItem(LS_KEY, id);
  els.cartIdOut.textContent = id;
}
function currentCartId(){
  const typed = (els.cartIdInput?.value || "").trim();
  if (typed) return typed;
  const saved = getSavedCartId();
  if (saved) return saved;
  return "";
}

async function ingest({ text, sourceUrl, cartId }) {
  const body = { userId: USER_ID, text, sourceUrl };
  if (cartId) body.cartId = cartId;

  const res = await fetch(`${API_BASE}/api/ingest/llm`, {
    method: "POST",
    headers: { "content-type":"application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(()=>({}));
  if (!res.ok) {
    const msg = json?.error || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.payload = json;
    throw err;
  }
  return json;
}

function bind() {
  els.cartIdOut.textContent = getSavedCartId() || "(none)";

  els.btnIngest?.addEventListener("click", async () => {
    const text = (els.txt?.value || "").trim();
    const src = (els.src?.value || "").trim() || null;
    if (!text) { setStatus("Paste some text first."); return; }
    setStatus("Ingesting…");
    try {
      const r = await ingest({ text, sourceUrl: src, cartId: "" }); // preview only
      setRaw(r);
      setStatus(`${r?.counts?.total ?? 0} item(s) extracted (preview).`);
    } catch (e) {
      setRaw(e?.payload || String(e));
      setStatus("Ingest failed.");
    }
  });

  els.btnIngestToCart?.addEventListener("click", async () => {
    const text = (els.txt?.value || "").trim();
    const src = (els.src?.value || "").trim() || null;
    if (!text) { setStatus("Paste some text first."); return; }
    const cid = currentCartId();
    setStatus(`Ingesting and appending…${cid ? " (cartId="+cid+")" : ""}`);
    try {
      const r = await ingest({ text, sourceUrl: src, cartId: cid || undefined });
      setRaw(r);
      // Persist cartId if we get one back
      if (r?.cart?.cartId) setSavedCartId(r.cart.cartId);
      setStatus(`${r?.counts?.total ?? 0} item(s) appended to cart.`);
    } catch (e) {
      setRaw(e?.payload || String(e));
      setStatus("Append failed.");
    }
  });
}

bind();
