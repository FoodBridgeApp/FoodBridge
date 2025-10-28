// /server/routes/version.js
import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "FoodBridge API",
    version: process.env.APP_VERSION || "2025-10-28"
  });
});

export default function mountVersionRoutes(app) {
  app.use("/api/version", router);
}
