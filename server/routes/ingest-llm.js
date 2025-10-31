// server/routes/ingest-llm.js
import express from "express";
import { extractItems } from "../llm.js";

const USE_REDIS = String(process.env.CART_BACKEND || "").toLowerCase() === "redis";

let getCart, upsertCart, appendItemsToCart, deleteCart, normalizeItems;
if (USE_REDIS) {
  const m = await import("../cart-redis.js");
  getCart = m.getCart;
  upsertCart = m.upsertCart;
  appendItemsToCart = m.appendItemsToCart;
  deleteCart = m.deleteCart;
  normalizeItems = m.normalizeItems;
  console.log("[ingest-llm] Using Redis cart backend");
} else {
  const m = await import("../cart.js");
  getCart = m.getCart;
  upsertCart = m.upsertCart;
  appendItemsToCart = m.appendItemsToCart;
  deleteCart = m.deleteCart;
  normalizeItems = m.normalizeItems;
  console.log("[ingest-llm] Using in-memory cart backend");
}

const router = express.Router();

/**
 * POST /api/ingest/llm
 * Body: { userId?: string, cartId?: string, tags?: string[], text: string }
 * Returns: { ok, reqId, userId, cartId|null, tags, counts, items, cart|null, receivedAt }
 */
router.post("/llm", async (req, res) => {
  const reqId = req.id;
  try {
    const body = req.body || {};
    const userId = String(body.userId || "guest");
    const cartId = body.cartId ? String(body.cartId) : null;
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    const text = (body.text || "").trim();

    if (!text) {
      return res.status(400).json({ ok: false, error: "missing_text", reqId });
    }

    const { items } = await extractItems(text);
    const normalized = normalizeItems(items);

    const counts = normalized.reduce(
      (acc, it) => {
        acc.total += 1;
        acc.byType[it.type] = (acc.byType[it.type] || 0) + 1;
        return acc;
      },
      { total: 0, byType: {} }
    );

    if (cartId) {
      const cart = await appendItemsToCart({ cartId, userId, items: normalized });
      return res.json({
        ok: true,
        reqId,
        userId,
        cartId,
        tags,
        counts,
        items: normalized,
        cart,
        receivedAt: Date.now(),
      });
    }

    // no cartId: just return parsed items
    return res.json({
      ok: true,
      reqId,
      userId,
      cartId: null,
      tags,
      counts,
      items: normalized,
      cart: null,
      receivedAt: Date.now(),
    });
  } catch (err) {
    console.error("llm_ingest_error", err);
    const msg = String(err?.message || err);
    if (msg === "OPENAI_API_KEY not set") {
      return res.status(500).json({ ok: false, error: "missing_openai_api_key", reqId });
    }
    if (msg === "llm_invalid_json") {
      return res.status(502).json({ ok: false, error: "llm_invalid_json", reqId });
    }
    return res.status(500).json({ ok: false, error: "internal_error", reqId });
  }
});

export default router;
