export type Region = "LA"|"SF"|"PHX"|"NYC"|"OTHER";
const BASE = { milk:2.99, egg:3.49, chicken_breast_lb:3.99, onion:0.69, garlic:0.50, olive_oil_tbsp:0.20 };
export const REGION_MULT: Record<Region, number> = { LA:1.08, SF:1.18, PHX:0.96, NYC:1.22, OTHER:1.00 };

export function regionFromIp(ip?: string): Region {
  if (!ip) return "OTHER";
  if (ip.startsWith("104.") || ip.startsWith("47.")) return "LA";
  return "OTHER";
}
export function estimatePrice(name: string, qty = 1, unit = "") {
  const n = name.toLowerCase();
  const key = n.includes("chicken") ? "chicken_breast_lb"
           : n.includes("onion")   ? "onion"
           : n.includes("garlic")  ? "garlic"
           : n.includes("milk")    ? "milk"
           : n.includes("olive")   ? "olive_oil_tbsp"
           : null;
  const base = key ? (BASE as any)[key] : 2.00;
  return Math.max(0.25, base * qty);
}
