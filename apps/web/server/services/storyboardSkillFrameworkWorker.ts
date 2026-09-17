import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  mediaAssets,
  storyboardSkillProjects,
  storyboardSkillRuns,
  storyboardSkillShots,
} from "../../drizzle/schema";
import { createInternalTokenFromAuth } from "../_core/tokens";
import { getCachedPublicAppUrl } from "./appRuntimeConfig";
import { deductCredits } from "./creditService";
import { durabilizeMediaGenerationResponse } from "./durableMediaAssetService";
import {
  mediaGenerationService,
  resolveExternalMediaReferenceUrls,
} from "./mediaGenerationService";
import {
  buildStoryboardVideoPrompt,
  ensureStoryboardSingleImagePrompt,
  planStoryboardShots,
} from "./storyboardSkillFrameworkPipeline";
import {
  classifyStoryboardGenerationError,
  escalateStoryboardProviderFailure,
  isStoryboardExecutionStopped,
  isReusableStoryboardImage,
  optimizeStoryboardPromptForConstraint,
  normalizeStoryboardReferenceValue,
  type StoryboardGlobalInput,
} from "./storyboardSkillFrameworkContracts";
import type { JobControlPlane } from "./jobControlPlane";
import type { JobExecutorContext } from "./jobExecutor";
import type {
  JobReporter,
  LeaseContext,
  JobResult,
} from "./jobControlPlaneTypes";

const STORYBOARD_IMAGE_CREDIT_COST = 1;
const PAUSED_RESUME_AFTER = "9999-12-31T00:00:00.000Z";

type WorkerInput = {
  runId: string;
  context: JobExecutorContext;
  lease: LeaseContext;
  reporter: JobReporter;
  controlPlane: JobControlPlane;
};

type StoryboardWorkerScope = {
  tenantId: string;
  userId: number;
};

const STORYBOARD_JOB_RETRY_POLICY = {
  maxAttempts: 12,
  baseDelayMs: 5_000,
  maxDelayMs: 120_000,
  jitter: "bounded" as const,
  deadlineMs: 7 * 24 * 60 * 60 * 1000,
  allowedErrorClasses: ["retryable", "timeout", "unavailable"],
};

const STORYBOARD_JOB_TIMEOUT_POLICY = {
  softTimeoutMs: 30 * 60_000,
  hardTimeoutMs: 24 * 60 * 60_000,
};

async function reportShotStage(input: {
  reporter: JobReporter;
  lease: LeaseContext;
  shotNumber: number;
  totalShots: number;
  stage: string;
  message: string;
  measured?: Record<string, number | string | boolean>;
}): Promise<void> {
  await input.reporter.progress(input.lease, {
    progress: Math.round(((input.shotNumber - 1) / input.totalShots) * 100),
    stage: `shot_${input.shotNumber}:${input.stage}`,
    message: input.message,
    measured: input.measured,
  });
}

