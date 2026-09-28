import type { Request, Response, NextFunction } from "express";
import { logPublicApiRequest } from "../services/publicApiAuditLogger";
import { getMcpTransportMetadata } from "../services/mcpTransportTelemetry";
import { incrementCreditQuotas } from "../services/apiKeyRateLimiter";

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

    if (auth.mode === "api_key" && auth.keyPurpose === "mcp_cli" && creditsUsed > 0) {
      void incrementCreditQuotas(auth.apiKeyId, creditsUsed, {
        creditLimit: auth.creditLimit ?? null,
        creditQuota5h: auth.creditQuota5h ?? null,
        creditQuotaDaily: auth.creditQuotaDaily ?? null,
        creditQuotaWeekly: auth.creditQuotaWeekly ?? null,
      }).catch(() => {});
    }

    void logPublicApiRequest({
      tenantId: auth.tenantId,
      apiKeyId: auth.apiKeyId,
      userId: auth.userId,
      method: req.method,
      path: isMcpEndpoint(req) ? req.originalUrl.split("?", 1)[0] : req.path,
      statusCode: res.statusCode,
      creditsUsed,
      durationMs: Date.now() - startMs,
      traceId: (req as any).requestId,
      ip: req.ip,
      userAgent: req.headers["user-agent"]?.slice(0, 500),
      ...(isMcpEndpoint(req) ? { requestMeta: getMcpTransportMetadata(req, "modern_http") } : {}),
      errorCode: res.statusCode >= 400
        ? (res.getHeader("X-Api-Error-Code") as string | null) ?? String(res.statusCode)
        : null,
    });
  });

  next();
}

function isMcpEndpoint(req: Request): boolean {
  return req.path === "/mcp" || req.path.startsWith("/mcp/");
}
