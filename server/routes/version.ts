import express from "express";
const router = express.Router();
const VERSION = {
  ok: true,
  service: "FoodBridge",
  commit: "9e14bbf",
  builtAt: "2025-10-24T06:20:22"
};
router.get("/", (_req, res) => res.json(VERSION));
export default router;
