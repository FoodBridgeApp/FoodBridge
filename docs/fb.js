console.log("[FB] boot");

// API base
const API_BASE = (typeof window !== "undefined" && window.FB_API_BASE)
  ? window.FB_API_BASE.replace(/\/+$/, "")
  : (location.hostname === "localhost" ? "http://localhost:10000" : "https://foodbridge-server-rv0a.onrender.com");
const API = `${API_BASE}/api`;

// helpers
const $ = (id) => document.getElementById(id);
const setHTML = (el, s="") => { if (el) el.innerHTML = s; };

// spinner
const _spinner = () => $("spinner") || $("loader");
function showSpinner(){ const s=_spinner(); if(!s) return; s.style.display="flex"; }
function hideSpinner(){ const s=_spinner(); if(!s) return; s.style.display="none"; }

// cart
let cart = JSON.parse(localStorage.getItem("fb_cart") || "[]");
function saveCart(){ localStorage.setItem("fb_cart", JSON.stringify(cart)); }
function renderCart(){
  const ul = $("cart-items");
  const total = $("checkout-total");
  if (!ul) return;
  if (!cart.length) {
    setHTML(ul, "<li style='color:#9aa4b2'>Your cart is empty.</li>");
    if (total) total.textContent = "0.00";
    return;
  }
  setHTML(ul, cart.map(i => `<li>${i}</li>`).join(""));
  if (total) total.textContent = "0.00";
}

document.addEventListener("DOMContentLoaded", () => {
  // show API base in header
  const apiSpan = document.querySelector("#apiBase");
  if (apiSpan) apiSpan.textContent = API_BASE;

  renderCart();

  // wire trivial buttons so the UI is interactive
  const btnPrint = $("btn-print");
  if (btnPrint) btnPrint.onclick = () => window.print();

  const btnEmail = $("btn-email");
  if (btnEmail) btnEmail.onclick = () => alert("Email wiring will be enabled next step.");

  // health ping so you can see something in Network
  fetch(`${API}/health`)
    .then(r => r.json())
    .then(j => console.log("[FB] health", j))
    .catch(e => console.warn("[FB] health error", e));
});
