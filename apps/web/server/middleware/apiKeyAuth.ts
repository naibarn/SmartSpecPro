import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { authorizeRequest } from "../_core/authz";
import { getCachedPreferredInternalToken } from "../services/appRuntimeConfig";

/**
 * Express middleware that authenticates requests for /v1/* routes.
 * Calls authorizeRequest() and sets req.auth for downstream middleware.
 * Audit logging is handled separately by publicApiAuditMiddleware.
 *
 * X-Internal-Token (service-to-service from Python/Celery) is also accepted.
 * When valid, the request is passed through so downstream route handlers
 * (e.g. llmRoutes guardWithCreditsOrInternalToken) can perform credit checks.
 */
export async function apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Allow X-Internal-Token through — downstream handlers do their own credit checks
  const internalToken = req.headers["x-internal-token"] as string | undefined;
  const expectedInternalToken = getCachedPreferredInternalToken();
  if (internalToken && expectedInternalToken && internalToken.length >= 32) {
    const tokenBuf = Buffer.from(internalToken);
    const expectedBuf = Buffer.from(expectedInternalToken);
    if (
      tokenBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      (res.locals as any).verifiedInternalToken = true;
      req.auth = {
        ok: true,
        mode: "bearer",
        sub: "internal",
        scopes: ["llm:chat", "mcp:read", "mcp:write"],
      };
      return next();
    }
  }

  const auth = await authorizeRequest(req, {
    allowBearer: true,
    allowSession: true,
  });

  if (!auth.ok) {
    const isSuspended = auth.error === "key_suspended";
    const code = isSuspended ? "key_suspended" : "invalid_api_key";
    res.setHeader("X-Api-Error-Code", code);
    return res.status(isSuspended ? 403 : 401).json({
      error: {
        code,
        message: isSuspended
          ? "This API key has been suspended. Contact your administrator."
          : auth.error || "Authentication required",
        type: "auth_error",
      },
    });
  }

  req.auth = auth;
  next();
}
