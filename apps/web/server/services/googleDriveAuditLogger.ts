/**
 * Thin wrapper around auditLogger for Google Drive API operations.
 */

import { auditLogger, type AuditLogEntry } from "./auditLogger";
import { getTraceId } from "./traceContext";

export function logGDriveApiCall(params: {
  userId: number;
  operation: string;
  latencyMs: number;
  success: boolean;
  driveFileId?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}): void {
  const entry: Partial<AuditLogEntry> & Pick<AuditLogEntry, "traceId" | "eventType" | "userId" | "timestamp"> = {
    traceId: getTraceId() || "",
    timestamp: new Date().toISOString(),
    eventType: "gdrive_api_call",
    userId: params.userId,
    timing: { totalMs: params.latencyMs },
    errorMessage: params.errorMessage,
  };
  auditLogger.log(entry as AuditLogEntry);
}
