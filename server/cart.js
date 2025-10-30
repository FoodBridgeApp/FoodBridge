// server/cart.js (ESM)
// Minimal in-memory cart store (volatile; for demos & UI wiring)

const store = new Map(); // cartId -> { cartId, userId, items:[], updatedAt }

export function normalizeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr.map((it, idx) => {
    const type = String(it?.type || "unknown").toLowerCase();
    const title = String(it?.title || `item-${idx + 1}`);
    const sourceUrl = it?.sourceUrl ? String(it.sourceUrl) : null;
    const durationSec = typeof it?.durationSec === "number" ? it.durationSec : null;

    return {
      id: it?.id ? String(it.id) : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${idx}`,
      type,
      title,
      sourceUrl,
      durationSec,
      addedAt: new Date().toISOString(),
    };
  });
}

export function upsertCart({ cartId, userId, items = [] }) {
  let cid = cartId ? String(cartId) : genCartId(userId);
  const existing = store.get(cid);
  const payload = {
    cartId: cid,
    userId: String(userId),
    items: Array.isArray(items) ? items : [],
    updatedAt: new Date().toISOString(),
  };
  if (existing) {
    // replace userId if provided, merge items to end
    if (userId) existing.userId = String(userId);
    if (payload.items.length) existing.items = payload.items;
    existing.updatedAt = payload.updatedAt;
    store.set(cid, existing);
    return existing;
  } else {
    store.set(cid, payload);
    return payload;
  }
}

export function appendItemsToCart({ cartId, userId, items = [] }) {
  let cid = String(cartId || genCartId(userId));
  const existing = store.get(cid) || { cartId: cid, userId: String(userId || "guest"), items: [] };
  existing.items = existing.items.concat(Array.isArray(items) ? items : []);
  existing.userId = String(userId || existing.userId);
  existing.updatedAt = new Date().toISOString();
  store.set(cid, existing);
  return existing;
}

export function getCart(cartId) {
  return store.get(String(cartId)) || null;
}

export function deleteCart(cartId) {
  return store.delete(String(cartId));
}

function genCartId(userId) {
  const u = (userId || "guest").toString().replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "guest";
  return `${u}-${Date.now().toString(36)}`;
}
