import express from "express";
import { estimatePrice, regionFromIp, REGION_MULT } from "../services/priceEstimator";
const router = express.Router();

router.post("/estimate", (req, res) => {
  const items: { name:string; qty?:number; unit?:string }[] = req.body?.items || [];
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.socket.remoteAddress || "";
  const region = regionFromIp(String(ip));
  const mult = (REGION_MULT as any)[region] ?? 1;

  const priced = items.map(it => {
    const p = estimatePrice(it.name, it.qty || 1, it.unit || "");
    return { ...it, price: +(p * mult).toFixed(2) };
  });
  res.json({ ok:true, region, items: priced, subtotal: +priced.reduce((a,b)=>a+(b.price||0),0).toFixed(2) });
});

export default router;
