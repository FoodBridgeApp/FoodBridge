// fb.js
console.log("[FB] boot");

// Detect API base
const apiBase = window.location.hostname.includes("localhost")
  ? "http://localhost:10000/api"
  : "https://foodbridge-server-rv0a.onrender.com/api";

document.addEventListener("DOMContentLoaded", () => {
  const apiSpan = document.getElementById("apiBase");
  if (apiSpan) apiSpan.innerText = apiBase;
});

// Simple spinner toggle
function showSpinner(show) {
  document.getElementById("spinner").classList.toggle("hidden", !show);
}

// --- Free-text recipe generation ---
document.getElementById("btnDish")?.addEventListener("click", async () => {
  const dish = document.getElementById("dish").value.trim();
  const diet = document.getElementById("diet").value;

  if (!dish) return alert("Please enter a dish name");

  showSpinner(true);

  try {
    const res = await fetch(`${apiBase}/ingest/free-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: dish, diet })
    });

    const data = await res.json();
    console.log("[FB] ingest result", data);

    document.getElementById("dishTitle").innerText = data.title || "";
    document.getElementById("dishMeta").innerText = data.meta || "";

    const ingList = document.getElementById("dishIngredients");
    ingList.innerHTML = "";
    (data.ingredients || []).forEach(i => {
      const li = document.createElement("li");
      li.textContent = i;
      ingList.appendChild(li);
    });

    const stepsList = document.getElementById("dishSteps");
    stepsList.innerHTML = "";
    (data.steps || []).forEach(s => {
      const li = document.createElement("li");
      li.textContent = s;
      stepsList.appendChild(li);
    });
  } catch (err) {
    console.error("[FB] ingest fail", err);
    alert("Recipe generation failed");
  } finally {
    showSpinner(false);
  }
});

// --- Health check on load ---
async function fbHealth() {
  try {
    const res = await fetch(`${apiBase}/health`);
    const data = await res.json();
    console.log("Health:", data);
  } catch (err) {
    console.error("[FB] health error", err);
  }
}
fbHealth();
