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
    // Log all authenticated /v1/* requests regardless of auth mode
    if (!auth?.ok) return;

    // Read credits consumed by the route handler (set via X-Credits-Used response header)
    const creditsHeader = res.getHeader("X-Credits-Used");
    const creditsUsed = creditsHeader != null ? Number(creditsHeader) : 0;

    void logPublicApiRequest({
      tenantId: auth.tenantId,
      apiKeyId: auth.apiKeyId,
      userId: auth.userId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      creditsUsed,
      durationMs: Date.now() - startMs,
      errorCode: res.statusCode >= 400
        ? (res.getHeader("X-Api-Error-Code") as string | null) ?? String(res.statusCode)
        : null,
    });
  });

  next();
}
