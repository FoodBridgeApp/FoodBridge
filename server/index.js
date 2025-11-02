// server/index.js — Express + static client + API routes
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import llm from "./routes/llm.js";
import ingest from "./routes/ingest.js";

// Resolve __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));

// CORS (same-origin in local; permissive for now)
app.use(cors({ origin: "*" }));

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// API routes
app.use("/api/llm", llm);
app.use("/api/ingest", ingest);

// Serve the built client (client/dist) if present
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Prefer 8080 unless overridden
const PORT = process.env.PORT && process.env.PORT !== "10000" ? process.env.PORT : 8080;
app.listen(PORT, () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
