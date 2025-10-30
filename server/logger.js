// server/logger.js
import { v4 as uuidv4 } from "uuid";

/**
 * Structured logger: JSON lines with reqId, path, method, status, ms
 * Usage: app.use(requestLogger())
 */
export function requestLogger() {
  return function (req, res, next) {
    // correlation id: from header or new
    const reqId = req.headers["x-request-id"] || uuidv4();
    req.id = String(reqId);

    const start = process.hrtime.bigint();
    const meta = {
      reqId: req.id,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      ua: req.headers["user-agent"] || null,
    };

    // Log start
    console.log(JSON.stringify({ level: "info", msg: "req_start", ...meta }));

    res.on("finish", () => {
      const end = process.hrtime.bigint();
      const durMs = Number(end - start) / 1e6;
      console.log(
        JSON.stringify({
          level: "info",
          msg: "req_done",
          ...meta,
          status: res.statusCode,
          ms: Math.round(durMs),
        })
      );
    });

    // Propagate req id to client
    res.setHeader("x-request-id", req.id);
    next();
  };
}

/** Lightweight app logger helper */
export const log = (msg, extra = {}) =>
  console.log(JSON.stringify({ level: "info", msg, ...extra }));
