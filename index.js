require("dotenv").config();import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

//
// BLOCK_KEY_DEBUG_PROD
if (process.env.NODE_ENV && process.env.NODE_ENV.toLowerCase() !== 'development') {
  const express = require("express");

function safeRequire(p) {
  try { return require(p); }
  catch (e) { console.warn("[require failed]", p, e.message); return null; }
}
  const block = express.Router();
  block.all('/api/email/key-debug', (_req, res) => res.status(404).json({ ok:false, error:'Not found' }));
  app.use(block);
}
// END BLOCK_KEY_DEBUG_PROD
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// keep track of import errors so we can show them
const routeErrors = {};

async function safeImport(relPath) {
  try {
    const absPath = path.join(__dirname, relPath);
    // Use file URL so Windows backslashes can't confuse the ESM resolver
    const fileHref = pathToFileURL(absPath).href;
    const mod = await import(fileHref);
    return mod.default || null;
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    console.warn(`[import] ${relPath}: ${msg}`);
    routeErrors[relPath] = { full: path.join(__dirname, relPath), error: msg };
    return null;
  }
}

// Load routers
const prices    = await safeImport("./server/routes/prices.js");
const emailPlan = await safeImport("./server/routes/emailPlan.js");
const version   = await safeImport("./server/routes/version.js");

// Mount if present
if (prices)    app.use("/api/prices",  prices);
if (emailPlan) app.use("/api/email",   emailPlan);
if (version)   app.use("/api/version", version);

// Debug: see what mounted + any errors
app.get("/__routes", (_req, res) => {
  res.json({
    mounted: {
      prices:    Boolean(prices),
      emailPlan: Boolean(emailPlan),
      version:   Boolean(version),
    },
    errors: routeErrors
  });
});

// Basic health
app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    env: {
      hasResendKey: Boolean(process.env.RESEND_API_KEY),
      from: process.env.RESEND_FROM || process.env.EMAIL_FROM || "FoodBridge <onboarding@resend.dev>",
    },
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`[server] Listening on port ${PORT}`));



