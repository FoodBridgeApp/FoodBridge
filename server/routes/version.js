// /server/routes/version.js (ESM)
import express from "express";

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({
    ok: true,
    name: "FoodBridge API",
    version: process.env.APP_VERSION || "dev",
    node: process.version
  });
});

export default function mountVersionRoutes(app) {
  app.use("/api/version", router);
}
