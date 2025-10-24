const express = require("express");
const router = express.Router();
const VERSION = { ok:true, service:"FoodBridge", commit:"d769362", builtAt:"2025-10-24T06:26:46" };
router.get("/", (_req,res)=>res.json(VERSION));
module.exports = router;
