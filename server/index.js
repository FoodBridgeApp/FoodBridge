// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

// ---- App ----
const app = express();

// CORS: allow GitHub Pages (or env override)
const allowOrigin =
  process.env.FRONTEND_ORIGIN ||
  process.env.CORS_ORIGIN ||
  'https://foodbridgeapp.github.io';
app.use(cors({ origin: allowOrigin }));
app.use(express.json());

// --- Health ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'FoodBridge API', ts: new Date().toISOString() });
});

// --- Routes ---
import emailPlanRoutes from './routes/emailPlan.js';
emailPlanRoutes(app);

// --- 404 for unknown /api paths ---
app.use('/api', (_req, res) => {
  res.status(404).json({ ok: false, error: 'API route not found' });
});

// --- Listen ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`FoodBridge server listening on port ${PORT}`);
});
