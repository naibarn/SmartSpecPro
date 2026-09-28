import type { Request, Response, NextFunction } from "express";
import { getCachedMcpRuntimeConfig } from "../services/mcpRuntimeConfig";

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS =
  "Authorization, X-Api-Key, Content-Type, Idempotency-Key, Mcp-Session-Id, MCP-Protocol-Version, Mcp-Method, Mcp-Name, traceparent, tracestate, baggage";
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
  "Mcp-Session-Id",
  "MCP-Protocol-Version",
  "WWW-Authenticate",
  "Content-Type",
  "ETag",
  "Cache-Control",
].join(", ");

function isMcpEndpoint(req: Request): boolean {
  const path = String(req.originalUrl || req.url || "").split("?", 1)[0];
  return path === "/v1/mcp" || path === "/mcp";
}

/**
 * The shared browser CORS middleware runs before the /v1 router. MCP
 * preflights must be delegated to publicApiCorsMiddleware so the MCP-specific
 * origin and header policy is applied instead of being answered by the
 * generic 200 response.
 */
export function isMcpPreflightRequest(req: Pick<Request, "method" | "originalUrl" | "url">): boolean {
  return req.method === "OPTIONS" && isMcpEndpoint(req as Request);
}

function mcpAllowedOrigins(): Set<string> {
  const runtime = getCachedMcpRuntimeConfig();
  const configured = [...runtime.corsAllowedOrigins, ...runtime.sessionAllowedOrigins];
  if (configured.length > 0) return new Set(configured);
  return new Set([
    "https://smartaihub.app",
    "https://www.smartaihub.app",
    // Hosted MCP clients make browser-based requests from these origins. The
    // bearer token and OAuth origin checks remain authoritative; CORS only
    // controls whether browser JavaScript can read the response.
    "https://claude.ai",
    "https://claude.com",
    "https://chatgpt.com",
    "https://chat.openai.com",
    ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000", "http://127.0.0.1:3000"]),
  ]);
}

function requestedHeaderNames(req: Request): string[] {
  return String((req.headers || {})["access-control-request-headers"] || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * CORS middleware for /v1/ public API endpoints.
 * Uses Access-Control-Allow-Origin: * because API key auth does not use cookies.
 */
export function publicApiCorsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const mcpEndpoint = isMcpEndpoint(req);
  const origin = typeof (req.headers || {}).origin === "string" ? (req.headers || {}).origin as string : "";
  const allowedOrigins = mcpEndpoint ? mcpAllowedOrigins() : null;
  const originAllowed = !mcpEndpoint || !origin || allowedOrigins?.has(origin);

  if (mcpEndpoint) {
    res.setHeader("Vary", "Origin");
    if (originAllowed && origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    if (mcpEndpoint && (!originAllowed || requestedHeaderNames(req).some((header) => !ALLOWED_HEADERS.toLowerCase().split(", ").includes(header)))) {
      res.status(403).json({ error: { code: "cors_forbidden", message: "MCP CORS preflight is not allowed" } });
      return;
    }
    res.status(204).end();
    return;
  }

  next();
}
