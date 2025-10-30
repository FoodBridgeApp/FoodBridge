// server/cart-redis.js (ESM, full file)
// Drop-in Redis backend for cart storage.
// Keys:
//   fb:cart:<cartId>    -> JSON { cartId, userId, items: [...] }

import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_TLS_URL || "";
if (!REDIS_URL) {
  console.warn("[cart-redis] REDIS_URL not set; this module will fail if used without it.");
}
export const redis = REDIS_URL ? new IORedis(REDIS_URL) : null;

// ---- helpers ----
function rid(len = 6) {
  // tiny random id
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += abc[Math.floor(Math.random() * abc.length)];
  return out;
}

function cartKey(cartId) {
  return `fb:cart:${cartId}`;
}

// Normalize items into consistent shape, attach IDs
export function normalizeItems(items = []) {
  const now = Date.now();
  return items
    .map((raw, idx) => {
      if (!raw || typeof raw !== "object") return null;
      const type = String(raw.type || "").toLowerCase();
      if (!["recipe", "audio", "note"].includes(type)) return null;
      const id = `${now}-${rid(6)}-${idx}`;
      return {
        id,
        type,
        title: raw.title ? String(raw.title) : null,
        sourceUrl: raw.sourceUrl ? String(raw.sourceUrl) : null,
        durationSec: raw.durationSec != null ? Number(raw.durationSec) : null,
        addedAt: new Date(now).toISOString(),
      };
    })
    .filter(Boolean);
}

// ---- core ops ----
export async function getCart(cartId) {
  const key = cartKey(cartId);
  const raw = await redis.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function upsertCart({ cartId, userId, items = [] }) {
  const id = cartId ? String(cartId) : `${userId}-${rid(8)}`;
  const key = cartKey(id);
  const existing = await getCart(id);
  const cart = existing || { cartId: id, userId: String(userId), items: [] };
  if (Array.isArray(items) && items.length) {
    cart.items.push(...items);
  }
  await redis.set(key, JSON.stringify(cart));
  return cart;
}

export async function appendItemsToCart({ cartId, userId, items = [] }) {
  const key = cartKey(cartId);
  const existing = (await getCart(cartId)) || { cartId, userId: String(userId), items: [] };
  existing.items.push(...items);
  await redis.set(key, JSON.stringify(existing));
  return existing;
}

export async function deleteCart(cartId) {
  const key = cartKey(cartId);
  const n = await redis.del(key);
  return n > 0;
}
