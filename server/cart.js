/**
 * server/cart.js — simple in-memory cart store used by index.mjs
 * Exports: getCart, upsertCart, appendItemsToCart, deleteCart, normalizeItems
 */

const store = new Map(); // key: cartId, value: { cartId, userId, items: [...] }

/** Normalize arbitrary "ingredient-ish" objects into a strict {name, qty, unit, ...} */
export function normalizeItems(items) {
  const arr = Array.isArray(items) ? items : [];
  return arr.map((raw) => {
    const name = String(raw?.name ?? raw?.title ?? raw?.ingredient ?? "").trim();
    const unit = String(raw?.unit ?? "").trim();
    const qtyNum = Number(raw?.qty);
    const qty = Number.isFinite(qtyNum) ? qtyNum : 1;
    return {
      id: raw?.id ?? null,
      type: raw?.type ?? "ingredient",
      title: raw?.title ?? name || "Untitled",
      name: name || "Untitled",
      qty,
      unit,
      notes: raw?.notes ?? null,
      sourceUrl: raw?.sourceUrl ?? null,
      addedAt: new Date().toISOString(),
    };
  });
}

export async function getCart(cartId) {
  return store.get(String(cartId)) || null;
}

export async function upsertCart({ cartId, userId, items }) {
  const id = String(cartId || userId || cryptoRandomId());
  const existing = store.get(id);
  const normalized = normalizeItems(items);
  const next = {
    cartId: id,
    userId: String(userId || existing?.userId || "guest"),
    items: normalized,
    updatedAt: new Date().toISOString(),
  };
  store.set(id, next);
  return next;
}

export async function appendItemsToCart({ cartId, userId, items }) {
  const id = String(cartId || userId || cryptoRandomId());
  const normalized = normalizeItems(items);
  const cur = store.get(id) || { cartId: id, userId: String(userId || "guest"), items: [] };
  // simple concat; dedupe by (name|unit) and sum qty
  const merged = mergeItems([cur.items, normalized]);
  const next = { cartId: id, userId: cur.userId, items: merged, updatedAt: new Date().toISOString() };
  store.set(id, next);
  return next;
}

export async function deleteCart(cartId) {
  return store.delete(String(cartId));
}

// internal helpers
function mergeItems(arrays) {
  const map = new Map();
  const norm = (s) => String(s || "").trim().toLowerCase();
  for (const items of arrays || []) {
    for (const raw of items || []) {
      const name = norm(raw.name || raw.title || "");
      if (!name) continue;
      const unit = String(raw.unit || "");
      const key = `${name}|${unit}`;
      if (map.has(key)) {
        const prev = map.get(key);
        const a = Number(prev.qty), b = Number(raw.qty);
        if (Number.isFinite(a) && Number.isFinite(b)) prev.qty = a + b;
        if (!prev.notes && raw.notes) prev.notes = raw.notes;
        if (!prev.sourceUrl && raw.sourceUrl) prev.sourceUrl = raw.sourceUrl;
      } else {
        map.set(key, { ...raw, name: raw.name || raw.title || "Untitled", unit });
      }
    }
  }
  return Array.from(map.values());
}

// tiny id
function cryptoRandomId() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
