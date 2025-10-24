const API_BASE = "https://foodbridge-server-rv0a.onrender.com";

async function fbHealth() {
  try {
    const r = await fetch(`${API_BASE}/api/health`);
    return await r.json();
  } catch (e) {
    console.error("[FB] health error", e);
  }
}

async function fbIngestText(text) {
  try {
    const r = await fetch(`${API_BASE}/api/ingest/free-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    return await r.json();
  } catch (e) {
    console.error("[FB] ingest fail", e);
  }
}

// Example usage:
window.addEventListener("load", async () => {
  console.log("[FB] boot");
  console.log("Health:", await fbHealth());
  console.log("Ingest:", await fbIngestText("Title: Demo\nIngredients: 2 eggs\nSteps: Beat; Fry"));
});
