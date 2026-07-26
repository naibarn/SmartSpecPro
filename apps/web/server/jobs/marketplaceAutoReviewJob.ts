import crypto from "crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { signBearerToken } from "../_core/tokens";
import { getDb } from "../db";
import {
  marketplaceAutoReviewOutboxJobs,
  marketplaceAutoReviewRuns,
} from "../../drizzle/schema";
import {
  advanceMarketplaceAutoReviewRun,
  failMarketplaceAutoReviewInitialization,
  initializeMarketplaceAutoReviewRun,
  type MarketplaceAutoReviewStatus,
} from "../services/marketplaceAutoReviewService";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import {
  runHyperframesRenderWorkerOnce,
  type HyperframesWorkerRunOptions,
  type HyperframesWorkerRunResult,
} from "../workers/hyperframesRenderWorker";
import { startDetachedHyperframesRenderWorker } from "../services/backgroundWorkerProcess";

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_RUN_LIMIT = 12;
const DEFAULT_OUTBOX_LIMIT = 12;
const DEFAULT_HYPERFRAMES_WORKER_LIMIT = 25;
const ACTIVE_STATUSES: MarketplaceAutoReviewStatus[] = [
  "queued",
  "running",
  "waiting_provider",
];
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
  return process.env.USE_CLOUD_TASKS !== "true";
}

export function isMarketplaceAutoReviewAdvanceOutboxJobType(
  jobType: string
): boolean {
  return (
    MARKETPLACE_AUTO_REVIEW_ADVANCE_OUTBOX_JOB_TYPES as readonly string[]
  ).includes(jobType);
}

function createMarketplaceAutoReviewToken(input: {
  userId: number;
  tenantId: string;
  runId: string;
}): string {
  return signBearerToken(
    {
      sub: String(input.userId),
      userId: input.userId,
      tenantId: input.tenantId,
      type: "access",
      tokenUse: "marketplace_auto_review_background",
      scopes: ["media:generate"],
      jti: `marketplace_auto_review_${input.runId}_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`,
    },
    "30m"
  );
}

export async function runMarketplaceAutoReviewJob(
  options: {
    db?: any;
    limit?: number;
    outboxLimit?: number;
    hyperframesWorkerLimit?: number;
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
              sql`${marketplaceAutoReviewOutboxJobs.lockedUntil} <= ${nowIso}`
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

    const runtimeConfig = await getAppRuntimeConfig();
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
      const workerLockId = `marketplace-auto-review-job:${process.pid}`;
      let heartbeatTimer: NodeJS.Timeout | null = null;
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
                  sql`${marketplaceAutoReviewOutboxJobs.lockedUntil} <= ${nowIso}`
                )
              )
            )
          )
          .returning();
        if (!claimedJob) {
          skippedRuns += 1;
          continue;
        }
        heartbeatTimer = setInterval(() => {
          void db
            .update(marketplaceAutoReviewOutboxJobs)
            .set({
              lockedUntil: new Date(Date.now() + 5 * 60 * 1000),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(marketplaceAutoReviewOutboxJobs.id, job.id),
                eq(marketplaceAutoReviewOutboxJobs.status, "running"),
                eq(marketplaceAutoReviewOutboxJobs.lockedBy, workerLockId)
              )
            )
            .catch((error: unknown) => {
              console.warn(
                "[marketplace-auto-review] outbox heartbeat failed",
                error instanceof Error ? error.message : String(error)
              );
            });
        }, 60_000);
        heartbeatTimer.unref();
        const token = createMarketplaceAutoReviewToken({
          userId: run.userId,
          tenantId,
          runId: run.id,
        });
        const jobRuntime = {
          userToken: token,
          publicUrl: runtimeConfig.publicUrl,
          automationWorkerId: `marketplace-auto-review-outbox:${process.pid}`,
          schedulerSource: `outbox:${job.jobType}`,
        };
        if (job.jobType === "initialize_run") {
          await initializeMarketplaceAutoReviewRun(
            run.id,
            {
              userId: run.userId,
              tenantId,
            },
            jobRuntime
          );
        } else {
          await advanceMarketplaceAutoReviewRun(
            run.id,
            {
              userId: run.userId,
              tenantId,
            },
            jobRuntime
          );
        }
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
        const [updatedJob] = await db
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
        if (
          updatedJob &&
          exhausted &&
          job.jobType === "initialize_run"
        ) {
          try {
            await failMarketplaceAutoReviewInitialization(run.id, {
              userId: run.userId,
              tenantId,
            });
          } catch (markError) {
            console.error(
              "[marketplace-auto-review] failed to persist exhausted initialization",
              markError instanceof Error ? markError.message : String(markError)
            );
          }
        }
        errors.push({ runId: run.id, message });
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
      }
    }

    for (const run of runs) {
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
        const token = createMarketplaceAutoReviewToken({
          userId: run.userId,
          tenantId,
          runId: run.id,
        });
        await advanceMarketplaceAutoReviewRun(
          run.id,
          {
            userId: run.userId,
            tenantId,
          },
          {
            userToken: token,
            publicUrl: runtimeConfig.publicUrl,
            automationWorkerId: `marketplace-auto-review-job:${process.pid}`,
            schedulerSource: getSchedulerMode(),
          }
        );
        advancedRuns += 1;
      } catch (error) {
        errors.push({
          runId: run.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
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

export async function initializeMarketplaceAutoReviewJob(): Promise<void> {
  if (intervalId) return;
  if (!shouldUseInProcessInterval()) {
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
