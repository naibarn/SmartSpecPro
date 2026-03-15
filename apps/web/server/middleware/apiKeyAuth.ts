import type { Request, Response, NextFunction } from "express";
import { authorizeRequest } from "../_core/authz";

/**
 * Express middleware that authenticates requests for /v1/* routes.
 * Calls authorizeRequest() and sets req.auth for downstream middleware.
 * Audit logging is handled separately by publicApiAuditMiddleware.
 */
export async function apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
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
