import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { sandboxJobs } from "../../drizzle/schema";
import { refundCredits } from "./creditService";

const TERMINAL_FAILURE_STATUSES = ["failed", "timed_out", "canceled"] as const;

/**
 * Reverse fixed-credit skill settlements for terminal sandbox failures even
 * when the caller never polls the job status endpoint.
 */
export async function reconcileTerminalSkillSandboxJobs(options?: {
  limit?: number;
}): Promise<{ scanned: number; reversed: number; failed: number }> {
  let db;
  try {
    db = await getDb();
  } catch {
    // Billing-job startup must remain safe when the database is intentionally
    // unavailable (for example, during local build/test or maintenance).
    return { scanned: 0, reversed: 0, failed: 0 };
  }
  if (!db) return { scanned: 0, reversed: 0, failed: 0 };

  const rows = await db
    .select({
      id: sandboxJobs.id,
      userId: sandboxJobs.userId,
      tenantId: sandboxJobs.tenantId,
      status: sandboxJobs.status,
      idempotencyKey: sandboxJobs.idempotencyKey,
    })
    .from(sandboxJobs)
    .where(and(
      eq(sandboxJobs.featureType, "skill"),
      inArray(sandboxJobs.status, TERMINAL_FAILURE_STATUSES),
      isNotNull(sandboxJobs.idempotencyKey),
    ))
    .orderBy(desc(sandboxJobs.updatedAt))
    .limit(options?.limit ?? 100);

  const results = await Promise.allSettled(rows.map(async (row) => {
    await refundCredits({
      userId: row.userId,
      amount: 0,
      description: `Sandbox skill run failed: ${row.id}`,
      idempotencyKey: `skill:${row.idempotencyKey}:sandbox-refund`,
      sourceType: "skill",
      skillRunId: row.idempotencyKey!,
      tenantId: row.tenantId,
      metadata: {
        sandboxJobId: row.id,
        status: row.status,
        type: "sandbox_skill_failed_refund",
      },
    });
  }));

  return {
    scanned: rows.length,
    reversed: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
