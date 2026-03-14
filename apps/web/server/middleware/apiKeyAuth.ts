import type { Request, Response, NextFunction } from "express";
import { authorizeRequest } from "../_core/authz";

/**
 * Express middleware that authenticates requests for /v1/* routes.
 * Calls authorizeRequest() and sets req.auth for downstream middleware.
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
    return res.status(401).json({
      error: {
        code: "invalid_api_key",
        message: auth.error || "Authentication required",
        type: "auth_error",
      },
    });
  }

  req.auth = auth;
  next();
}
