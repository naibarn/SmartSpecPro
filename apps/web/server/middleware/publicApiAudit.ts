import type { Request, Response, NextFunction } from "express";
import { logPublicApiRequest } from "../services/publicApiAuditLogger";

/**
 * Middleware that logs every public API request to public_api_audit_log.
 * Must be mounted AFTER apiKeyAuthMiddleware so req.auth is populated.
 * Fires on response 'finish' (non-blocking — never delays the response).
 */
export function publicApiAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startMs = Date.now();

  res.on("finish", () => {
    const auth = (req as any).auth;
    // Only log requests authenticated via API key (mode === 'api_key')
    if (!auth?.ok || auth.mode !== "api_key") return;

    void logPublicApiRequest({
      tenantId: auth.tenantId,
      apiKeyId: auth.apiKeyId,
      userId: auth.userId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startMs,
      errorCode: res.statusCode >= 400 ? String(res.statusCode) : null,
    });
  });

  next();
}
