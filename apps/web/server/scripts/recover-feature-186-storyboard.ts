import { and, eq, isNull, lte } from "drizzle-orm";

import { db, getDb } from "../db";
import { storyboardSkillRuns, storyboardSkillShots, workerJobOutbox } from "../../drizzle/schema";
import { retryStoryboardSkillShots } from "../services/storyboardSkillFrameworkService";
import { PostgresPullJobTransportAdapter } from "../services/jobTransportAdapters";
import { publishJobOutboxRow } from "../services/jobOutboxPublisher";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function assertHarnessMode(): void {
  if (process.env.FEATURE_186_POSTGRES_PULL_HARNESS !== "true" || process.env.NODE_ENV === "production") {
    throw new Error("FEATURE_186_POSTGRES_PULL_HARNESS must be explicitly enabled outside production");
  }
}

async function main(): Promise<void> {
  assertHarnessMode();
  const jobId = argument("--job-id");
  const runId = argument("--run-id");
  const shotNumber = Number(argument("--shot-number"));
  if (!/^[A-Za-z0-9_-]{1,36}$/.test(jobId) || !/^[A-Za-z0-9-]{1,64}$/.test(runId) || !Number.isInteger(shotNumber) || shotNumber < 1 || shotNumber > 12) {
    throw new Error("Invalid recovery identity");
  }

  getDb();
  const [binding] = await db.select({
    runId: storyboardSkillRuns.id,
    userId: storyboardSkillRuns.userId,
    tenantId: storyboardSkillRuns.tenantId,
    workerJobId: storyboardSkillRuns.workerJobId,
  }).from(storyboardSkillRuns).where(and(
    eq(storyboardSkillRuns.id, runId),
    eq(storyboardSkillRuns.workerJobId, jobId),
  )).limit(1);
  if (!binding) throw new Error("STORYBOARD_JOB_RUN_BINDING_NOT_FOUND");

  const [shot] = await db.select({ status: storyboardSkillShots.status, error: storyboardSkillShots.error })
    .from(storyboardSkillShots)
    .where(and(
      eq(storyboardSkillShots.runId, runId),
      eq(storyboardSkillShots.shotNumber, shotNumber),
      eq(storyboardSkillShots.tenantId, binding.tenantId),
    )).limit(1);
  if (!shot) throw new Error("STORYBOARD_SHOT_NOT_FOUND");
  const evidence = shot.error && typeof shot.error === "object" && !Array.isArray(shot.error)
    ? shot.error as Record<string, unknown>
    : {};
  if (!(["failed", "partial"] as string[]).includes(shot.status) || evidence.providerSubmissionStarted !== false) {
    throw new Error("STORYBOARD_REPAIR_REQUIRES_EXPLICIT_PRE_SUBMISSION_EVIDENCE");
  }

  const repaired = await retryStoryboardSkillShots({
    userId: binding.userId,
    tenantId: binding.tenantId,
    runId,
    shotNumbers: [shotNumber],
  });

  const now = new Date();
  const [outbox] = await db.select({
    id: workerJobOutbox.id,
    dedupeKey: workerJobOutbox.dedupeKey,
    attemptId: workerJobOutbox.attemptId,
  }).from(workerJobOutbox).where(and(
    eq(workerJobOutbox.workerJobId, jobId),
    isNull(workerJobOutbox.publishedAt),
    isNull(workerJobOutbox.cancelledAt),
    isNull(workerJobOutbox.quarantinedAt),
    lte(workerJobOutbox.nextAttemptAt, now),
  )).limit(1);
  if (!outbox) throw new Error("RECOVERY_OUTBOX_NOT_CREATED");
  const published = await publishJobOutboxRow(outbox.id, new PostgresPullJobTransportAdapter(), now);
  console.log(JSON.stringify({ jobId, runId, shotNumber, repaired, outboxId: outbox.id, dedupeKey: outbox.dedupeKey, attemptId: outbox.attemptId, published }));
}

await main();
