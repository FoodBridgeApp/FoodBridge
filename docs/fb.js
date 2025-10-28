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
function $(id){ return document.getElementById(id); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function setHTML(node, s=""){ if (node) node.innerHTML = s; }
function esc(s){
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

// Spinner / loader (supports #spinner or #loader)
function _spinner(){ return $("spinner") || $("loader"); }
function showSpinner(){ const s=_spinner(); if(!s) return; s.classList.remove?.("hidden"); s.style.display="block"; }
function hideSpinner(){ const s=_spinner(); if(!s) return; s.classList.add?.("hidden"); s.style.display="none"; }

// ---------------- cart ----------------
let cart = JSON.parse(localStorage.getItem("fb_cart") || "[]");
function saveCart(){ localStorage.setItem("fb_cart", JSON.stringify(cart)); }
function renderCart(){
  const el = $("cart"); if(!el) return;
  if(!cart.length){ el.innerHTML = "<em>Your cart is empty.</em>"; updateTotal(0); return; }
  el.innerHTML = cart.map(item => `<div>- ${esc(item)}</div>`).join("");
  updateTotal(0); // no pricing yet
}
function addToCart(name){ if(!name) return; cart.push(name); saveCart(); renderCart(); }
function addItemsToCart(items){ if(!Array.isArray(items)) return; cart.push(...items.filter(Boolean)); saveCart(); renderCart(); }
function upd