async function withLeaseHeartbeat<T>(input: {
  lease: LeaseContext;
  reporter: JobReporter;
  operation: () => Promise<T>;
}): Promise<T> {
  let heartbeatError: unknown;
  const timer = setInterval(() => {
    void input.reporter.heartbeat(input.lease).catch(error => {
      heartbeatError ??= error;
    });
  }, 10_000);
  try {
    const result = await input.operation();
    if (heartbeatError) throw heartbeatError;
    return result;
  } finally {
    clearInterval(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function settleStoppedStoryboardRun(input: {
  controlPlane: JobControlPlane;
  reporter: JobReporter;
  lease: LeaseContext;
  runId: string;
  runStatus: string | null | undefined;
  operationKey: string;
  output?: Record<string, unknown>;
}): Promise<JobResult> {
  const output = input.output ?? {};
  if (!input.runStatus || input.runStatus === "cancel_requested" || input.runStatus === "cancelled") {
    await input.controlPlane.cancel(input.lease.jobId, input.runStatus === "cancel_requested" ? "storyboard_cancel_requested" : "storyboard_cancelled");
    return {
      deferred: true,
      output: { ...output, runId: input.runId, status: "cancelled" },
    };
  }
  await input.reporter.waitForExternal(input.lease, {
    operationKey: input.operationKey,
    resumeAfter: PAUSED_RESUME_AFTER,
  });
  return {
    deferred: true,
    output: { ...output, runId: input.runId, status: "paused" },
  };
}

function referenceAssetIds(global: StoryboardGlobalInput): string[] {
  const refs = Array.isArray(global.skillInputs.character_reference_images)
    ? global.skillInputs.character_reference_images
    : [];
  return refs
    .filter((value): value is Record<string, unknown> =>
      Boolean(value && typeof value === "object")
    )
    .map(value => String(value.asset_id ?? value.assetId ?? "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

async function resolveReferenceUrls(input: {
  tenantId: string;
  userId: number;
  assetIds: string[];
}): Promise<string[]> {
  const db = await getDb();
  if (input.assetIds.length === 0) return [];
  if (!db) throw new Error("STORYBOARD_REFERENCE_STORAGE_UNAVAILABLE");
  const numericInputs = input.assetIds.filter(value => {
    if (!/^\d+$/.test(value)) return false;
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) && numeric > 0;
  });
  const numericIds = numericInputs.map(value => Number(value));
  const rows =
    numericIds.length > 0
      ? await db
          .select({ id: mediaAssets.id, storageKey: mediaAssets.storageKey })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.tenantId, input.tenantId),
              eq(mediaAssets.userId, input.userId),
              inArray(mediaAssets.id, numericIds)
            )
          )
      : [];
  const byId = new Map(
    rows.map(row => [
      String(row.id),
      `/api/storage/files/${encodeURIComponent(row.storageKey)}`,
    ])
  );
  const raw = input.assetIds.map(value => {
    const mediaAssetUrl = byId.get(value);
    if (mediaAssetUrl) return mediaAssetUrl;
    return normalizeStoryboardReferenceValue(
      value,
      input.tenantId,
      input.userId
    );
  });
  const unresolved = raw.filter((value): value is null => value === null);
  if (unresolved.length > 0) {
    throw new Error("STORYBOARD_REFERENCE_ASSET_NOT_FOUND");
  }
  return (
    (await resolveExternalMediaReferenceUrls(
      raw as string[],
      { tenantId: input.tenantId, userId: input.userId },
      getCachedPublicAppUrl()
    )) ?? raw
  );
}

async function loadRun(runId: string, scope: StoryboardWorkerScope) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db
    .select()
    .from(storyboardSkillRuns)
    .where(
      and(
        eq(storyboardSkillRuns.id, runId),
        eq(storyboardSkillRuns.tenantId, scope.tenantId),
        eq(storyboardSkillRuns.userId, scope.userId)
      )
    )
    .limit(1);
  if (!run) return null;
  const shots = await db
    .select()
    .from(storyboardSkillShots)
    .where(
      and(
        eq(storyboardSkillShots.runId, runId),
        eq(storyboardSkillShots.tenantId, scope.tenantId)
      )
    )
    .orderBy(storyboardSkillShots.shotNumber);
  return { run, shots };
}

async function enqueueStoryboardContinuationJobs(input: {
  runId: string;
  tenantId: string;
  userId: number;
  shotNumbers: number[];
  attemptByShot?: Map<number, number>;
  controlPlane: JobControlPlane;
}): Promise<number> {
  const refs = await Promise.all(
    input.shotNumbers.map(shotNumber =>
      input.controlPlane.create(
        {
          contractVersion: "feature-186-v1",
          tenantId: input.tenantId,
          requestedByUserId: input.userId,
          jobType: "storyboard.skill.run",
          executionClass: "long",
          input: { runId: input.runId, shotNumber },
          idempotencyKey: `storyboard-skill-shot:${input.runId}:${shotNumber}:attempt:${input.attemptByShot?.get(shotNumber) ?? 1}`,
          retryPolicy: STORYBOARD_JOB_RETRY_POLICY,
          timeoutPolicy: STORYBOARD_JOB_TIMEOUT_POLICY,
        },
        { admissionMode: "durable_queue" }
      )
    )
  );
  return refs.length;
}

async function setRunStatus(
  runId: string,
  projectId: string,
  status: string,
  scope: StoryboardWorkerScope,
  error?: Record<string, unknown> | null
): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const allowedPreviousStatuses =
    status === "running"
      ? ["queued", "running", "partial"]
      : status === "succeeded"
        ? ["running", "partial"]
        : ["queued", "running", "partial"];
  return db.transaction(async tx => {
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, projectId),
          eq(storyboardSkillProjects.tenantId, scope.tenantId),
          eq(storyboardSkillProjects.userId, scope.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) return false;
    const [updated] = await tx
      .update(storyboardSkillRuns)
      .set({
        status,
        ...(error !== undefined ? { error } : {}),
        ...(status === "running" ? { error: null } : {}),
        updatedAt: new Date(),
        ...(status === "running" ? { startedAt: new Date() } : {}),
        ...(status === "succeeded" ? { completedAt: new Date() } : {}),
      })
      .where(
        and(
          eq(storyboardSkillRuns.id, runId),
          eq(storyboardSkillRuns.tenantId, scope.tenantId),
          eq(storyboardSkillRuns.userId, scope.userId),
          inArray(storyboardSkillRuns.status, allowedPreviousStatuses)
        )
      )
      .returning({ id: storyboardSkillRuns.id });
    if (!updated) return false;
    await tx
      .update(storyboardSkillProjects)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(storyboardSkillProjects.id, projectId),
          eq(storyboardSkillProjects.tenantId, scope.tenantId),
          eq(storyboardSkillProjects.userId, scope.userId)
        )
      );
    return true;
  });
}

async function markShotGenerating(
  scope: StoryboardWorkerScope,
  runId: string,
  shotId: number
): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db
    .update(storyboardSkillShots)
    .set({
      status: "generating",
      attempt: sql`${storyboardSkillShots.attempt} + 1`,
      updatedAt: new Date(),
      suppressedResult: false,
    })
    .where(
      and(
        eq(storyboardSkillShots.id, shotId),
        eq(storyboardSkillShots.runId, runId),
        eq(storyboardSkillShots.tenantId, scope.tenantId),
        inArray(storyboardSkillShots.status, [
          "pending",
          "prompt_ready",
          "failed",
          "partial",
        ])
      )
    )
    .returning({ attempt: storyboardSkillShots.attempt });
  return row?.attempt ?? null;
}

