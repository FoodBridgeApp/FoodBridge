// server/cart.js — in-memory cart store (ESM)
// Exports: getCart, upsertCart, appendItemsToCart, deleteCart, normalizeItems

// --- store ---
const CARTS = new Map(); // key: cartId (string) or userId (string) -> { cartId, userId, items: [...] }

// --- utils ---
const norm = (s) => String(s ?? "").trim();
const lower = (s) => norm(s).toLowerCase();

export function normalizeItems(items) {
  const out = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const name = lower(raw?.name || raw?.title || raw?.ingredient || "");
    if (!name) continue;

    const unit = norm(raw?.unit || "");
    const qtyNum = Number(raw?.qty ?? 1);
    const qty = Number.isFinite(qtyNum) ? qtyNum : 1;

    out.push({
      id: raw?.id ?? null,
      type: raw?.type || "ingredient",
      // IMPORTANT: do not mix ?? with || without parens
      title: (raw?.title ?? name) || "Untitled",
      name,
      qty,
      unit,
      notes: raw?.notes ?? null,
      sourceUrl: raw?.sourceUrl ?? null,
      addedAt: new Date().toISOString(),
    });
  }
  return out;
}

function newCartId() {
  return Math.random().toString(36).slice(2, 10);
}

function shallowCloneCart(cart) {
  return {
    cartId: cart.cartId,
    userId: cart.userId,
    items: Array.isArray(cart.items) ? cart.items.map((i) => ({ ...i })) : [],
  };
}

// --- API ---
export async function getCart(key) {
  const k = String(key);
  const found = CARTS.get(k);
  return found ? shallowCloneCart(found) : null;
}

export async function upsertCart({ cartId = null, userId, items = [] }) {
  const uid = String(userId);
  const normalized = normalizeItems(items);

  // If a cartId was provided, use it; otherwise, try using the userId as key.
  const key = cartId ? String(cartId) : uid;
  const existing = CARTS.get(key);

  const next = {
    cartId: cartId ? String(cartId) : existing?.cartId || newCartId(),
    userId: uid,
    items: normalized,
  };

  CARTS.set(key, next);

  // Keep a mirror entry by userId so /api/cart/export.json?userId=... works even if you keyed by cartId
  CARTS.set(uid, next);

  return shallowCloneCart(next);
}

export async function appendItemsToCart({ cartId, userId, items = [] }) {
  const uid = String(userId);
  const key = cartId ? String(cartId) : uid;
  const normalized = normalizeItems(items);

  let cur = CARTS.get(key) || {
    cartId: cartId ? String(cartId) : newCartId(),
    userId: uid,
    items: [],
  };

  // merge by (name, unit)
  const map = new Map();
  const keyer = (i) => `${i.name}|${i.unit || ""}`;
  for (const it of cur.items) map.set(keyer(it), { ...it });

  for (const it of normalized) {
    const k = keyer(it);
    if (map.has(k)) {
      const prev = map.get(k);
      const a = Number(prev.qty);
      const b = Number(it.qty);
      if (Number.isFinite(a) && Number.isFinite(b)) prev.qty = a + b;
      // carry over notes/source if missing
      prev.notes = prev.notes || it.notes || null;
      prev.sourceUrl = prev.sourceUrl || it.sourceUrl || null;
    } else {
      map.set(k, { ...it });
    }
  }

  cur = { ...cur, items: Array.from(map.values()) };

  CARTS.set(key, cur);
  CARTS.set(uid, cur);

  return shallowCloneCart(cur);
}

export async function deleteCart(cartId) {
  const cid = String(cartId);
  const cur = CARTS.get(cid);
  let ok = false;
  if (cur) {
    ok = CARTS.delete(cid);
    // Also remove any userId mirror that points to the same cart object
    const mirrors = [];
    for (const [k, v] of CARTS.entries()) {
      if (k !== cid && v?.cartId === cur.cartId) mirrors.push(k);
    }
    for (const m of mirrors) CARTS.delete(m);
  }
  return ok;
}
