// server/cart.js (ESM)
import { randomUUID } from "node:crypto";
import { log } from "./logger.js";
import { makeRedisCartStore } from "./cart-redis.js";

// In-memory fallback
const memDB = new Map();

const memStore = {
  get backend() { return "memory"; },
  async getCart(cartId) { return memDB.get(String(cartId)) || null; },
  async upsertCart({ cartId, userId, items = [] }) {
    const id = cartId ? String(cartId) : `${String(userId)}-${shortId()}`;
    const base = memDB.get(id) || { cartId: id, userId: String(userId), items: [] };
    const merged = {
      ...base,
      userId: String(userId || base.userId),
      items: Array.isArray(items) && items.length > 0 ? items : base.items,
    };
    memDB.set(id, merged);
    return merged;
  },
  async appendItemsToCart({ cartId, userId, items = [] }) {
    const id = String(cartId);
    const base = memDB.get(id) || { cartId: id, userId: String(userId), items: [] };
    const merged = {
      ...base,
      userId: String(userId || base.userId),
      items: [...(base.items || []), ...(items || [])],
    };
    memDB.set(id, merged);
    return merged;
  },
  async deleteCart(cartId) { return memDB.delete(String(cartId)); },
  async ping() { return true; },
};

function shortId() {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

export function normalizeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  const now = Date.now();
  return arr.map((raw, idx) => {
    const it = raw || {};
    return {
      id: it.id || `${now}-${Math.random().toString(36).slice(2, 12)}-${idx}`,
      type: String(it.type || "unknown"),
      title: String(it.title || "Untitled"),
      sourceUrl: it.sourceUrl ?? null,
      durationSec: it.durationSec == null ? null : Number(it.durationSec),
      addedAt: it.addedAt || new Date().toISOString(),
    };
  });
}

// choose backend safely
let STORE = memStore;
(function initStore() {
  const wantRedis = String(process.env.FB_USE_REDIS || "").toLowerCase().trim() === "true";
  const hasUrl = !!process.env.REDIS_URL;

  if (wantRedis && hasUrl) {
    try {
      const r = makeRedisCartStore();
      STORE = r;
      log("cart_store_backend", { backend: r.backend });
    } catch (err) {
      log("cart_store_fallback_memory", { reason: String(err?.message || err) });
      STORE = memStore;
    }
  } else {
    STORE = memStore;
    log("cart_store_backend", { backend: "memory" });
  }
})();

export const backend = () => STORE.backend;
export const getCart = (...a) => STORE.getCart(...a);
export const upsertCart = (...a) => STORE.upsertCart(...a);
export const appendItemsToCart = (...a) => STORE.appendItemsToCart(...a);
export const deleteCart = (...a) => STORE.deleteCart(...a);
export const ping = (...a) => STORE.ping(...a);
