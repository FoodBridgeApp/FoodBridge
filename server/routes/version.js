import { Router } from "express";
const router = Router();

router.get("/", (_req, res) => {
  res.json({ ok: true, service: "FoodBridge" });
});

export default router;

module.exports = router;
