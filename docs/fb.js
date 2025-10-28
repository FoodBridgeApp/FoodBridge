// /docs/fb.js
console.log("[FB] boot");

// Resolve API base (prefer /docs/config.js -> window.FB_API_BASE)
const API_BASE = (typeof window !== "undefined" && window.FB_API_BASE)
  ? window.FB_API_BASE.replace(/\/+$/, "")
  : (location.hostname === "localhost"
      ? "http://localhost:10000"
      : "https://foodbridge-server-rv0a.onrender.com");

// Always use /api/* on the server
const API = `${API_BASE}/api`;

// Helpers
function $(id){ return document.getElementById(id); }
function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll("\"","&quot;").replaceAll("'","&#039;");
}

// Spinner / loader (supports #spinner or #loader)
function showSpinner(){ const a=$("spinner")||$("loader"); if(a){ a.classList.remove?.("hidden"); a.style.display="block"; } }
function hideSpinner(){ const a=$("spinner")||$("loader"); if(a){ a.classList.add?.("hidden"); a.style.display="none"; } }

// Cart (matches your HTML with inline onclicks)
let cart = JSON.parse(localStorage.getItem("fb_cart") || "[]");
function saveCart(){ localStorage.setItem("fb_cart", JSON.stringify(cart)); }
function renderCart(){
  const el = $("cart"); if(!el) return;
  if(!cart.length){ el.innerHTML = "<em>Your cart is empty.</em>"; return; }
  el.innerHTML = cart.map(item => `<div>- ${escapeHtml(item)}</div>`).join("");
}
function addToCart(name){ cart.push(name); saveCart(); renderCart(); }
function printPlan(){ window.print(); }
window.addToCart = addToCart;
window.printPlan = printPlan;

// Wire UI after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  renderCart();

  // Show API base if page has <span id="apiBase">
  const apiSpan = document.querySelector("#apiBase");
  if (apiSpan) apiSpan.textContent = API_BASE;

  // Email form (Friday route: /api/email/send)
  const form = $("emailForm");
  const statusEl = $("emailStatus");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const to = $("emailTo")?.value?.trim();
      if (!to) return;

      showSpinner();
      if (statusEl) statusEl.textContent = "Sending…";

      try {
        const html = $("plan-container")?.innerHTML || "<p>(empty plan)</p>";
        const res = await fetch(`${API}/email/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, subject: "Your FoodBridge Plan", html })
        });
        const out = await res.json();
        if (out.ok) {
          if (statusEl) statusEl.textContent = "✅ Email sent successfully!";
        } else {
          if (statusEl) statusEl.textContent =
            "❌ Failed: " + (typeof out.error === "string" ? out.error : JSON.stringify(out));
          console.error("[FB] email error", out);
        }
      } catch (err) {
        if (statusEl) statusEl.textContent = "⚠️ Error: " + err.message;
        console.error("[FB] email fail", err);
      } finally {
        hideSpinner();
      }
    });
  }

  // Health ping (so you see traffic immediately in Network)
  fetch(`${API}/health`)
    .then(r => r.json())
    .then(j => console.log("[FB] health", j))
    .catch(e => console.warn("[FB] health error", e));
});

// Optional: expose helper for future AI ingestion
async function fbIngestText(text, diet){
  try{
    const r = await fetch(`${API}/ingest/free-text`, {
      method: "POST", headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ text, diet })
    });
    const j = await r.json();
    console.log("[FB] ingest result", j);
    return j;
  }catch(e){
    console.error("[FB] ingest fail", e);
    return null;
  }
}
window.fbIngestText = fbIngestText;