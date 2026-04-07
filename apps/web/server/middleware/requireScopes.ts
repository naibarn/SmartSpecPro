import type { Request, Response, NextFunction } from "express";
import type { AuthResult } from "../_core/authz";

declare global {
  namespace Express {
    interface Request {
      /** Populated by apiKeyAuthMiddleware for /v1/* routes */
      auth?: AuthResult & { ok: true };
    }
  }
}

/**
 * Express middleware factory that enforces API scope requirements.
 * Session and generic bearer auth bypass scope checks (full access).
 * Delegated worker auth is scope-checked like API keys.
 * API key auth requires all listed scopes (AND logic).
 */
export function requireScopes(...requiredScopes: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.auth;
    if (!auth) {
      res.setHeader("X-Api-Error-Code", "invalid_api_key");
      res.status(401).json({
        error: {
          code: "invalid_api_key",
          message: "Authentication required",
          type: "auth_error",
        },
      });
      return;
    }

    // Session and generic bearer (JWT) auth modes get implicit full scope access
    // for web app routes. These represent authenticated web app users.
    // MCP public server enforces scopes separately via its session system.
    if (auth.mode === "session" || auth.mode === "bearer") {
      next();
      return;
    }

    // API key auth: check all required scopes (AND logic)
    const keyScopes = auth.scopes ?? [];
    const missing = requiredScopes.filter((s) => !keyScopes.includes(s));
    if (missing.length > 0) {
      res.setHeader("X-Api-Error-Code", "insufficient_scopes");
      res.status(403).json({
        error: {
          code: "insufficient_scopes",
          message: `Missing required scopes: ${missing.join(", ")}`,
          type: "auth_error",
        },
      });
      return;
    }

    next();
  };
}
