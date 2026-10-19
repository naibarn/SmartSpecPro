import type { RequestHandler } from "express";
import { COOKIE_NAME } from "@shared/const";
import { getVerifiedCloudflarePublicOrigin } from "./cloudflareOriginMiddleware";

/** Actual request middleware, extracted so tests exercise production behavior. */
export function createCsrfProtection(input: {
  isAllowedOrigin: (origin: string | undefined) => boolean;
  isAllowedMarketplaceOrigin: (origin: string) => boolean;
  isProduction: () => boolean;
}): RequestHandler {
  return (req, res, next) => {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

    // Existing provider callbacks retain their own signature verification.
    if (
      req.path === "/v1/media/callback/kie-ai" ||
      req.originalUrl === "/api/v1/media/callback/kie-ai" ||
      req.path.startsWith("/webhooks/gdrive") || req.originalUrl.startsWith("/api/webhooks/gdrive") ||
      req.path.startsWith("/webhooks/telegram/") || req.originalUrl.startsWith("/api/webhooks/telegram/") ||
      req.originalUrl.startsWith("/api/webhooks/trigger/") ||
      req.originalUrl.startsWith("/api/voice-agents/elevenlabs/") ||
      /^\/webhooks\/[a-z]+\/[a-z0-9-]+$/.test(req.path) ||
      /^\/webhooks\/[a-z]+\/[a-z0-9-]+$/.test(req.originalUrl)
    ) return next();

    const origin = req.get("origin");
    const authorization = req.get("authorization");
    const bearer = Boolean(authorization?.startsWith("Bearer ") && authorization.length > 7);
    const edgeOrigin = getVerifiedCloudflarePublicOrigin(req);
    if (!origin) {
      if (bearer) return next(); // Actual bearer authentication follows downstream.
      if (edgeOrigin || (input.isProduction() && req.cookies?.[COOKIE_NAME])) {
        return res.status(403).json({ error: { message: "Forbidden: missing Origin header" } });
      }
      return next();
    }
    // Exact origin binding also protects login before a session cookie exists.
    if (edgeOrigin && !bearer && origin !== edgeOrigin) {
      return res.status(403).json({ error: { message: "Forbidden: invalid origin" } });
    }
    if (req.originalUrl.startsWith("/api/marketplace-captures") && bearer && input.isAllowedMarketplaceOrigin(origin)) return next();
    if (!input.isAllowedOrigin(origin)) {
      return res.status(403).json({ error: { message: "Forbidden: invalid origin" } });
    }
    return next();
  };
}
