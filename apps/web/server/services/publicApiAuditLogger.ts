import { getDb } from "../db";
import { publicApiAuditLog } from "../../drizzle/schema";

/**
 * Log a single public API request to the public_api_audit_log table.
 *
 * Errors are swallowed: audit failures must never break the originating request.
 */
export async function logPublicApiRequest(entry: {
  tenantId: string;
  apiKeyId?: string;
  userId?: number;
  method: string;
  path: string;
  statusCode: number;
  creditsUsed?: number;
  durationMs?: number;
  errorCode?: string | null;
  traceId?: string;
  ip?: string;
  userAgent?: string;
  requestMeta?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const requestMeta: Record<string, unknown> = {
      ...(entry.requestMeta ?? {}),
      ...(entry.errorCode != null ? { errorCode: entry.errorCode } : {}),
    };

    await db.insert(publicApiAuditLog).values({
      tenantId: entry.tenantId,
      apiKeyId: entry.apiKeyId,
      traceId: entry.traceId ?? null,
      // userId is required (NOT NULL) by schema; fall back to 0 for service-account style calls
      userId: entry.userId ?? 0,
      method: entry.method.toUpperCase().slice(0, 10),
      path: entry.path.slice(0, 255),
      statusCode: entry.statusCode,
      creditsUsed: entry.creditsUsed ?? 0,
      latencyMs: entry.durationMs ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      requestMeta: Object.keys(requestMeta).length > 0 ? requestMeta : undefined,
    });
  } catch {
    // Intentionally swallowed — audit failures must not propagate
  }
}
