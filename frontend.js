// frontend.js

// Detect API base (localhost during dev, Render in production)
const API_BASE = location.hostname === "localhost"
  ? "http://localhost:10000/api"
  : "https://foodbridge-server-rv0a.onrender.com/api";

// ---- Simple cart state ----
let cart = JSON.parse(localStorage.getItem("fb_cart") || "[]");

function saveCart() {
  localStorage.setItem("fb_cart", JSON.stringify(cart));
}

function renderCart() {
  const el = document.getElementById("cart");
  if (!el) return;
  if (!cart.length) {
    el.innerHTML = "<em>Your cart is empty.</em>";
    return;
  }
  el.innerHTML = cart.map((item) => `<div>- ${escapeHtml(item)}</div>`).join("");
}

function addToCart(name) {
  cart.push(name);
  saveCart();
  renderCart();
}

function printPlan() {
  window.print();
}

// ---- Loader helpers ----
function showLoader() {
  const el = document.getElementById("loader");
  if (el) el.style.display = "block";
}
function hideLoader() {
  const el = document.getElementById("loader");
  if (el) el.style.display = "none";
}

// ---- Email plan via backend ----
async function sendPlanEmail(toEmail) {
  const planHtml =
    document.getElementById("plan-container")?.innerHTML || "<p>(empty plan)</p>";

  const res = await fetch(`${API_BASE}/email/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: toEmail,
      subject: "Your FoodBridge Plan",
      html: planHtml
    })
  });

  return res.json();
}

// ---- Escape HTML (safety) ----
function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ---- Wire up on load ----
document.addEventListener("DOMContentLoaded", () => {
  // Initial render
  renderCart();

  // Expose functions used by inline onclick handlers in HTML
  window.addToCart = addToCart;
  window.printPlan = printPlan;

  // Email form submit
  const form = document.getElementById("emailForm");
  const statusEl = document.getElementById("emailStatus");
  if (form && statusEl) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailTo = document.getElementById("emailTo")?.value?.trim();
      if (!emailTo) return;

      showLoader();
      statusEl.textContent = "Sending…";

      try {
        const out = await sendPlanEmail(emailTo);
        if (out.ok) {
          statusEl.textContent = "✅ Email sent successfully!";
        } else {
          statusEl.textContent =
            "❌ Failed: " +
            (typeof out.error === "string" ? out.error : JSON.stringify(out));
        }
      } catch (err) {
        statusEl.textContent = "⚠️ Error: " + err.message;
      } finally {
        hideLoader();
      }
    });
  }

  // Optional: health check in console
  fetch(`${API_BASE}/health`)
    .then((r) => r.json())
    .then((j) => console.log("[FB] health", j))
    .catch((e) => console.warn("[FB] health error", e));
});
