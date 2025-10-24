import express from "express";
const router = express.Router();

const BASE = { milk:2.99, egg:3.49, chicken_breast_lb:3.99, onion:0.69, garlic:0.50, olive_oil_tbsp:0.20 };
const REGION_MULT = { LA:1.08, SF:1.18, PHX:0.96, NYC:1.22, OTHER:1.00 };

function regionFromIp(ip){
  if(!ip) return "OTHER";
  if(ip.startsWith("104.") || ip.startsWith("47.")) return "LA";
  return "OTHER";
}

function estimatePrice(name, qty=1){
  const n = String(name||"").toLowerCase();
  const key = n.includes("chicken") ? "chicken_breast_lb" :
              n.includes("onion")   ? "onion" :
              n.includes("garlic")  ? "garlic" :
              n.includes("milk")    ? "milk" :
              n.includes("olive")   ? "olive_oil_tbsp" : null;
  const base = key ? BASE[key] : 2.00;
  return Math.max(0.25, base * (qty||1));
}

router.post("/estimate", (req,res)=>{
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const ip = (req.headers["x-forwarded-for"]||"").toString().split(",")[0] || req.socket?.remoteAddress || "";
  const region = regionFromIp(ip);
  const mult = REGION_MULT[region] || 1;
  const priced = items.map(it=>{
    const p = estimatePrice(it.name, it.qty, it.unit);
    return { ...it, price: +(p*mult).toFixed(2) };
  });
  res.json({ ok:true, region, items: priced, subtotal: +priced.reduce((a,b)=>a+(b.price||0),0).toFixed(2) });
});

export default router;
