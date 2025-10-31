// server/routes/ingest-llm.js
import express from "express";
import { llmExtractItems } from "../llm.js";

// Choose the same cart backend your server/index.js uses
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
 * Body: { userId?: string, cartId?: string, text: string, sourceUrl?: string, tags?: string[] }
 * Returns: { ok, reqId, userId, cartId|null, tags, counts, items, cart|null, receivedAt, meta }
 */
router.post("/llm", async (req, res) => {
  const reqId = req.id;
  try {
    const body = req.body || {};
    const userId = String(body.userId || "guest");
    const cartId = body.cartId ? String(body.cartId) : null;
    const tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
    const text = (body.text || "").trim();
    const sourceUrl = body.sourceUrl ? String(body.sourceUrl) : null;

    if (!text) {
      return res.status(400).json({ ok: false, error: "missing_text", reqId });
    }

    // Run LLM extraction (uses your current server/llm.js)
    const { ok, items, meta } = await llmExtractItems({ text, sourceUrl });
    if (!ok) {
      return res.status(502).json({ ok: false, error: "llm_failed", reqId });
    }

    // Normalize for cart shape
    const normalized = normalizeItems(items);

    // Counters for UI/debug
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
        meta,
        receivedAt: Date.now(),
      });
    }

    // No cartId provided: just return parsed items
    return res.json({
      ok: true,
      reqId,
      userId,
      cartId: null,
      tags,
      counts,
      items: normalized,
      cart: null,
      meta,
      receivedAt: Date.now(),
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (msg.includes("OPENAI_API_KEY")) {
      return res.status(500).json({ ok: false, error: "missing_openai_api_key", reqId });
    }
    if (err?.status) {
      // bubble up OpenAI HTTP errors as 502
      return res.status(502).json({ ok: false, error: "llm_http_error", detail: msg, reqId });
    }
    console.error("llm_ingest_error", err);
    return res.status(500).json({ ok: false, error: "internal_error", reqId });
  }
});

export default router;
