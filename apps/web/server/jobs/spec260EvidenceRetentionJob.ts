import { sql } from "drizzle-orm";
import { emergencyEvidenceAssets } from "../../drizzle/schema";
import { getDb } from "../db";

export function isEmergencyEvidenceUploadExpired(input: { phase: unknown; uploadExpiresAt: unknown; verificationLeaseUntil: unknown; createdAt: Date }, now: Date): boolean {
  if (input.phase === "verifying") {
    const leaseUntil = typeof input.verificationLeaseUntil === "string" ? Date.parse(input.verificationLeaseUntil) : 0;
    return !Number.isFinite(leaseUntil) || leaseUntil <= now.getTime();
  }
  if (input.phase !== "pending") return false;
  const expiresAt = typeof input.uploadExpiresAt === "string" ? Date.parse(input.uploadExpiresAt) : input.createdAt.getTime() + 15 * 60_000;
  return !Number.isFinite(expiresAt) || expiresAt <= now.getTime();
}

export function needsEmergencyEvidenceStagingCleanup(input: { phase: unknown; stagingCleanupPending: unknown }): boolean {
  return (input.phase === "available" || input.phase === "expired") && input.stagingCleanupPending === true;
}

/** Reconcile expired or abandoned uploads through the same fenced promotion flow as user completion. */
export async function reconcileEmergencyEvidenceUploads(batchSize = 100) {
  const now = new Date();
  const rows = await getDb().select().from(emergencyEvidenceAssets).where(sql`
    ${emergencyEvidenceAssets.caseId} IS NOT NULL AND (
      (${emergencyEvidenceAssets.chainJson}->>'phase' = 'pending' AND
        COALESCE((${emergencyEvidenceAssets.chainJson}->>'uploadExpiresAt')::timestamptz, ${emergencyEvidenceAssets.createdAt} + interval '15 minutes') <= ${now}) OR
      (${emergencyEvidenceAssets.chainJson}->>'phase' = 'verifying' AND
        COALESCE((${emergencyEvidenceAssets.chainJson}->>'verificationLeaseUntil')::timestamptz, now()) <= ${now}) OR
      (${emergencyEvidenceAssets.chainJson}->>'phase' IN ('available', 'expired') AND
        ${emergencyEvidenceAssets.chainJson}->>'stagingCleanupPending' = 'true')
    )
    AND NOT EXISTS (
      SELECT 1 FROM "emergency_legal_holds" h
      WHERE h."tenantId" = ${emergencyEvidenceAssets.tenantId}
        AND h."status" = 'active'
        AND h."caseId" = ${emergencyEvidenceAssets.caseId}
        AND (h."evidenceId" IS NULL OR h."evidenceId" = ${emergencyEvidenceAssets.id})
    )
  `).orderBy(emergencyEvidenceAssets.createdAt).limit(Math.min(5, Math.max(1, batchSize)));
  const { completeEmergencyEvidenceForRetention, reconcileEmergencyEvidenceStagingForRetention } = await import("../routes/spec260EmergencyEdge");
  const result = { inspected: rows.length, completed: 0, expired: 0, cleaned: 0, busy: 0, failed: 0 };
  for (const row of rows) {
    const chain = row.chainJson && typeof row.chainJson === "object" ? row.chainJson as Record<string, unknown> : {};
    if (needsEmergencyEvidenceStagingCleanup({ phase: chain.phase, stagingCleanupPending: chain.stagingCleanupPending })) {
      if (await reconcileEmergencyEvidenceStagingForRetention(row.tenantId, row.id).catch(() => false)) result.cleaned += 1;
      else result.failed += 1;
      continue;
    }
    const outcome = await completeEmergencyEvidenceForRetention(row.tenantId, row.id, now).catch(() => "unavailable" as const);
    if (outcome === "completed" || outcome === "duplicate") result.completed += 1;
    else if (outcome === "expired") result.expired += 1;
    else if (outcome === "busy") result.busy += 1;
    else result.failed += 1;
  }
  return result;
}
