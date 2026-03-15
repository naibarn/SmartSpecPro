import type { Request, Response, NextFunction } from "express";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS =
  "Authorization, X-Api-Key, Content-Type, Idempotency-Key, Mcp-Session-Id";
const EXPOSED_HEADERS = [
  "X-Request-Id",
  "X-Credits-Used",
  "X-Credits-Remaining",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "X-RateLimit-Reset",
  "X-Quota-Hourly-Limit",
  "X-Quota-Hourly-Remaining",
  "X-Quota-Hourly-Reset",
  "X-Quota-Daily-Limit",
  "X-Quota-Daily-Remaining",
  "X-Quota-Weekly-Limit",
  "X-Quota-Weekly-Remaining",
  "X-Quota-Monthly-Limit",
  "X-Quota-Monthly-Remaining",
].join(", ");

/**
 * CORS middleware for /v1/ public API endpoints.
 * Uses Access-Control-Allow-Origin: * because API key auth does not use cookies.
 */
export function publicApiCorsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
