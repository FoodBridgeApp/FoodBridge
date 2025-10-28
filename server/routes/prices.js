// /server/routes/prices.js
import { Router } from "express";
const router = Router();

// Example endpoint
router.post("/optimize", async (req, res) => {
  try {
    res.json({ ok: true, items: req.body?.items ?? [], savings: 0 });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
});

export default function mountPricesRoutes(app) {
  app.use("/api/prices", router);
}
