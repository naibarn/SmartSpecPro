import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { getDb } from "../db";
import {
  marketplaceAutoReviewOutboxJobs,
  marketplaceAutoReviewRuns,
  workerJobs,
} from "../../drizzle/schema";
import {
  failMarketplaceAutoReviewInitialization,
  queueMarketplaceAutoReviewAdvance,
  startMarketplaceAutoReviewDraftQualityQc,
  MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_EDIT_RECONCILIATION_JOB_TYPE,
  type MarketplaceAutoReviewStatus,
} from "../services/marketplaceAutoReviewService";
import {
  enqueueMarketplaceAutoReviewWorkerJob,
  findMarketplaceAutoReviewWorkerJobByIdempotencyKey,
  marketplaceAutoReviewOperationFromLegacyJobType,
} from "../services/marketplaceAutoReviewWorkerJob";
import {
  runHyperframesRenderWorkerOnce,
  type HyperframesWorkerRunOptions,
  type HyperframesWorkerRunResult,
} from "../workers/hyperframesRenderWorker";
import { startDetachedHyperframesRenderWorker } from "../services/backgroundWorkerProcess";
import { isFeature186HardCutoverEnabled } from "../services/cloudflareRuntimeTarget";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_RUN_LIMIT = 12;
const DEFAULT_OUTBOX_LIMIT = 12;
const DEFAULT_HYPERFRAMES_WORKER_LIMIT = 25;
const ACTIVE_STATUSES: MarketplaceAutoReviewStatus[] = [
  "queued",
  "running",
  "waiting_provider",
];

function stagedProviderPollTargets(metadataValue: unknown) {
  const metadata =
    metadataValue &&
    typeof metadataValue === "object" &&
    !Array.isArray(metadataValue)
      ? (metadataValue as Record<string, any>)
      : {};
  const storyboard = metadata.stagedSequentialStoryboard;
  const shots = Array.isArray(storyboard?.shots) ? storyboard.shots : [];
  const pipeline = metadata.stagedPipeline;
  const tasks =
    pipeline?.tasks &&
    typeof pipeline.tasks === "object" &&
    !Array.isArray(pipeline.tasks)
      ? pipeline.tasks
      : {};

  return shots.flatMap((shot: any) => {
    const shotId = Number(shot?.shotId);
    if (!Number.isInteger(shotId) || shotId < 1) return [];
    return (["image", "video"] as const).flatMap(stage => {
      const task = tasks[`${stage}:${shotId}`];
      const taskId = typeof task?.taskId === "string" ? task.taskId.trim() : "";
      const status = typeof task?.status === "string" ? task.status : "";
      const hasArtifact =
        stage === "image"
          ? Boolean(shot.imageArtifactHash || shot.imageArtifactUrl)
          : Boolean(shot.videoArtifactHash || shot.videoArtifactUrl);
      if (!taskId || hasArtifact || ["failed", "cancelled"].includes(status)) {
        return [];
      }
      const submittedAt = Date.parse(
        typeof task.submittedAt === "string"
          ? task.submittedAt
          : typeof task.createdAt === "string"
            ? task.createdAt
            : ""
      );
      return [{ shotId, stage, taskId, submittedAt }];
    });
  });
}
const READY_OUTBOX_STATUSES = ["queued", "retry"] as const;
const HYPERFRAMES_OUTBOX_JOB_TYPES = [
  "hyperframes_asset_stage",
  "hyperframes_lint",
  "hyperframes_snapshot",
  "hyperframes_render",
  "hyperframes_inspect",
  "hyperframes_finalize",
] as const;
export const MARKETPLACE_AUTO_REVIEW_ADVANCE_OUTBOX_JOB_TYPES = [
  "initialize_run",
  "advance_run",
  "provider_reconciliation_recovery",
  "draft_quality_qc",
  MARKETPLACE_AUTO_REVIEW_SEQUENTIAL_IMAGE_EDIT_RECONCILIATION_JOB_TYPE,
] as const;
const SCHEDULER_MODES = ["auto", "interval", "external"] as const;

let intervalId: NodeJS.Timeout | null = null;
let inFlight = false;

