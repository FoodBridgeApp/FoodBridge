// server/cart-redis.js (ESM)
// Redis-backed cart store with graceful connection + JSON payloads

import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { log } from "./logger.js";

// ---------- connection ----------
function makeRedis() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL not set");
  const tls = String(process.env.REDIS_TLS || "").toLowerCase() === "true";

  const opts = {};
  if (tls) {
    // Many managed Redis vendors (Render/Upstash) require TLS
    opts.tls = { rejectUnauthorized: false };
  }

  const r = new Redis(url, opts);

  let warned = false;
  r.on("error", (err) => {
    // avoid log spam
    if (!warned) {
      warned = true;
      log("redis_error_first", { error: String(err && err.message ? err.message : err) });
      setTimeout(() => (warned = false), 30_000);
    }
  });

  r.on("connect", () => log("redis_connect_ok"));
  r.on("close", () => log("redis_close"));
  return r;
}

function prefix() {
  const p = process.env.REDIS_PREFIX || "fb:";
  return p.endsWith(":") ? p : `${p}:`;
}

function ttlSecs() {
  const n = Number(process.env.REDIS_TTL_SECS || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function cartKey(cartId) {
  return `${prefix()}cart:${cartId}`;
}

function randomId() {
  // short-ish, readable cart id
  const s = randomUUID().replace(/-/g, "").slice(0, 10);
  const t = Date.now().toString(36).slice(-5);
  return `${t}${s}`;
}

// ---------- public API ----------
export function makeRedisCartStore() {
  const redis = makeRedis();
  const exp = ttlSecs();

  return {
    async getCart(cartId) {
      const key = cartKey(cartId);
      const raw = await redis.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async upsertCart({ cartId, userId, items = [] }) {
      const id = cartId ? String(cartId) : `${String(userId)}-${randomId()}`;
      const key = cartKey(id);
      // read/merge existing if exists
      const existing = await this.getCart(id);
      const base = existing || { cartId: id, userId: String(userId), items: [] };
      const merged = {
        ...base,
        userId: String(userId || base.userId),
        items: Array.isArray(items) && items.length > 0 ? items : base.items,
      };
      const payload = JSON.stringify(merged);
      if (exp > 0) {
        await redis.set(key, payload, "EX", exp);
      } else {
        await redis.set(key, payload);
      }
      return merged;
    },

    async appendItemsToCart({ cartId, userId, items = [] }) {
      const id = String(cartId);
      const key = cartKey(id);
      const existing = (await this.getCart(id)) || { cartId: id, userId: String(userId), items: [] };
      const merged = {
        ...existing,
        userId: String(userId || existing.userId),
        items: [...(existing.items || []), ...(items || [])],
      };
      const payload = JSON.stringify(merged);
      if (exp > 0) {
        await redis.set(key, payload, "EX", exp);
      } else {
        await redis.set(key, payload);
      }
      return merged;
    },

    async deleteCart(cartId) {
      const key = cartKey(String(cartId));
      const n = await redis.del(key);
      return n > 0;
    },

    // optional: tiny ping for readiness checks
    async ping() {
      try {
        const res = await redis.ping();
        return res === "PONG";
      } catch {
        return false;
      }
    },

    // helpful for /api/config
    backend: "redis",
  };
}
