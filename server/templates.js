// server/templates.js (ESM)
// Very small HTML templating for emails

const baseStyles = `
  body { margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; color:#111; }
  .wrap { max-width:600px; margin:0 auto; padding:24px; }
  .card { border:1px solid #e6e6e6; border-radius:12px; padding:24px; }
  h1 { font-size:20px; margin:0 0 12px; }
  p { margin:0 0 12px; line-height:1.5; }
  .cta { display:inline-block; padding:12px 16px; text-decoration:none; border-radius:8px; background:#111; color:#fff; }
  .muted { color:#666; font-size:12px; }
`;

export function renderTemplate(name = "basic", vars = {}) {
  if (name === "basic") return basic(vars);
  // future: other templates e.g. "receipt", "digest"
  return basic(vars);
}

function basic({ title, intro, ctaText, ctaUrl, footer } = {}) {
  const _title = title || "FoodBridge Notice";
  const _intro = intro || "Hello! This is a message from the FoodBridge platform.";
  const _ctaText = ctaText || "Open FoodBridge";
  const _ctaUrl = ctaUrl || "https://foodbridgeapp.github.io/FoodBridge";
  const _footer = footer || "You’re receiving this because you interacted with FoodBridge.";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(_title)}</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${escapeHtml(_title)}</h1>
      <p>${escapeHtml(_intro)}</p>
      <p style="margin:18px 0;">
        <a class="cta" href="${escapeAttr(_ctaUrl)}" target="_blank" rel="noopener"> ${escapeHtml(_ctaText)} </a>
      </p>
      <p class="muted">${escapeHtml(_footer)}</p>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
