// server/templates.js (ESM, full file)

function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseLayout({ title = "FoodBridge", body = "" }) {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width" />
  <style>
    body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#111; }
    .wrap { max-width: 640px; margin: 24px auto; padding: 16px; border:1px solid #eee; border-radius: 8px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { margin: 8px 0; }
    .btn {
      display:inline-block; padding:10px 14px; border-radius:8px; text-decoration:none;
      background:#111; color:#fff; font-weight:600;
    }
    table { border-collapse: collapse; width:100%; margin-top: 12px; }
    th, td { border:1px solid #eee; padding:8px; text-align:left; font-size: 14px; }
    th { background:#fafafa; }
    .muted { color:#666; font-size:12px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    ${body}
  </div>
</body>
</html>`;
}

function templateBasic({ title = "FoodBridge", intro = "", ctaText, ctaUrl, footer = "" } = {}) {
  const body = `
    <h1>${escapeHtml(title)}</h1>
    ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
    ${ctaText && ctaUrl ? `<p><a class="btn" href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaText)}</a></p>` : ""}
    ${footer ? `<p class="muted">${escapeHtml(footer)}</p>` : ""}
  `;
  return baseLayout({ title, body });
}

function templateCartSummary({ title = "Your Cart", intro = "", cart, ctaText, ctaUrl, footer = "" } = {}) {
  const items = Array.isArray(cart?.items) ? cart.items : [];
  const rows = items
    .map((it) => {
      const t = escapeHtml(it.type || "");
      const title = escapeHtml(it.title || "");
      const src = it.sourceUrl ? `<a href="${escapeHtml(it.sourceUrl)}">link</a>` : "";
      const dur = it.durationSec != null ? `${Number(it.durationSec)}s` : "";
      const added = it.addedAt ? new Date(it.addedAt).toISOString() : "";
      return `<tr><td>${t}</td><td>${title}</td><td>${src}</td><td>${dur}</td><td>${added}</td></tr>`;
    })
    .join("");

  const body = `
    <h1>${escapeHtml(title)}</h1>
    ${intro ? `<p>${escapeHtml(intro)}</p>` : ""}
    <p><strong>Cart ID:</strong> ${escapeHtml(cart?.cartId || "")}</p>
    <table>
      <thead><tr><th>Type</th><th>Title</th><th>Source</th><th>Duration</th><th>Added</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="5">No items yet.</td></tr>`}</tbody>
    </table>
    ${ctaText && ctaUrl ? `<p><a class="btn" href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaText)}</a></p>` : ""}
    ${footer ? `<p class="muted">${escapeHtml(footer)}</p>` : ""}
  `;
  return baseLayout({ title: "FoodBridge — Cart", body });
}

export function renderTemplate(name = "basic", vars = {}) {
  switch (String(name)) {
    case "cartSummary":
      return templateCartSummary(vars);
    case "basic":
    default:
      return templateBasic(vars);
  }
}
