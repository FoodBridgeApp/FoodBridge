// server/auth.js (ESM, full)
// Optional JWT (HS256), HMAC, or static API Key. Flip on with FB_REQUIRE_AUTH="true".

import crypto from "crypto";

const REQUIRE = String(process.env.FB_REQUIRE_AUTH || "").toLowerCase() === "true";
const JWT_SECRET = process.env.FB_JWT_SECRET || "";         // HS256
const HMAC_SECRET = process.env.FB_SIGNING_SECRET || "";
const API_KEY = process.env.FB_API_KEY || "";               // optional static bearer

export function isAuthRequired() { return REQUIRE; }
export function nowMs() { return Date.now(); }

function safeEq(a, b) {
  const A = Buffer.from(String(a) || "", "utf8");
  const B = Buffer.from(String(b) || "", "utf8");
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export function hmacSign(str) {
  if (!HMAC_SECRET) return null;
  return crypto.createHmac("sha256", HMAC_SECRET).update(String(str)).digest("hex");
}

function verifyHmacCore(ts, sig, method, path, bodyRaw = "") {
  if (!HMAC_SECRET) return { ok: false, reason: "no_hmac_secret" };
  const MAX_SKEW = 10 * 60 * 1000; // 10 minutes
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return { ok: false, reason: "bad_ts" };
  if (Math.abs(nowMs() - tsNum) > MAX_SKEW) return { ok: false, reason: "ts_skew" };
  const payload = `${method} ${path}\n${tsNum}\n${bodyRaw}`;
  const expect = hmacSign(payload);
  if (!expect) return { ok: false, reason: "sign_failed" };
  if (!sig) return { ok: false, reason: "missing_sig" };
  if (!safeEq(expect, sig)) return { ok: false, reason: "sig_mismatch" };
  return { ok: true };
}

export function verifyHmac(req) {
  const q = req.query || {};
  const h = req.headers || {};
  const ts = q.ts || h["x-fb-ts"];
  const sig = q.sig || h["x-fb-sig"];
  const bodyRaw = req.rawBodyString || "";
  return verifyHmacCore(ts, sig, req.method, req.path, bodyRaw);
}

export function verifyJwt(req) {
  if (!JWT_SECRET) return { ok: false, reason: "no_jwt_secret" };
  const auth = req.headers["authorization"] || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, reason: "no_bearer" };
  const token = m[1];
  try {
    const [headerB64, payloadB64, sigB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return { ok: false, reason: "jwt_malformed" };
    const data = `${headerB64}.${payloadB64}`;
    const expect = crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
    if (!safeEq(expect, sigB64)) return { ok: false, reason: "jwt_sig_bad" };
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (payload.exp && nowMs() / 1000 > Number(payload.exp)) return { ok: false, reason: "jwt_expired" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "jwt_error" };
  }
}

function verifyApiKey(req) {
  if (!API_KEY) return { ok: false, reason: "no_api_key" };
  const h = req.headers["authorization"] || "";
  if (h === `Bearer ${API_KEY}`) return { ok: true };
  return { ok: false, reason: "api_key_bad" };
}

export function authGate(required = false) {
  return (req, res, next) => {
    if (!required) return next();

    // 1) API key (if set) – simplest path
    if (API_KEY) {
      const k = verifyApiKey(req);
      if (k.ok) return next();
    }

    // 2) JWT
    if (JWT_SECRET) {
      const jwt = verifyJwt(req);
      if (jwt.ok) { req.user = jwt.payload || { sub: "jwt" }; return next(); }
    }

    // 3) HMAC
    if (HMAC_SECRET) {
      const h = verifyHmac(req);
      if (h.ok) return next();
    }

    return res.status(401).json({ ok: false, error: "unauthorized" });
  };
}