function getIntervalMs(): number {
  const parsed = Number(process.env.MARKETPLACE_AUTO_REVIEW_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 15_000
    ? parsed
    : DEFAULT_INTERVAL_MS;
}

function isJobEnabled(): boolean {
  return process.env.MARKETPLACE_AUTO_REVIEW_JOB_ENABLED !== "false";
}

function getSchedulerMode(): (typeof SCHEDULER_MODES)[number] {
  const raw = process.env.MARKETPLACE_AUTO_REVIEW_SCHEDULER_MODE;
  if (raw && (SCHEDULER_MODES as readonly string[]).includes(raw)) {
    return raw as (typeof SCHEDULER_MODES)[number];
  }
  return "auto";
}

function shouldUseInProcessInterval(): boolean {
  const mode = getSchedulerMode();
  if (mode === "interval") return true;
  if (mode === "external") return false;
  return !isFeature186HardCutoverEnabled();
}

export function isMarketplaceAutoReviewAdvanceOutboxJobType(
  jobType: string
): boolean {
  return (
    MARKETPLACE_AUTO_REVIEW_ADVANCE_OUTBOX_JOB_TYPES as readonly string[]
  ).includes(jobType);
}

export async function runMarketplaceAutoReviewJob(
  options: {
    db?: any;
    limit?: number;
    outboxLimit?: number;
    hyperframesWorkerLimit?: number;
    queueBridgeOnly?: boolean;
    runHyperframesWorker?: (
      options?: HyperframesWorkerRunOptions
    ) => Promise<HyperframesWorkerRunResult>;
  } = {}
): Promise<{
  scannedRuns: number;
  advancedRuns: number;
  processedOutboxJobs: number;
  processedHyperframesJobs: number;
  hyperframesRuntimeDeferred: boolean;
  hyperframesWorkerDisabled: boolean;
  skippedRuns: number;
  errors: Array<{ runId: string; message: string }>;
}> {
  if (inFlight) {
    return {
      scannedRuns: 0,
      advancedRuns: 0,
      processedOutboxJobs: 0,
      processedHyperframesJobs: 0,
      hyperframesRuntimeDeferred: false,
      hyperframesWorkerDisabled: false,
      skippedRuns: 0,
      errors: [],
    };
  }

  inFlight = true;
  try {
    const db = options.db ?? (await getDb());
    if (!db)
      return {
        scannedRuns: 0,
        advancedRuns: 0,
        processedOutboxJobs: 0,
        processedHyperframesJobs: 0,
        hyperframesRuntimeDeferred: false,
        hyperframesWorkerDisabled: false,
        skippedRuns: 0,
        errors: [],
      };

    const now = new Date();
    const nowIso = now.toISOString();
    const outboxJobs = await db
      .select()
      .from(marketplaceAutoReviewOutboxJobs)
      .where(
        and(
          or(
            inArray(marketplaceAutoReviewOutboxJobs.status, [
              ...READY_OUTBOX_STATUSES,
            ]),
            and(
              eq(marketplaceAutoReviewOutboxJobs.status, "running"),
              or(
                isNull(marketplaceAutoReviewOutboxJobs.lockedUntil),
                sql`${marketplaceAutoReviewOutboxJobs.lockedUntil} <= ${nowIso}`
              )
            )
          ),
          inArray(marketplaceAutoReviewOutboxJobs.jobType, [
            ...MARKETPLACE_AUTO_REVIEW_ADVANCE_OUTBOX_JOB_TYPES,
          ]),
          sql`${marketplaceAutoReviewOutboxJobs.scheduledAt} <= ${nowIso}`
        )
      )
      .orderBy(
        asc(marketplaceAutoReviewOutboxJobs.priority),
        asc(marketplaceAutoReviewOutboxJobs.scheduledAt)
      )
      .limit(
        Math.min(Math.max(options.outboxLimit ?? DEFAULT_OUTBOX_LIMIT, 1), 50)
      );
    const runs = await db
      .select()
      .from(marketplaceAutoReviewRuns)
      .where(inArray(marketplaceAutoReviewRuns.status, ACTIVE_STATUSES))
      .orderBy(asc(marketplaceAutoReviewRuns.updatedAt))
      .limit(Math.min(Math.max(options.limit ?? DEFAULT_RUN_LIMIT, 1), 50));

    let advancedRuns = 0;
    let processedOutboxJobs = 0;
    let processedHyperframesJobs = 0;
    let hyperframesRuntimeDeferred = false;
    let hyperframesWorkerDisabled = false;
    let skippedRuns = 0;
    const errors: Array<{ runId: string; message: string }> = [];

    for (const job of outboxJobs) {
      const [run] = await db
        .select()
        .from(marketplaceAutoReviewRuns)
        .where(eq(marketplaceAutoReviewRuns.id, job.runId))
        .limit(1);
      if (!run) {
        await db
          .update(marketplaceAutoReviewOutboxJobs)
          .set({
            status: "discarded",
            lastError: "run_not_found",
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(marketplaceAutoReviewOutboxJobs.id, job.id));
        skippedRuns += 1;
        continue;
      }
      const tenantId = String(run.tenantId ?? job.tenantId ?? "").trim();
      if (!tenantId) {
        await db
          .update(marketplaceAutoReviewOutboxJobs)
          .set({
            status: "failed",
            lastError: "missing_tenant_id",
            updatedAt: now,
          })
          .where(eq(marketplaceAutoReviewOutboxJobs.id, job.id));
        skippedRuns += 1;
        errors.push({
          runId: run.id,
          message:
            "Missing tenantId; cannot process Marketplace Auto Review outbox job.",
        });
        continue;
      }
      const workerLockId = `marketplace-auto-review-job:${process.pid}:${job.id}`;
      try {
        const [claimedJob] = await db
          .update(marketplaceAutoReviewOutboxJobs)
          .set({
            status: "running",
            lockedBy: workerLockId,
            lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
            attempts: Number(job.attempts ?? 0) + 1,
            updatedAt: now,
          })
          .where(
            and(
              eq(marketplaceAutoReviewOutboxJobs.id, job.id),
              or(
                inArray(marketplaceAutoReviewOutboxJobs.status, [
                  ...READY_OUTBOX_STATUSES,
                ]),
                and(
                  eq(marketplaceAutoReviewOutboxJobs.status, "running"),
                  or(
                    isNull(marketplaceAutoReviewOutboxJobs.lockedUntil),
                    sql`${marketplaceAutoReviewOutboxJobs.lockedUntil} <= ${nowIso}`
                  )
                )
              )
            )
          )
          .returning();
        if (!claimedJob) {
          skippedRuns += 1;
          continue;
        }
        const payload = {
          ...((job.payloadJson ?? {}) as Record<string, unknown>),
          runId: run.id,
          requestIdempotencyKey: job.idempotencyKey,
        };
        const operation = marketplaceAutoReviewOperationFromLegacyJobType(
          job.jobType,
          payload
        );
        if (!operation) {
          await db
            .update(marketplaceAutoReviewOutboxJobs)
            .set({
              status: "failed",
              lastError: "unsupported_legacy_job_type",
              lockedBy: null,
              lockedUntil: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(marketplaceAutoReviewOutboxJobs.id, job.id),
                eq(marketplaceAutoReviewOutboxJobs.status, "running"),
                eq(marketplaceAutoReviewOutboxJobs.lockedBy, workerLockId)
              )
            );
          skippedRuns += 1;
          continue;
        }
        await enqueueMarketplaceAutoReviewWorkerJob({
          tenantId,
          userId: run.userId,
          runId: run.id,
          operation,
          idempotencyKey: String(job.idempotencyKey || `legacy:${job.id}`),
          priority: Number(job.priority ?? 30),
          scheduledAt: job.scheduledAt ? new Date(job.scheduledAt) : now,
        });
        await db
          .update(marketplaceAutoReviewOutboxJobs)
          .set({
            status: "completed",
            completedAt: new Date(),
            lockedBy: null,
            lockedUntil: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(marketplaceAutoReviewOutboxJobs.id, job.id),
              eq(marketplaceAutoReviewOutboxJobs.status, "running"),
              eq(marketplaceAutoReviewOutboxJobs.lockedBy, workerLockId)
            )
          );
        processedOutboxJobs += 1;
      } catch (error) {
        const attempts = Number(job.attempts ?? 0) + 1;
        const exhausted = attempts >= Number(job.maxAttempts ?? 3);
        const message = error instanceof Error ? error.message : String(error);
        await db
          .update(marketplaceAutoReviewOutboxJobs)
          .set({
            status: exhausted ? "failed" : "retry",
            lastError: message,
            lockedBy: null,
            lockedUntil: null,
            scheduledAt: exhausted
              ? now
              : new Date(Date.now() + Math.min(30 * 60_000, attempts * 60_000)),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(marketplaceAutoReviewOutboxJobs.id, job.id),
              eq(marketplaceAutoReviewOutboxJobs.status, "running"),
              eq(marketplaceAutoReviewOutboxJobs.lockedBy, workerLockId)
            )
          )
          .returning({ id: marketplaceAutoReviewOutboxJobs.id });
        errors.push({ runId: run.id, message });
      }
    }

    for (const run of runs) {
      // Yield to the Event Loop between processing runs so HTTP I/O is never blocked
      await new Promise(resolve => setImmediate(resolve));
      const tenantId = String(run.tenantId ?? "").trim();
      if (!tenantId) {
        skippedRuns += 1;
        errors.push({
          runId: run.id,
          message: "Missing tenantId; cannot advance durable media workflow.",
        });
        continue;
      }
      try {
        const metadata =
          run.metadataJson && typeof run.metadataJson === "object"
            ? (run.metadataJson as Record<string, any>)
            : {};
        const initialization =
          metadata.initializationControl &&
          typeof metadata.initializationControl === "object"
            ? metadata.initializationControl
            : {};
        const planReview =
          metadata.planReview && typeof metadata.planReview === "object"
            ? metadata.planReview
            : {};
        const awaitingPlanReview = planReview.status === "awaiting";
        const creativeQc =
          metadata.creativeQc && typeof metadata.creativeQc === "object"
            ? metadata.creativeQc
            : {};
        if (
          ["queued", "running"].includes(String(creativeQc.status)) ||
          ["queued", "running"].includes(String(creativeQc.repairStatus))
        ) {
          try {
            await startMarketplaceAutoReviewDraftQualityQc(
              { runId: run.id },
              { userId: run.userId, tenantId }
            );
          } catch (qcError) {
            const message =
              qcError instanceof Error ? qcError.message : String(qcError);
            console.warn(
              `[marketplace-auto-review] optional QC recovery failed for run ${run.id}; continuing workflow: ${message}`
            );
            errors.push({ runId: run.id, message: `optional_qc: ${message}` });
          }
        }
        if (["queued", "running"].includes(String(initialization.status))) {
          const initializationKey = `marketplace-auto-review:${run.id}:initialize:v1`;
          const initializationJob =
            await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
              db,
              tenantId,
              initializationKey
            );
          if (
            initializationJob &&
            ["failed", "cancelled"].includes(String(initializationJob.status))
          ) {
            await failMarketplaceAutoReviewInitialization(run.id, {
              userId: run.userId,
              tenantId,
            });
            skippedRuns += 1;
            continue;
          }
          const stagedPipeline = metadata.stagedPipeline;
          const stagedStoryboard = metadata.stagedSequentialStoryboard;
          const hasStagedInitializationState =
            metadata.planningArchitecture === "staged_two_skill_v2" &&
            stagedPipeline &&
            typeof stagedPipeline === "object" &&
            !Array.isArray(stagedPipeline) &&
            stagedStoryboard &&
            typeof stagedStoryboard === "object" &&
            !Array.isArray(stagedStoryboard);
          if (
            initializationJob?.status === "succeeded" &&
            hasStagedInitializationState
          ) {
            const nextMetadata = {
              ...metadata,
              initializationControl: {
                ...initialization,
                schemaVersion: 1,
                status: "completed",
                completedAt: new Date().toISOString(),
              },
            };
            const [updatedRun] = await db
              .update(marketplaceAutoReviewRuns)
              .set({ metadataJson: nextMetadata, updatedAt: new Date() })
              .where(
                and(
                  eq(marketplaceAutoReviewRuns.id, run.id),
                  eq(marketplaceAutoReviewRuns.updatedAt, run.updatedAt)
                )
              )
              .returning({ id: marketplaceAutoReviewRuns.id });
            if (!updatedRun) {
              skippedRuns += 1;
              continue;
            }
            if (
              !awaitingPlanReview &&
              metadata.planningArchitecture !== "staged_two_skill_v2"
            ) {
              await queueMarketplaceAutoReviewAdvance(
                run.id,
                { userId: run.userId, tenantId },
                {
                  schedulerSource: `marketplace-auto-review-recovery:${getSchedulerMode()}`,
                },
                5_000
              );
            }
          } else if (initializationJob?.status === "succeeded") {
            skippedRuns += 1;
            errors.push({
              runId: run.id,
              message:
                "Initialization job succeeded but the staged review state is missing; refusing to restart initialization automatically.",
            });
            continue;
          } else {
            await enqueueMarketplaceAutoReviewWorkerJob({
              tenantId,
              userId: run.userId,
              runId: run.id,
              operation: { operation: "initialize_run", runId: run.id },
              idempotencyKey: initializationKey,
              priority: 20,
            });
          }
        } else if (awaitingPlanReview) {
          // The text/story checkpoint is intentionally user-driven. Do not
          // flood worker_jobs with no-op advance jobs while the user reviews it.
          skippedRuns += 1;
          continue;
        } else if (metadata.planningArchitecture === "staged_two_skill_v2") {
          // User decisions stay user-triggered, but an already-submitted media
          // task needs a durable poll even when its review page is closed. The
          // provider result is reconciled by the normal staged advance path;
          // this only schedules that read/reconcile pass for affected shots.
          const pollTargets = stagedProviderPollTargets(metadata);
          if (pollTargets.length === 0) {
            skippedRuns += 1;
            continue;
          }
          const targetShotIds = [
            ...new Set(pollTargets.map(target => target.shotId)),
          ].sort((a, b) => a - b);
          const taskFingerprint = createHash("sha256")
            .update(
              pollTargets
                .map(
                  target => `${target.stage}:${target.shotId}:${target.taskId}`
                )
                .sort()
                .join("|")
            )
            .digest("hex")
            .slice(0, 16);
          const oldestSubmittedAt = Math.min(
            ...pollTargets
              .map(target => target.submittedAt)
              .filter(Number.isFinite)
          );
          const ageMs = Number.isFinite(oldestSubmittedAt)
            ? Math.max(0, now.getTime() - oldestSubmittedAt)
            : 0;
          const pollIntervalMs =
            ageMs < 10 * 60_000
              ? 60_000
              : ageMs < 60 * 60_000
                ? 5 * 60_000
                : 15 * 60_000;
          const pollBucket = Math.floor(now.getTime() / pollIntervalMs);
          const operationId = `staged_provider_poll:${pollIntervalMs}:${pollBucket}:${taskFingerprint}`;
          const [activeAdvanceJob] = await db
            .select({ id: workerJobs.id })
            .from(workerJobs)
            .where(
              and(
                eq(workerJobs.tenantId, tenantId),
                eq(workerJobs.jobType, "marketplace.auto_review.execute"),
                inArray(workerJobs.status, [
                  "pending",
                  "queued",
                  "leased",
                  "claimed",
                  "preparing",
                  "running",
                  "waiting_external",
                  "retry_scheduled",
                ] as any),
                sql`${workerJobs.inputJson}->>'runId' = ${run.id}`,
                sql`${workerJobs.inputJson}->>'operation' = ${"advance_run"}`
              )
            )
            .limit(1);
          if (activeAdvanceJob) {
            skippedRuns += 1;
            continue;
          }
          await enqueueMarketplaceAutoReviewWorkerJob({
            tenantId,
            userId: run.userId,
            runId: run.id,
            operation: {
              operation: "advance_run",
              runId: run.id,
              targetShotIds,
              operationId,
            },
            idempotencyKey: `marketplace-auto-review:${run.id}:provider-poll:${taskFingerprint}:${pollIntervalMs}:${pollBucket}`,
            priority: 45,
            scheduledAt: now,
          });
        } else {
          await queueMarketplaceAutoReviewAdvance(
            run.id,
            { userId: run.userId, tenantId },
            { schedulerSource: `marketplace-auto-review-recovery:${getSchedulerMode()}` },
            5_000
          );
        }
        advancedRuns += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // The tick log only prints `errors.length`, so a run failing every
        // sweep was invisible without attaching a debugger. Log the actual
        // message once per occurrence (2026-07-31 diagnosis aid).
        console.warn(
          `[marketplace-auto-review] advance failed for run ${run.id}: ${message}`
        );
        errors.push({ runId: run.id, message });
      }
    }

    if (options.queueBridgeOnly) {
      return {
        scannedRuns: runs.length,
        advancedRuns,
        processedOutboxJobs,
        processedHyperframesJobs: 0,
        hyperframesRuntimeDeferred: false,
        hyperframesWorkerDisabled: false,
        skippedRuns,
        errors,
      };
    }

    try {
      const hyperframesLimit = Math.min(
        Math.max(
          options.hyperframesWorkerLimit ?? DEFAULT_HYPERFRAMES_WORKER_LIMIT,
          1
        ),
        25
      );
      if (options.runHyperframesWorker) {
        const hyperframesResult = await options.runHyperframesWorker({
          limit: hyperframesLimit,
          now,
        });
        processedHyperframesJobs = hyperframesResult.processed;
        hyperframesRuntimeDeferred = hyperframesResult.runtimeDeferred;
        hyperframesWorkerDisabled = hyperframesResult.disabled;
      } else {
        const dueHyperframesJobs = await db
          .select({ id: marketplaceAutoReviewOutboxJobs.id })
          .from(marketplaceAutoReviewOutboxJobs)
          .where(
            and(
              inArray(marketplaceAutoReviewOutboxJobs.jobType, [
                ...HYPERFRAMES_OUTBOX_JOB_TYPES,
              ]),
              or(
                inArray(marketplaceAutoReviewOutboxJobs.status, [
                  ...READY_OUTBOX_STATUSES,
                ]),
                and(
                  eq(marketplaceAutoReviewOutboxJobs.status, "running"),
                  sql`${marketplaceAutoReviewOutboxJobs.lockedUntil} <= ${nowIso}`
                )
              ),
              sql`${marketplaceAutoReviewOutboxJobs.scheduledAt} <= ${nowIso}`
            )
          )
          .orderBy(
            asc(marketplaceAutoReviewOutboxJobs.priority),
            asc(marketplaceAutoReviewOutboxJobs.scheduledAt)
          )
          .limit(1);
        if (dueHyperframesJobs.length > 0) {
          startDetachedHyperframesRenderWorker({ limit: hyperframesLimit });
        }
      }
    } catch (error) {
      errors.push({
        runId: "hyperframes_worker",
        message: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      scannedRuns: runs.length,
      advancedRuns,
      processedOutboxJobs,
      processedHyperframesJobs,
      hyperframesRuntimeDeferred,
      hyperframesWorkerDisabled,
      skippedRuns,
      errors,
    };
  } finally {
    inFlight = false;
  }
}

async function tick(): Promise<void> {
  if (!isJobEnabled()) return;
  try {
    const result = await runMarketplaceAutoReviewJob();
    if (
      result.scannedRuns > 0 ||
      result.processedHyperframesJobs > 0 ||
      result.hyperframesRuntimeDeferred ||
      result.errors.length > 0
    ) {
      console.log(
        `[marketplace-auto-review] scanned=${result.scannedRuns} advanced=${result.advancedRuns} outbox=${result.processedOutboxJobs} hyperframes=${result.processedHyperframesJobs} hyperframesDeferred=${result.hyperframesRuntimeDeferred} skipped=${result.skippedRuns} errors=${result.errors.length}`
      );
    }
  } catch (error) {
    console.error(
      "[marketplace-auto-review] Job failed:",
      error instanceof Error ? error.message : error
    );
  }
}

async function tickWorkerQueueBridge(): Promise<void> {
  if (!isJobEnabled()) return;
  try {
    const result = await runMarketplaceAutoReviewJob({ queueBridgeOnly: true });
    if (
      result.scannedRuns > 0 ||
      result.advancedRuns > 0 ||
      result.processedOutboxJobs > 0 ||
      result.errors.length > 0
    ) {
      console.info(
        `[marketplace-auto-review] worker queue bridge runs=${result.scannedRuns} advanced=${result.advancedRuns} outbox=${result.processedOutboxJobs} skipped=${result.skippedRuns} errors=${result.errors.length}`
      );
    }
  } catch (error) {
    console.error(
      "[marketplace-auto-review] worker queue bridge failed:",
      error instanceof Error ? error.message : error
    );
  }
}

export async function initializeMarketplaceAutoReviewJob(): Promise<void> {
  if (intervalId) return;
  if (!shouldUseInProcessInterval()) {
    if (isFeature186HardCutoverEnabled()) {
      console.log(
        "[marketplace-auto-review] Stage execution stays on worker_jobs; starting the legacy outbox queue bridge."
      );
      await tickWorkerQueueBridge();
      intervalId = setInterval(() => {
        void tickWorkerQueueBridge();
      }, getIntervalMs());
      intervalId.unref?.();
      return;
    }
    console.log(
      "[marketplace-auto-review] In-process interval disabled; use an external scheduler to advance active auto-review runs."
    );
    return;
  }
  await tick();
  intervalId = setInterval(() => {
    void tick();
  }, getIntervalMs());
  intervalId.unref?.();
}

export function shutdownMarketplaceAutoReviewJob(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
