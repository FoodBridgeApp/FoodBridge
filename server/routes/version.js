const express = require("express");
const router = express.Router();
const VERSION = { ok:true, service:"FoodBridge", commit:"7bc0143", builtAt:"2025-10-24T06:23:26" };
router.get("/", (_req,res)=>res.json(VERSION));
module.exports = router;