async function bindProviderOperationKey(
  scope: StoryboardWorkerScope,
  runId: string,
  shotId: number,
  operationKey: string
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(storyboardSkillShots)
    .set({ providerOperationKey: operationKey, updatedAt: new Date() })
    .where(
      and(
        eq(storyboardSkillShots.id, shotId),
        eq(storyboardSkillShots.runId, runId),
        eq(storyboardSkillShots.tenantId, scope.tenantId),
        eq(storyboardSkillShots.status, "generating")
      )
    );
}

async function markSuppressed(input: {
  scope: StoryboardWorkerScope;
  runId: string;
  projectId: string;
  shotId: number;
  operationKey: string;
  message: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.transaction(async tx => {
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, input.projectId),
          eq(storyboardSkillProjects.tenantId, input.scope.tenantId),
          eq(storyboardSkillProjects.userId, input.scope.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) return;
    const [run] = await tx
      .select({ status: storyboardSkillRuns.status })
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, input.runId),
          eq(storyboardSkillRuns.tenantId, input.scope.tenantId),
          eq(storyboardSkillRuns.userId, input.scope.userId)
        )
      )
      .limit(1);
    await tx
      .update(storyboardSkillShots)
      .set({
        status: "suppressed",
        providerOperationKey: input.operationKey,
        suppressedResult: true,
        error: {
          code: "STOPPED_RESULT_SUPPRESSED",
          message: input.message,
          providerOperationKey: input.operationKey,
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillShots.id, input.shotId),
          eq(storyboardSkillShots.runId, input.runId),
          eq(storyboardSkillShots.tenantId, input.scope.tenantId)
        )
      );
    // Pause/cancel APIs own the run/project lifecycle. A late provider result
    // may suppress the shot, but must never rewrite a newer cancelled or
    // cancel-requested domain state back to paused.
    if (
      run?.status === "queued" ||
      run?.status === "running" ||
      run?.status === "partial"
    ) {
      await tx
        .update(storyboardSkillRuns)
        .set({
          status: "paused",
          error: {
            code: "PAUSED_BY_USER",
            message:
              "Generation stopped; provider result was not accepted for continuity.",
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(storyboardSkillRuns.id, input.runId),
            eq(storyboardSkillRuns.tenantId, input.scope.tenantId),
            eq(storyboardSkillRuns.userId, input.scope.userId)
          )
        );
      await tx
        .update(storyboardSkillProjects)
        .set({ status: "paused", updatedAt: new Date() })
        .where(
          and(
            eq(storyboardSkillProjects.id, input.projectId),
            eq(storyboardSkillProjects.tenantId, input.scope.tenantId),
            eq(storyboardSkillProjects.userId, input.scope.userId)
          )
        );
    }
  });
}

async function markSucceeded(input: {
  scope: StoryboardWorkerScope;
  runId: string;
  projectId: string;
  shotId: number;
  assetId: number;
  operationKey: string;
  request: Record<string, unknown>;
  effectiveModelId?: string | null;
  referenceAssetIds: string[];
  videoPrompt: string;
}): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return db.transaction(async tx => {
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, input.projectId),
          eq(storyboardSkillProjects.tenantId, input.scope.tenantId),
          eq(storyboardSkillProjects.userId, input.scope.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) return false;
    const [run] = await tx
      .select({ status: storyboardSkillRuns.status })
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, input.runId),
          eq(storyboardSkillRuns.tenantId, input.scope.tenantId),
          eq(storyboardSkillRuns.userId, input.scope.userId)
        )
      )
      .limit(1);
    if (!run || isStoryboardExecutionStopped(run.status)) return false;
    const [updated] = await tx
      .update(storyboardSkillShots)
      .set({
        status: "succeeded",
        imageAssetId: input.assetId,
        providerOperationKey: input.operationKey,
        generationPrompt: String(input.request.prompt ?? "").trim(),
        generationRequest: input.request,
        effectiveGenerationRequest: {
          ...input.request,
          requestedModel: input.request.model ?? null,
          model: input.effectiveModelId || input.request.model || null,
        },
        referenceAssetIds: input.referenceAssetIds,
        videoPrompt: input.videoPrompt,
        suppressedResult: false,
        error: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillShots.id, input.shotId),
          eq(storyboardSkillShots.runId, input.runId),
          eq(storyboardSkillShots.tenantId, input.scope.tenantId),
          eq(storyboardSkillShots.status, "generating")
        )
      )
      .returning({ id: storyboardSkillShots.id });
    return Boolean(updated);
  });
}

