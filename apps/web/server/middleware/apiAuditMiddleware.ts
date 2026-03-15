import type { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { publicApiAuditLog } from "../../drizzle/schema";

/**
 * Audit logging middleware for public API requests.
 * Logs to public_api_audit_log table (non-blocking).
 */
export function apiAuditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = req.auth;
  if (!auth || auth.mode !== "api_key") {
    return next();
  }

  const startTime = Date.now();

  res.on("finish", () => {
    const creditsHeader = res.getHeader("X-Credits-Used");
    const creditsUsed = creditsHeader ? parseInt(String(creditsHeader), 10) : 0;

    const requestMeta: Record<string, unknown> = {
      query: { ...req.query },
      contentLength: req.headers["content-length"],
      authorization: req.headers.authorization
        ? "Bearer [REDACTED]"
        : undefined,
    };

    db.insert(publicApiAuditLog)
      .values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        traceId: (req as any).requestId ?? null,
        method: req.method.slice(0, 10),
        path: req.path.slice(0, 255),
        statusCode: res.statusCode,
        creditsUsed: isNaN(creditsUsed) ? 0 : creditsUsed,
        latencyMs: Date.now() - startTime,
        ip:
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
          req.ip ??
          null,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
        requestMeta,
      })
      .catch(() => {
        // Non-blocking — audit failure must never break the response
      });
  });

  next();
}
