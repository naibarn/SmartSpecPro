import { sql } from "drizzle-orm";

export const MARKETPLACE_AUTO_REVIEW_WORKER_JOB_TYPE = "marketplace.auto_review.execute";

export function marketplaceAutoReviewWorkerSlots(): number {
  const configured = Number(process.env.MARKETPLACE_AUTO_REVIEW_WORKER_SLOTS);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 3;
}

export const activeMarketplaceAutoReviewJobs = sql`
  SELECT "tenantId", "inputJson"->>'runId' AS "runId"
  FROM "worker_jobs"
  WHERE "jobType" = ${MARKETPLACE_AUTO_REVIEW_WORKER_JOB_TYPE}
    AND "runtimeType" = 'node_job_worker'
    AND "status" IN ('leased', 'claimed', 'preparing', 'running', 'uploading', 'publishing', 'indexing')
`;

/** Check and claim in the same transaction, including across Node workers. */
export async function hasMarketplaceAutoReviewExecutionSlot(
  tx: { execute: (query: ReturnType<typeof sql>) => PromiseLike<unknown> },
  job: { tenantId: string | null; inputJson: Record<string, unknown> }
): Promise<boolean> {
  const [lock] = (await tx.execute(sql`
    SELECT pg_try_advisory_xact_lock(hashtextextended('marketplace-auto-review:claim', 0)) AS "acquired"
  `)) as Array<{ acquired: boolean }>;
  if (!lock?.acquired) return false;

  const activeJobs = (await tx.execute(activeMarketplaceAutoReviewJobs)) as Array<{
    tenantId: string | null;
    runId: string | null;
  }>;
  return activeJobs.length < marketplaceAutoReviewWorkerSlots() &&
    !activeJobs.some(active =>
      active.tenantId === job.tenantId && active.runId === job.inputJson.runId
    );
}
