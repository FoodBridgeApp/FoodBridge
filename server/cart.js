// server/cart.js (ESM)
// In-memory cart store + helpers. Persist only for demo/server memory.

const carts = new Map();

function newId() {
  // 10-char base36 random-ish
  return Math.random().toString(36).slice(2, 12);
}

export function normalizeItems(items = []) {
  const nowISO = new Date().toISOString();
  return items
    .filter(Boolean)
    .map((raw, idx) => {
      const type = String(raw.type || "unknown").toLowerCase();
      const title = String(raw.title || `item-${idx + 1}`);
      const sourceUrl = raw.sourceUrl ? String(raw.sourceUrl) : null;
      const durationSec =
        raw.durationSec !== undefined && raw.durationSec !== null
          ? Number(raw.durationSec)
          : null;

      return {
        id: `${Date.now()}-${newId()}-${idx}`,
        type,
        title,
        sourceUrl,
        durationSec,
        addedAt: nowISO,
      };
    });
}

export function upsertCart({ cartId, userId, items = [] }) {
  const id = cartId || `${userId}-${newId()}`;
  const existing = carts.get(id);
  if (!existing) {
    const cart = { cartId: id, userId, items: [] };
    if (Array.isArray(items) && items.length) cart.items.push(...items);
    carts.set(id, cart);
    return cart;
  }
  // merge: replace userId if changed; append items
  existing.userId = userId;
  if (Array.isArray(items) && items.length) existing.items.push(...items);
  return existing;
}

export function appendItemsToCart({ cartId, userId, items = [] }) {
  const cart = carts.get(cartId) || { cartId, userId, items: [] };
  if (!carts.has(cartId)) carts.set(cartId, cart);
  if (Array.isArray(items) && items.length) cart.items.push(...items);
  return cart;
}

export function getCart(cartId) {
  return carts.get(cartId) || null;
}

export function deleteCart(cartId) {
  return carts.delete(cartId);
}

/* ====== Export helpers ====== */

export function cartToCsv(cart) {
  // headers
  const rows = [["id", "type", "title", "sourceUrl", "durationSec", "addedAt"]];
  for (const it of cart.items) {
    rows.push([
      it.id,
      it.type,
      it.title?.replace?.(/"/g, '""') ?? "",
      it.sourceUrl ?? "",
      it.durationSec ?? "",
      it.addedAt ?? "",
    ]);
  }
  return rows.map(r => r.map(v => `"${String(v)}"`).join(",")).join("\n");
}

export function cartToText(cart) {
  const lines = [];
  lines.push(`# Cart: ${cart.cartId}`);
  lines.push(`User: ${cart.userId}`);
  lines.push(`Items: ${cart.items.length}`);
  lines.push("");
  cart.items.forEach((it, i) => {
    lines.push(`${i + 1}. [${it.type}] ${it.title}`);
    if (it.sourceUrl) lines.push(`   url: ${it.sourceUrl}`);
    if (it.durationSec != null) lines.push(`   durationSec: ${it.durationSec}`);
    lines.push(`   addedAt: ${it.addedAt}`);
  });
  return lines.join("\n");
}
