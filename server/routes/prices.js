// /server/routes/prices.js (ESM)
import express from "express";

const router = express.Router();

/**
 * POST /api/prices/optimize
 * body: { items: [{ name, price }, ...] }
 * returns: { ok, optimized: [...] }
 */
router.post("/optimize", async (req, res) => {
  try {
    const { items } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "Missing items array" });
    }
    // placeholder logic
    const optimized = items.map(i => ({
      ...i,
      optimizedPrice: Number(i.price || 1) * 0.9
    }));
    res.json({ ok: true, optimized });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default function mountPricesRoutes(app) {
  app.use("/api/prices", router);
}
