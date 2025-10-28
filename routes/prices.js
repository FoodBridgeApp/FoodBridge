// server/routes/prices.js
import express from "express";

const router = express.Router();

/**
 * Example route: POST /api/prices/optimize
 * Expects a JSON body with { items: [...] }
 * Returns some mock optimized prices (replace with real logic later)
 */
router.post("/optimize", async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "Missing items array" });
    }

    // Placeholder logic for optimization
    const optimized = items.map((item) => ({
      ...item,
      optimizedPrice: (item.price || 1) * 0.9, // example: 10% discount
    }));

    res.json({ ok: true, optimized });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ✅ ES module export: mountable function
export default (app) => {
  app.use("/api/prices", router);
};
