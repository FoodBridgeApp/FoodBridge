// server/logger.js
import { randomUUID } from "node:crypto";

/**
 * Structured request logger with:
 * - correlation IDs
 * - optional suppression of health/infra probes
 * - simple header redaction
 *
 * Env:
 *   LOG_HEALTH_PINGS=false|true  (default true → do log health pings)
 *   LOG_SAMPLE=1                 (log every Nth request; default 1)
 *   LOG_REDACT_HEADERS=authorization,cookie
 */
export function requestLogger() {
  const logHealth = parseBool(process.env.LOG_HEALTH_PINGS, true);
  const sampleN = clampInt(process.env.LOG_SAMPLE, 1, 1, 1_000_000);
  const redactList = parseList(process.env.LOG_REDACT_HEADERS, ["authorization", "cookie"]);

  const healthPaths = new Set(["/api/health", "/"]);
  const infraUA = [/^Render\/1\.0$/i, /^Go-http-client\/2\.0$/i];

  return function (req, res, next) {
    if (sampleN > 1 && Math.floor(Math.random() * sampleN) !== 0) return next();

    // correlation id
    const reqId = req.headers["x-request-id"] || randomUUID();
    req.id = String(reqId);

    const start = process.hrtime.bigint();
    const meta = {
      reqId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      ua: req.headers["user-agent"] || null,
    };

    const isInfraUA = (meta.ua && infraUA.some((re) => re.test(meta.ua))) || false;
    const isHealthPath = healthPaths.has(stripQuery(meta.path));
    const isHeadRoot = req.method === "HEAD" && stripQuery(meta.path) === "/";
    const suppress = (!logHealth && (isHealthPath || isHeadRoot || isInfraUA));

    if (!suppress) console.log(JSON.stringify({ level: "info", msg: "req_start", ...meta }));

    res.on("finish", () => {
      const end = process.hrtime.bigint();
      const durMs = Number(end - start) / 1e6;
      if (!suppress) {
        console.log(
          JSON.stringify({
            level: "info",
            msg: "req_done",
            ...meta,
            status: res.statusCode,
            ms: Math.round(durMs),
          })
        );
      }
    });

    res.setHeader("x-request-id", req.id);

    // redact a couple of sensitive headers on the request object
    redactList.forEach((h) => {
      if (req.headers[h]) req.headers[h] = "***redacted***";
    });

    next();
  };
}

export const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ level: "info", msg, ...extra }));

/* helpers */
function stripQuery(p) {
  const i = p.indexOf("?");
  return i === -1 ? p : p.slice(0, i);
}
function parseBool(v, def) {
  if (v == null) return def;
  const s = String(v).toLowerCase().trim();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return def;
}
function clampInt(v, def, min, max) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}
function parseList(v, def = []) {
  if (!v) return def;
  return String(v)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
