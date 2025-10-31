// docs/config.js  (authoritative frontend config)

// === API base for all frontend calls ===
// Your live Render service:
window.__FB_API_BASE__ = "https://foodbridge-server-rv0a.onrender.com";

// If you later fork environments, you can flip this quickly:
// window.__FB_API_BASE__ = "https://foodbridge-server-staging.onrender.com";

// === Optional flags ===
window.__FB_REQUIRE_AUTH__ = false; // set true only if your server’s FB_REQUIRE_AUTH is true

// === Cache bust helper for GitHub Pages ===
window.__FB_BUILD_TAG__ = (new Date()).toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
