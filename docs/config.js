// docs/config.js  — authoritative frontend config for FoodBridge

// === API base for all frontend calls ===
// Always point to your live Render backend unless testing locally.
window.FB_CONFIG = {
  API_BASE: "https://foodbridge-server-rv0a.onrender.com",
  REQUIRE_AUTH: false,
  BUILD_TAG: new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)
};

// --- Legacy aliases (kept so older scripts don’t break) ---
window.__FB_API_BASE__ = window.FB_CONFIG.API_BASE;
window.__FB_REQUIRE_AUTH__ = window.FB_CONFIG.REQUIRE_AUTH;
window.__FB_BUILD_TAG__ = window.FB_CONFIG.BUILD_TAG;

// --- Optional staging shortcut ---
// To test another environment, uncomment and change the URL below:
// window.FB_CONFIG.API_BASE = "https://foodbridge-server-staging.onrender.com";