async function markFailure(input: {
  scope: StoryboardWorkerScope;
  runId: string;
  projectId: string;
  shotId: number;
  operationKey: string;
  error: ReturnType<typeof classifyStoryboardGenerationError>;
  prompt: string;
  request: Record<string, unknown>;
  providerSubmissionStarted?: boolean;
  creditSettledBeforeProvider?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const lockedPrompt = ensureStoryboardSingleImagePrompt(input.prompt);
  const repairedPrompt =
    input.error.class === "policy"
      ? optimizeStoryboardPromptForConstraint(lockedPrompt, input.error.code)
      : lockedPrompt;
  const repairedRequest = { ...input.request, prompt: repairedPrompt };
  await db.transaction(async tx => {
    const [project] = await tx
      .select({ id: storyboardSkillProjects.id })
      .from(storyboardSkillProjects)
      .where(
        and(
          eq(storyboardSkillProjects.id, input.projectId),
          eq(storyboardSkillProjects.tenantId, input.scope.tenantId),
          eq(storyboardSkillProjects.userId, input.scope.userId)
        )
      )
      .for("update")
      .limit(1);
    if (!project) return;
    const [run] = await tx
      .select({ status: storyboardSkillRuns.status })
      .from(storyboardSkillRuns)
      .where(
        and(
          eq(storyboardSkillRuns.id, input.runId),
          eq(storyboardSkillRuns.tenantId, input.scope.tenantId),
          eq(storyboardSkillRuns.userId, input.scope.userId)
        )
      )
      .limit(1);
    const stopped = run ? isStoryboardExecutionStopped(run.status) : false;
    await tx
      .update(storyboardSkillShots)
      .set({
        status: stopped ? "suppressed" : "failed",
        error: stopped
          ? {
              code: "STOPPED_RESULT_SUPPRESSED",
              class: input.error.class,
              message:
                "Provider result was not accepted after the user stopped the storyboard.",
              providerOperationKey: input.operationKey,
            }
          : {
              code: input.error.code,
              class: input.error.class,
              message: input.error.message,
              detail: input.error.detail,
              ...(input.error.statusCode
                ? { statusCode: input.error.statusCode }
                : {}),
              providerSubmissionStarted:
                input.providerSubmissionStarted ?? false,
              creditSettledBeforeProvider:
                input.creditSettledBeforeProvider ?? false,
              repairAction:
                input.error.class === "policy"
                  ? "optimize_prompt"
                  : "reuse_prompt",
              providerOperationKey: input.operationKey,
            },
        generationPrompt: repairedPrompt,
        generationRequest: repairedRequest,
        promptVersion: sql`${storyboardSkillShots.promptVersion} + ${input.error.class === "policy" ? 1 : 0}`,
        providerOperationKey: input.operationKey,
        suppressedResult: stopped,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(storyboardSkillShots.id, input.shotId),
          eq(storyboardSkillShots.runId, input.runId),
          eq(storyboardSkillShots.tenantId, input.scope.tenantId)
        )
      );
    if (!stopped) {
      await tx
        .update(storyboardSkillRuns)
        .set({
          status: "partial",
          error: {
            code: input.error.code,
            class: input.error.class,
            message: input.error.message,
            detail: input.error.detail,
            ...(input.error.statusCode
              ? { statusCode: input.error.statusCode }
              : {}),
            providerSubmissionStarted: input.providerSubmissionStarted ?? false,
            creditSettledBeforeProvider:
              input.creditSettledBeforeProvider ?? false,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(storyboardSkillRuns.id, input.runId),
            eq(storyboardSkillRuns.tenantId, input.scope.tenantId),
            eq(storyboardSkillRuns.userId, input.scope.userId)
          )
        );
      await tx
        .update(storyboardSkillProjects)
        .set({ status: "partial", updatedAt: new Date() })
        .where(
          and(
            eq(storyboardSkillProjects.id, input.projectId),
            eq(storyboardSkillProjects.tenantId, input.scope.tenantId),
            eq(storyboardSkillProjects.userId, input.scope.userId)
          )
        );
    }
  });
}

export async function runStoryboardSkillBackground(
  input: WorkerInput
): Promise<JobResult> {
  if (input.context.jobType !== "storyboard.skill.run")
    throw new Error("STORYBOARD_JOB_TYPE_MISMATCH");
  if (
    !Number.isSafeInteger(input.context.requestedByUserId) ||
    input.context.requestedByUserId <= 0
  ) {
    throw new Error("STORYBOARD_JOB_ACTOR_MISSING");
  }
  const scope: StoryboardWorkerScope = {
    tenantId: input.context.tenantId,
    userId: input.context.requestedByUserId,
  };
  const rawShotNumber = input.context.input?.shotNumber;
  const targetShotNumber =
    rawShotNumber === undefined
      ? undefined
      : typeof rawShotNumber === "number" && Number.isSafeInteger(rawShotNumber)
        ? rawShotNumber
        : null;
  if (
    targetShotNumber === null ||
    (targetShotNumber !== undefined && targetShotNumber <= 0)
  ) {
    throw new Error("STORYBOARD_SHOT_NUMBER_INVALID");
  }
  const loaded = await loadRun(input.runId, scope);
  if (!loaded) throw new Error("STORYBOARD_RUN_NOT_FOUND");
  const { run, shots } = loaded;
  if (run.status === "awaiting_confirmation")
    throw new Error("STORYBOARD_RUN_NOT_CONFIRMED");
  if (isStoryboardExecutionStopped(run.status)) {
    return settleStoppedStoryboardRun({
      controlPlane: input.controlPlane,
      reporter: input.reporter,
      lease: input.lease,
      runId: run.id,
      runStatus: run.status,
      operationKey: `storyboard.pause:${run.id}`,
    });
  }
  const global = run.normalizedSnapshot as unknown as StoryboardGlobalInput;
  const plannedShots = planStoryboardShots(global);
  const isAnchorJob = targetShotNumber === undefined || targetShotNumber === 1;
  if (isAnchorJob) {
    const startedStatus = await setRunStatus(
      run.id,
      run.projectId,
      "running",
      scope
    );
    if (!startedStatus) {
      const stopped = await loadRun(run.id, scope);
      return settleStoppedStoryboardRun({
        controlPlane: input.controlPlane,
        reporter: input.reporter,
        lease: input.lease,
        runId: run.id,
        runStatus: stopped?.run.status,
        operationKey: `storyboard.pause:${run.id}`,
      });
    }
  }
  const started = await loadRun(run.id, scope);
  if (!started) throw new Error("STORYBOARD_RUN_NOT_FOUND");
  if (isStoryboardExecutionStopped(started.run.status)) {
    return settleStoppedStoryboardRun({
      controlPlane: input.controlPlane,
      reporter: input.reporter,
      lease: input.lease,
      runId: run.id,
      runStatus: started.run.status,
      operationKey: `storyboard.pause:${run.id}`,
    });
  }
  const anchorShot = started.shots.find(shot => shot.shotNumber === 1);
  let anchorImageAssetId =
    anchorShot && isReusableStoryboardImage(anchorShot)
      ? String(anchorShot.imageAssetId)
      : undefined;
  if (
    targetShotNumber !== undefined &&
    targetShotNumber > 1 &&
    !anchorImageAssetId
  ) {
    throw new Error("STORYBOARD_ANCHOR_IMAGE_MISSING");
  }
  const shotsToProcess =
    targetShotNumber === undefined
      ? started.shots.filter(shot => shot.shotNumber === 1)
      : started.shots.filter(shot => shot.shotNumber === targetShotNumber);
  if (shotsToProcess.length === 0) {
    throw new Error("STORYBOARD_SHOT_NOT_FOUND");
  }

  for (const shot of shotsToProcess) {
    await input.reporter.assertActive(input.lease);
    const live = await loadRun(run.id, scope);
    if (!live) throw new Error("STORYBOARD_RUN_NOT_FOUND");
    if (isStoryboardExecutionStopped(live.run.status)) {
      return settleStoppedStoryboardRun({
        controlPlane: input.controlPlane,
        reporter: input.reporter,
        lease: input.lease,
        runId: run.id,
        runStatus: live.run.status,
        operationKey: `storyboard.pause:${run.id}`,
      });
    }
    if (isReusableStoryboardImage(shot)) {
      if (shot.shotNumber === 1) anchorImageAssetId = String(shot.imageAssetId);
      continue;
    }
    if (shot.shotNumber > 1 && !anchorImageAssetId) {
      // Continuation shots must never be generated without the canonical Shot
      // 1 image. Leave them pending so repairing Shot 1 unlocks them safely.
      continue;
    }
    if (shot.status === "generating") {
      await markFailure({
        scope,
        runId: run.id,
        projectId: run.projectId,
        shotId: shot.id,
        operationKey:
          shot.providerOperationKey ??
          `storyboard:${run.id}:shot:${shot.shotNumber}:ambiguous`,
        error: {
          class: "unknown",
          code: "IMAGE_OPERATION_AMBIGUOUS",
          message:
            "A provider operation was in progress when the worker lease was lost.",
          detail: "The worker lease was lost while the shot was generating.",
        },
        prompt: shot.generationPrompt ?? "",
        request: asRecord(shot.generationRequest),
        providerSubmissionStarted: true,
        creditSettledBeforeProvider: false,
      });
      await input.reporter.fail(input.lease, {
        code: "IMAGE_OPERATION_AMBIGUOUS",
        message: "A provider operation was in progress when the worker lease was lost; operator review is required before retry.",
        class: "unknown",
        operatorReviewRequired: true,
      });
      return {
        deferred: true,
        output: {
          runId: run.id,
          status: "partial",
          shotNumber: shot.shotNumber,
        },
      };
    }
    const shotError = asRecord(shot.error);
    const isAutomaticRetry =
      (shot.status === "failed" || shot.status === "partial") &&
      shotError.class === "transient";
    if (
      (shot.status === "failed" || shot.status === "partial") &&
      !isAutomaticRetry
    ) {
      // Permanent/unknown failures require an explicit user repair action.
      continue;
    }
    const attempt = await markShotGenerating(scope, run.id, shot.id);
    if (!attempt) continue;
    const request = asRecord(shot.generationRequest);
    const prompt = ensureStoryboardSingleImagePrompt(
      String(request.prompt ?? shot.generationPrompt ?? "").trim()
    );
    if (!prompt) throw new Error("STORYBOARD_SHOT_PROMPT_MISSING");
    const operationKey = `storyboard:${run.id}:shot:${shot.shotNumber}:attempt:${attempt}`;
    let providerSubmissionStarted = false;
    let creditSettled = false;
    try {
      // Persist the deterministic provider idempotency key before the first
      // external call so an ambiguous response can be reconciled safely.
      await bindProviderOperationKey(scope, run.id, shot.id, operationKey);
      await reportShotStage({
        reporter: input.reporter,
        lease: input.lease,
        shotNumber: shot.shotNumber,
        totalShots: shots.length,
        stage: "preflight",
        message: `Validating storyboard shot ${shot.shotNumber}`,
        measured: { attempt, operationKey },
      });
      const refs = [
        ...(anchorImageAssetId ? [anchorImageAssetId] : []),
        ...referenceAssetIds(global),
        ...(shot.referenceAssetIds ?? []),
      ]
        .filter((value, index, all) => all.indexOf(value) === index)
        .slice(0, 5);
      const referenceImageUrls = await resolveReferenceUrls({
        tenantId: run.tenantId,
        userId: run.userId,
        assetIds: refs,
      });
      await reportShotStage({
        reporter: input.reporter,
        lease: input.lease,
        shotNumber: shot.shotNumber,
        totalShots: shots.length,
        stage: "preflight_ready",
        message: `Storyboard shot ${shot.shotNumber} is ready for provider admission`,
        measured: { attempt, referenceCount: refs.length, operationKey },
      });
      const creditKey = `storyboard:${run.id}:shot:${shot.shotNumber}`;
      await reportShotStage({
        reporter: input.reporter,
        lease: input.lease,
        shotNumber: shot.shotNumber,
        totalShots: shots.length,
        stage: "provider_admission",
        message: `Waiting for provider admission for shot ${shot.shotNumber}`,
        measured: { attempt, operationKey, creditSettled: false },
      });
      const response = await withLeaseHeartbeat({
        lease: input.lease,
        reporter: input.reporter,
        operation: () =>
          mediaGenerationService.generateImage(
            {
              prompt,
              model: global.imageModelSelection.modelId,
              controlPlaneOperationKey: operationKey,
              onSubmissionReady: async () => {
                // Charge only after safety/model/reference preflight has passed and
                // immediately before the first provider request. The stable key
                // keeps transport redelivery and provider retries idempotent.
                // Re-check the fenced lease at the last safe point before the
                // credit/provider side effect. A heartbeat failure must not allow
                // a stale worker to charge a user after cancellation or takeover.
                await input.reporter.assertActive(input.lease);
                await deductCredits({
                  userId: run.userId,
                  tenantId: run.tenantId,
                  amount: STORYBOARD_IMAGE_CREDIT_COST,
                  description: `Storyboard image generation ${shot.shotNumber}`,
                  idempotencyKey: creditKey,
                  skillRunId: creditKey,
                  skillSlug: global.selectedSkillId,
                  sourceType: "skill",
                  metadata: {
                    runId: run.id,
                    shotNumber: shot.shotNumber,
                    attempt,
                    operationKey,
                    model: global.imageModelSelection.modelId,
                  },
                });
                creditSettled = true;
              },
              onSubmissionStarted: () => {
                providerSubmissionStarted = true;
              },
              aspectRatio: global.outputAspectRatio,
              referenceImageUrls,
              extraParams: global.imageModelSelection.quality
                ? { quality: global.imageModelSelection.quality }
                : undefined,
              publicUrl: getCachedPublicAppUrl(),
              auditContext: {
                userId: run.userId,
                tenantId: run.tenantId,
                skillRunId: creditKey,
                skillSlug: global.selectedSkillId,
                source: "storyboard_skill_framework",
                stage: `shot_${shot.shotNumber}`,
                operationKey,
              },
            },
            createInternalTokenFromAuth(
              { userId: run.userId, tenantId: run.tenantId },
              ["media:generate"]
            )
          ),
      });
      await input.reporter.assertActive(input.lease);
      await reportShotStage({
        reporter: input.reporter,
        lease: input.lease,
        shotNumber: shot.shotNumber,
        totalShots: shots.length,
        stage: "provider_response",
        message: `Provider response received for shot ${shot.shotNumber}`,
        measured: {
          attempt,
          operationKey,
          providerSubmissionStarted,
          creditSettled,
        },
      });
      const current = await loadRun(run.id, scope);
      if (!current || isStoryboardExecutionStopped(current.run.status)) {
        await markSuppressed({
          scope,
          runId: run.id,
          projectId: run.projectId,
          shotId: shot.id,
          operationKey,
          message: "Provider returned after the user stopped the storyboard.",
        });
        return settleStoppedStoryboardRun({
          controlPlane: input.controlPlane,
          reporter: input.reporter,
          lease: input.lease,
          runId: run.id,
          runStatus: current?.run.status,
          operationKey: `storyboard.pause:${run.id}:provider:${shot.shotNumber}`,
          output: { suppressedShotNumber: shot.shotNumber },
        });
      }
      const durable = await durabilizeMediaGenerationResponse(response, {
        tenantId: run.tenantId,
        userId: run.userId,
        mediaType: "image",
        sourceType: "storyboard_skill_generated",
        identity: operationKey,
      });
      const assetId = Number(durable.data?.[0]?.data?.mediaAssetId);
      if (!Number.isSafeInteger(assetId) || assetId <= 0)
        throw new Error("STORYBOARD_IMAGE_ASSET_MISSING");
      await reportShotStage({
        reporter: input.reporter,
        lease: input.lease,
        shotNumber: shot.shotNumber,
        totalShots: shots.length,
        stage: "artifact_durable",
        message: `Managed image asset committed for shot ${shot.shotNumber}`,
        measured: { attempt, operationKey, assetId },
      });
      const plannedShot = plannedShots.find(
        item => item.shotNumber === shot.shotNumber
      );
      const videoPrompt = buildStoryboardVideoPrompt({
        shot: plannedShot ?? {
          shotNumber: shot.shotNumber,
          beat: shot.beat,
          context: shot.context,
          continuity: "",
          dialogueLines: [],
        },
        imageAssetId: String(assetId),
        videoModelId: global.videoModelSelection.modelId,
        language: global.language,
      });
      const accepted = await markSucceeded({
        scope,
        runId: run.id,
        projectId: run.projectId,
        shotId: shot.id,
        assetId,
        operationKey,
        request: {
          ...request,
          model: global.imageModelSelection.modelId,
          prompt,
          reference_images: refs.map(asset_id => ({ asset_id })),
        },
        effectiveModelId: typeof response.model === "string" ? response.model : null,
        referenceAssetIds: refs,
        videoPrompt,
      });
      if (!accepted) {
        await markSuppressed({
          scope,
          runId: run.id,
          projectId: run.projectId,
          shotId: shot.id,
          operationKey,
          message: "Provider returned after the user stopped the storyboard.",
        });
        const stopped = await loadRun(run.id, scope);
        return settleStoppedStoryboardRun({
          controlPlane: input.controlPlane,
          reporter: input.reporter,
          lease: input.lease,
          runId: run.id,
          runStatus: stopped?.run.status,
          operationKey: `storyboard.pause:${run.id}:race:${shot.shotNumber}`,
          output: { suppressedShotNumber: shot.shotNumber },
        });
      }
      await reportShotStage({
        reporter: input.reporter,
        lease: input.lease,
        shotNumber: shot.shotNumber,
        totalShots: shots.length,
        stage: "domain_projection",
        message: `Storyboard shot ${shot.shotNumber} is visible in the review projection`,
        measured: { attempt, operationKey, assetId },
      });
      if (shot.shotNumber === 1) anchorImageAssetId = String(assetId);
    } catch (error) {
      const classified = classifyStoryboardGenerationError(error);
      const recoveryError = escalateStoryboardProviderFailure({
        failure: classified,
        providerSubmissionStarted,
        creditSettled,
      });
      console.error("[StoryboardSkillFramework] shot generation failed", {
        runId: run.id,
        jobId: input.lease.jobId,
        shotNumber: shot.shotNumber,
        attempt,
        operationKey,
        class: recoveryError.class,
        code: recoveryError.code,
        statusCode: classified.statusCode,
        detail: classified.detail,
        providerSubmissionStarted,
        creditSettled,
      });
      await reportShotStage({
        reporter: input.reporter,
        lease: input.lease,
        shotNumber: shot.shotNumber,
        totalShots: shots.length,
        stage: "failed",
        message: `Storyboard shot ${shot.shotNumber} failed and needs review`,
        measured: {
          attempt,
          operationKey,
          class: recoveryError.class,
          providerSubmissionStarted,
          creditSettled,
        },
      });
      await markFailure({
        scope,
        runId: run.id,
        projectId: run.projectId,
        shotId: shot.id,
        operationKey,
        error: recoveryError,
        prompt,
        request,
        providerSubmissionStarted,
        creditSettledBeforeProvider: creditSettled,
      });
      if (recoveryError.class === "transient") {
        await input.reporter.fail(input.lease, {
          code: recoveryError.code,
          message: recoveryError.message,
          class: "retryable",
        });
        return {
          deferred: true,
          output: {
            runId: run.id,
            status: "partial",
            failedShotNumber: shot.shotNumber,
            failureClass: recoveryError.class,
          },
        };
      }
      // A permanent or unknown provider outcome is not an external wait. It
      // is a terminal, operator-reviewed control-plane failure. Keeping the
      // canonical job in waiting_external made the dashboard look healthy,
      // hid the actual error, and allowed repair UI/domain state to diverge
      // from the durable job ledger.
      await input.reporter.fail(input.lease, {
        code: recoveryError.code,
        message: recoveryError.message,
        class: recoveryError.class,
        operatorReviewRequired: true,
      });
      return {
        deferred: true,
        output: {
          runId: run.id,
          status: "partial",
          failedShotNumber: shot.shotNumber,
          failureClass: recoveryError.class,
        },
      };
    }
  }

  const final = await loadRun(run.id, scope);
  if (!final) throw new Error("STORYBOARD_RUN_NOT_FOUND");
  const finalAnchor = final.shots.find(shot => shot.shotNumber === 1);
  if (isAnchorJob) {
    if (!finalAnchor || !isReusableStoryboardImage(finalAnchor)) {
      const partialStatus = await setRunStatus(
        run.id,
        run.projectId,
        "partial",
        scope
      );
      if (!partialStatus) {
        const stopped = await loadRun(run.id, scope);
        return settleStoppedStoryboardRun({
          controlPlane: input.controlPlane,
          reporter: input.reporter,
          lease: input.lease,
          runId: run.id,
          runStatus: stopped?.run.status,
          operationKey: `storyboard.pause:${run.id}`,
        });
      }
      await input.reporter.waitForExternal(input.lease, {
        operationKey: `storyboard.pause:${run.id}:anchor-incomplete`,
        resumeAfter: PAUSED_RESUME_AFTER,
      });
      return { deferred: true, output: { runId: run.id, status: "partial" } };
    }
    const childShotNumbers = final.shots
      .filter(shot => shot.shotNumber > 1 && !isReusableStoryboardImage(shot))
      .map(shot => shot.shotNumber);
    if (childShotNumbers.length > 0) {
      const enqueued = await enqueueStoryboardContinuationJobs({
        runId: run.id,
        tenantId: run.tenantId,
        userId: run.userId,
        shotNumbers: childShotNumbers,
        attemptByShot: new Map(
          final.shots.map(shot => [shot.shotNumber, shot.attempt + 1])
        ),
        controlPlane: input.controlPlane,
      });
      return {
        output: {
          runId: run.id,
          status: "running",
          anchorShotNumber: 1,
          continuationJobsEnqueued: enqueued,
        },
      };
    }
  }
  const allSucceeded =
    final.shots.length > 0 &&
    final.shots.every(
      shot =>
        shot.status === "succeeded" &&
        shot.imageAssetId &&
        !shot.suppressedResult
    );
  if (!allSucceeded) {
    if (targetShotNumber !== undefined) {
      return {
        output: {
          runId: run.id,
          status: final.run.status,
          shotNumber: targetShotNumber,
        },
      };
    }
    const partialStatus = await setRunStatus(
      run.id,
      run.projectId,
      "partial",
      scope
    );
    if (!partialStatus) {
      const stopped = await loadRun(run.id, scope);
      return settleStoppedStoryboardRun({
        controlPlane: input.controlPlane,
        reporter: input.reporter,
        lease: input.lease,
        runId: run.id,
        runStatus: stopped?.run.status,
        operationKey: `storyboard.pause:${run.id}`,
      });
    }
    await input.reporter.waitForExternal(input.lease, {
      operationKey: `storyboard.pause:${run.id}:incomplete`,
      resumeAfter: PAUSED_RESUME_AFTER,
    });
    return { deferred: true, output: { runId: run.id, status: "partial" } };
  }
  try {
    const { rebuildStoryboardSkillReviewProjection } =
      await import("./storyboardSkillFrameworkService");
    const projection = await rebuildStoryboardSkillReviewProjection({
      userId: run.userId,
      tenantId: run.tenantId,
      runId: run.id,
    });
    if (projection.projectionStatus !== "ready")
      throw new Error("STORYBOARD_REVIEW_PROJECTION_PENDING");
  } catch {
    await setRunStatus(run.id, run.projectId, "partial", scope, {
      code: "STORYBOARD_REVIEW_PROJECTION_PENDING",
      // Projection repair is a local/domain consistency issue, not an
      // ambiguous provider operation. Keep the run resumable so the user or
      // reconciler can repair the projection without bypassing provider
      // evidence gates.
      class: "projection",
      message:
        "The storyboard review projection is not ready and requires repair.",
    });
    // This is a local projection/checkpoint failure, not an external provider
    // wait. Keep it retryable so the canonical control plane can schedule a
    // bounded recovery attempt and operators can distinguish it from a
    // provider operation that is still running.
    await input.reporter.fail(input.lease, {
      code: "STORYBOARD_REVIEW_PROJECTION_PENDING",
      message:
        "The storyboard review projection is not ready and requires repair.",
      class: "retryable",
    });
    return {
      deferred: true,
      output: { runId: run.id, status: "partial", projectionPending: true },
    };
  }
  const succeededStatus = await setRunStatus(
    run.id,
    run.projectId,
    "succeeded",
    scope
  );
  if (!succeededStatus) {
    const stopped = await loadRun(run.id, scope);
    return settleStoppedStoryboardRun({
      controlPlane: input.controlPlane,
      reporter: input.reporter,
      lease: input.lease,
      runId: run.id,
      runStatus: stopped?.run.status,
      operationKey: `storyboard.pause:${run.id}`,
    });
  }
  return {
    output: {
      runId: run.id,
      status: "succeeded",
      shotCount: final.shots.length,
    },
  };
}
