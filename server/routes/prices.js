// /server/routes/prices.js
import { Router } from "express";

const router = Router();

// Example: POST /api/prices/optimize
router.post("/optimize", async (req, res) => {
  try {
    // placeholder logic
    res.json({ ok: true, savings: 0, items: req.body?.items ?? [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err.message) });
  }
});

export default function mountPricesRoutes(app) {
  app.use("/api/prices", router);
}
