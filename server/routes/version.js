import express from "express";
const router = express.Router();

const VERSION = {
  ok: true,
  service: "FoodBridge",
};

router.get("/", (_req,res) => res.json(VERSION));

export default router;
