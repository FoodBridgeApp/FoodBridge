// server.js
const express = require("express");
const bodyParser = require("body-parser");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(morgan("dev"));

// === DEBUG: show commit + mounted routes ===
const COMMIT =
  process.env.RENDER_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GIT_COMMIT ||
  "local";

app.get("/api/_debug/info", (_req, res) => {
  try {
    const stack = (app._router && app._router.stack) || [];
    const routes = [];
    for (const s of stack) {
      if (s.route?.path) {
        routes.push({
          path: s.route.path,
          methods: Object.keys(s.route.methods || {}),
        });
      } else if (s.name === "router" && s.handle?.stack) {
        for (const r of s.handle.stack) {
          if (r.route?.path) {
            routes.push({
              path: r.route.path,
              methods: Object.keys(r.route.methods || {}),
            });
          }
        }
      }
    }
    res.json({
      ok: true,
      commit: COMMIT,
      version: process.env.APP_VERSION || "unset",
      routes,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// === Example health endpoint ===
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// === Example email endpoint placeholder ===
// (replace with your actual implementation)
app.post("/api/email/send", (req, res) => {
  const { to, subject, html } = req.body;
  if (!to || !subject || !html) {
    return res.status(400).json({ ok: false, error: "Missing fields" });
  }
  // TODO: wire up Resend/SMTP/etc
  res.json({ ok: true, sent: { to, subject, html } });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
