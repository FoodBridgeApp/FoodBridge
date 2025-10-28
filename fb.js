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
const $  = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#039;");
const setHTML = (el, s="") => { if (el) el.innerHTML = s; };

// spinner (supports #spinner or #loader)
const _spinner = () => $("spinner") || $("loader");
function showSpinner(){ const s=_spinner(); if(!s) return; s.style.display="flex"; }
function hideSpinner(){ const s=_spinner(); if(!s) return; s.style.display="none"; }

// ---------------- cart (renders into #cart-items and total span) ----------------
let cart = JSON.parse(localStorage.getItem("fb_cart") || "[]");
function saveCart(){ localStorage.setItem("fb_cart", JSON.stringify(cart)); }
function updateTotal(v=0){ const el=$("checkout-total"); if (el) el.textContent = Number(v||0).toFixed(2); }
function renderCart(){
  const list = $("cart-items");
  if (!list) return;
  if (!cart.length){
    setHTML(list, `<li style="color:#9aa4b2">Your cart is empty.</li>`);
    updateTotal(0);
    return;
  }
  setHTML(list, cart.map(i => `<li>${esc(i)}</li>`).join(""));
  updateTotal(0); // pricing later
}

// ---------------- email plan ----------------
async function emailPlan() {
  // ask for recipient (simple prompt to keep HTML clean)
  const to = prompt("Send plan to which email address?");
  if (!to) return;

  // take the whole <main> content as the “plan” for now
  const main = document.querySelector("main");
  const html = main ? main.innerHTML : "<p>(empty)</p>";

  showSpinner();
  try {
    const res = await fetch(`${API}/email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject: "Your FoodBridge Plan", html })
    });
    const out = await res.json().catch(() => ({}));
    if (out.ok) {
      alert("✅ Email sent!");
    } else {
      console.error("[FB] email error", out);
      alert("❌ Email failed: " + (out?.error || "unknown error"));
    }
  } catch (err) {
    console.error("[FB] email fail", err);
    alert("⚠️ Network error: " + err.message);
  } finally {
    hideSpinner();
  }
}

// ---------------- boot ----------------
document.addEventListener("DOMContentLoaded", () => {
  // show API base in header
  const apiSpan = document.querySelector("#apiBase");
  if (apiSpan) apiSpan.textContent = API_BASE;

  // wire header buttons
  const btnPrint = $("btn-print");
  if (btnPrint) btnPrint.onclick = () => window.print();

  const btnEmail = $("btn-email");
  if (btnEmail) btnEmail.onclick = emailPlan;

  // initial cart render
  renderCart();

  // Health ping so you see traffic in Network
  fetch(`${API}/health`)
    .then(r => r.json())
    .then(j => console.log("[FB] health", j))
    .catch(e => console.warn("[FB] health error", e));
});
