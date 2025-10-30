// server/routes/ingest-llm.js
import express from "express";
import { llmExtractItems } from "../llm.js";
import { upsertCart, appendItemsToCart } from "../cart.js";

const router = express.Router();

router.post("/llm", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const { userId, text, sourceUrl, cartId } = req.body || {};
    if (!userId) return res.status(400).json({ ok:false, error:"userId required" });
    if (!text)   return res.status(400).json({ ok:false, error:"text required" });

    const llm = await llmExtractItems({ text, sourceUrl });

    if (!llm.items?.length) {
      return res.json({ ok:true, items:[], cart:null, meta:llm.meta });
    }

    let cart;
    if (cartId) {
      cart = await appendItemsToCart(cartId, userId, llm.items);
    } else {
      cart = await upsertCart({ userId, items: llm.items });
    }

    return res.json({ ok:true, items: llm.items, cart, meta: llm.meta });
  } catch (err) {
    const code = err?.status || 500;
    res.status(code).json({ ok:false, error: err?.message || "ingest failed", detail: err?.payload || null });
  }
});

export default router;
