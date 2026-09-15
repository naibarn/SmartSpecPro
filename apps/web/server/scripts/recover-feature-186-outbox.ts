import { and, eq, isNull, lte } from "drizzle-orm";

import { db, getDb } from "../db";
import { workerJobOutbox, workerJobs } from "../../drizzle/schema";
import { PostgresPullJobTransportAdapter } from "../services/jobTransportAdapters";
import { publishJobOutboxRow } from "../services/jobOutboxPublisher";

function requiredJobId(): string {
  const index = process.argv.indexOf("--job-id");
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value || !/^[A-Za-z0-9_-]{1,36}$/.test(value)) {
    throw new Error("Usage: pnpm exec tsx server/scripts/recover-feature-186-outbox.ts --job-id <canonical-job-id>");
  }
  return value;
}

function assertHarnessMode(): void {
  if (process.env.FEATURE_186_HARD_CUTOVER !== "true") {
    throw new Error("FEATURE_186_HARD_CUTOVER must be true");
  }
  if (process.env.FEATURE_186_POSTGRES_PULL_HARNESS !== "true" || process.env.NODE_ENV === "production") {
    throw new Error("FEATURE_186_POSTGRES_PULL_HARNESS must be explicitly enabled outside production");
  }
}

async function main(): Promise<void> {
  assertHarnessMode();
  const jobId = requiredJobId();
  getDb();
  const now = new Date();
  const [job] = await db.select({
    id: workerJobs.id,
    jobType: workerJobs.jobType,
    status: workerJobs.status,
    operatorReviewRequired: workerJobs.operatorReviewRequired,
  }).from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
  if (!job) throw new Error("CANONICAL_JOB_NOT_FOUND");
  if (job.jobType !== "storyboard.skill.run") throw new Error("RECOVERY_JOB_TYPE_NOT_ALLOWED");
  if (!(["queued", "retry_scheduled"] as string[]).includes(job.status)) throw new Error("RECOVERY_JOB_NOT_QUEUED");
  if (job.operatorReviewRequired) throw new Error("RECOVERY_JOB_REQUIRES_OPERATOR_REVIEW");

  const [outbox] = await db.select({
    id: workerJobOutbox.id,
    dedupeKey: workerJobOutbox.dedupeKey,
    attemptId: workerJobOutbox.attemptId,
    nextAttemptAt: workerJobOutbox.nextAttemptAt,
  }).from(workerJobOutbox).where(and(
    eq(workerJobOutbox.workerJobId, jobId),
    isNull(workerJobOutbox.publishedAt),
    isNull(workerJobOutbox.cancelledAt),
    isNull(workerJobOutbox.quarantinedAt),
    lte(workerJobOutbox.nextAttemptAt, now),
  )).limit(1);
  if (!outbox) throw new Error("DUE_UNPUBLISHED_OUTBOX_NOT_FOUND");

  const result = await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter(), now);
  console.log(JSON.stringify({
    jobId,
    outboxId: outbox.id,
    dedupeKey: outbox.dedupeKey,
    attemptId: outbox.attemptId,
    result,
  }));
}

await main();
