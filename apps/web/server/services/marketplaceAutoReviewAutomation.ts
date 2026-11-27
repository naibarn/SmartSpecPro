import { and, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import { getDb } from "../db";
import { marketplaceAutoReviewRuns, workerJobs } from "../../drizzle/schema";
import { StagedSequentialStoryboardMetadataV1Schema } from "@shared/marketplaceAutoReview/stagedContracts";
import { stagedMetadataStateDigest } from "./marketplaceAutoReviewStagedCheckpointOperations";
import { getCachedPublicAppUrl } from "./appRuntimeConfig";
import { getStagedDialogueSpeakerLabels, removeStagedMinorDialogueLines, type StagedCastMember } from "./marketplaceAutoReviewStoryArcPlanner";
import {
  approveStagedAutoReviewCheckpoint,
  buildStagedApprovalExpectation,
  detectStagedAutoReviewShotPeople,
  generateStagedAutoReviewShotPrompt,
  startStagedAutoReviewBulkGeneration,
} from "./marketplaceAutoReviewStagedCheckpointRouterService";
import { findMarketplaceAutoReviewWorkerJobByIdempotencyKey } from "./marketplaceAutoReviewWorkerJob";

const ACTIVE_WORKER_STATUSES = [
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "waiting_external",
  "retry_scheduled",
  "uploading",
  "publishing",
  "indexing",
] as const;

const TASK_IN_FLIGHT_STATUSES = new Set([
  "pending",
  "queued",
  "processing",
  "submitted",
  "retry_scheduled",
]);

type AutoContinuationStage =
  | "story_draft"
  | "image_prompts"
  | "images"
  | "speaker_matching"
  | "video_prompts"
  | "complete";

type AutoContinuationStatus = "running" | "paused_error" | "completed";

type AutoContinuation = {
  schemaVersion: 1;
  status: AutoContinuationStatus;
  stage: AutoContinuationStage;
  planRevision: number;
  imageModel: string;
  promptModel?: string;
  workerJobIds?: Record<string, unknown>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
  errorCode?: string;
};

type RunRow = typeof marketplaceAutoReviewRuns.$inferSelect;

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function continuationFromRun(run: RunRow): AutoContinuation | null {
  const value = record(
    record(run.metadataJson).stagedPipeline
  ).autoContinuation;
  const continuation = record(value);
  if (
    continuation.schemaVersion !== 1 ||
    !["running", "paused_error", "completed"].includes(
      String(continuation.status)
    ) ||
    ![
      "story_draft",
      "image_prompts",
      "images",
      "speaker_matching",
      "video_prompts",
      "complete",
    ].includes(String(continuation.stage))
  ) {
    return null;
  }
  return continuation as AutoContinuation;
}

function continuationKey(runId: string, revision: number, step: string) {
  const stepDigest = createHash("sha256")
    .update(step)
    .digest("hex")
    .slice(0, 32);
  const stepName = step.startsWith("speaker-")
    ? `speaker-${step.split("-")[1]}`
    : step;
  return `mar:${runId}:r${revision}:${stepName}:${stepDigest}`;
}

function isActiveJob(status: unknown): boolean {
  return ACTIVE_WORKER_STATUSES.includes(
    status as (typeof ACTIVE_WORKER_STATUSES)[number]
  );
}

function isFailedJob(status: unknown): boolean {
  return ["failed", "cancelled", "canceled", "expired"].includes(
    String(status)
  );
}

function isSucceededJob(status: unknown): boolean {
  return status === "succeeded" || status === "completed";
}

export function nextAutomaticRecoveryAttempt(value: unknown): number | null {
  const previous = Number.isSafeInteger(Number(value)) ? Number(value) : 0;
  return previous < 0 ? 1 : previous < 2 ? previous + 1 : null;
}

export function canAutoResumeContinuation(input: {
  status: unknown;
  errorCode: unknown;
  workerJobIds?: unknown;
}): boolean {
  const attempts = Number(record(input.workerJobIds).automaticRecoveryAttempts ?? 0);
  return (
    input.status === "paused_error" &&
    input.errorCode === "automatic_step_failed" &&
    Number.isSafeInteger(attempts) &&
    attempts < 1
  );
}

async function getJobById(db: any, tenantId: string, jobId: string) {
  if (!jobId) return null;
  const [job] = await db
    .select({ id: workerJobs.id, status: workerJobs.status })
    .from(workerJobs)
    .where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, tenantId)))
    .limit(1);
  return job ?? null;
}

async function getJobByKey(db: any, tenantId: string, idempotencyKey: string) {
  return findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
    db,
    tenantId,
    idempotencyKey
  );
}

async function updateContinuation(
  db: any,
  input: { runId: string; userId: number; tenantId: string },
  update: (current: AutoContinuation) => Partial<AutoContinuation>,
  options: { allowPaused?: boolean; allowCompleted?: boolean } = {}
): Promise<boolean> {
  const [run] = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, input.runId),
        eq(marketplaceAutoReviewRuns.userId, input.userId),
        eq(marketplaceAutoReviewRuns.tenantId, input.tenantId)
      )
    )
    .limit(1);
  if (!run) return false;
  const metadata = record(run.metadataJson);
  const pipeline = record(metadata.stagedPipeline);
  const current = continuationFromRun(run);
  if (
    !current ||
    (current.status !== "running" &&
      !(options.allowPaused && current.status === "paused_error") &&
      !(options.allowCompleted && current.status === "completed"))
  ) {
    return false;
  }
  const changed = update(current);
  const nextContinuation: AutoContinuation = {
    ...current,
    ...changed,
    workerJobIds: {
      ...record(current.workerJobIds),
      ...record(changed.workerJobIds),
    },
    updatedAt: new Date().toISOString(),
  };
  const [saved] = await db
    .update(marketplaceAutoReviewRuns)
    .set({
      metadataJson: {
        ...metadata,
        stagedPipeline: {
          ...pipeline,
          autoContinuation: nextContinuation,
        },
      },
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, input.runId),
        eq(marketplaceAutoReviewRuns.userId, input.userId),
        eq(marketplaceAutoReviewRuns.tenantId, input.tenantId),
        eq(marketplaceAutoReviewRuns.updatedAt, run.updatedAt)
      )
    )
    .returning({ id: marketplaceAutoReviewRuns.id });
  return Boolean(saved);
}

async function pauseContinuation(
  db: any,
  input: { runId: string; userId: number; tenantId: string },
  errorCode: string
) {
  await updateContinuation(db, input, () => ({
    status: "paused_error",
    errorCode: /^[A-Za-z0-9_]{1,80}$/.test(errorCode)
      ? errorCode
      : "automatic_step_failed",
    failedAt: new Date().toISOString(),
  }));
}

function allPromptsReady(
  shots: Array<Record<string, any>>,
  checkpoints: Array<Record<string, any>>,
  stage: "image" | "video"
): boolean {
  const kind = stage === "image" ? "image_prompt" : "video_prompt";
  const promptKey = stage === "image" ? "imagePrompt" : "videoPrompt";
  const hashKey = stage === "image" ? "imagePromptHash" : "videoPromptHash";
  return (
    shots.length > 0 &&
    shots.every(shot => {
      const checkpoint = checkpoints.find(
        item =>
          item.kind === kind &&
          Number(item.shotId) === Number(shot.shotId) &&
          item.state === "approved"
      );
      return Boolean(
        text(shot[promptKey]) &&
        text(shot[hashKey]) &&
        checkpoint?.contentHash === shot[hashKey]
      );
    })
  );
}

function dialogueSpeakers(
  dialogue: unknown,
  cast: StagedCastMember[],
  castInShot?: readonly string[] | null
): string[] {
  return getStagedDialogueSpeakerLabels(dialogue, cast, castInShot);
}

function completeSpeakerBindings(
  shot: Record<string, any>,
  cast: StagedCastMember[]
): boolean {
  const safeDialogue = removeStagedMinorDialogueLines(text(shot.dialogue), cast);
  if (!safeDialogue.trim()) return true;
  const speakers = dialogueSpeakers(safeDialogue, cast, shot.castInShot);
  if (speakers.length === 0) return false;
  const bindings = record(shot.speakerVisualBindings);
  const values = speakers.map(speaker => text(bindings[speaker]));
  return Boolean(
    shot.speakerVisualBindingsImageHash === shot.imageArtifactHash &&
    values.every(Boolean) &&
    new Set(values).size === values.length
  );
}

function imageResultApproved(
  shot: Record<string, any>,
  checkpoints: Array<Record<string, any>>
): boolean {
  const checkpoint = checkpoints.find(
    item =>
      item.kind === "image_result" &&
      Number(item.shotId) === Number(shot.shotId) &&
      item.state === "approved"
  );
  return Boolean(
    text(shot.imageArtifactHash) &&
    text(shot.imageArtifactUrl) &&
    checkpoint?.contentHash === shot.imageArtifactHash
  );
}

async function hasActiveAdvanceJob(
  db: any,
  tenantId: string,
  runId: string
): Promise<boolean> {
  const jobs = await db
    .select({ status: workerJobs.status })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.tenantId, tenantId),
        eq(workerJobs.jobType, "marketplace.auto_review.execute"),
        sql`${workerJobs.inputJson}->>'runId' = ${runId}`,
        sql`${workerJobs.inputJson}->>'operation' = ${"advance_run"}`
      )
    )
    .orderBy(desc(workerJobs.createdAt))
    .limit(12);
  return jobs.some(job => isActiveJob(job.status));
}

async function hasActivePersonDetection(
  db: any,
  tenantId: string,
  runId: string,
  shotId: number
): Promise<boolean> {
  const jobs = await db
    .select({ inputJson: workerJobs.inputJson, status: workerJobs.status })
    .from(workerJobs)
    .where(
      and(
        eq(workerJobs.tenantId, tenantId),
        eq(workerJobs.jobType, "marketplace.auto_review.execute"),
        sql`${workerJobs.inputJson}->>'runId' = ${runId}`,
        sql`${workerJobs.inputJson}->>'operation' = ${"staged_person_detection"}`
      )
    )
    .orderBy(desc(workerJobs.createdAt))
    .limit(32);
  return jobs.some(
    job =>
      Number(
        record(record(job.inputJson).operationInput ?? job.inputJson).shotId
      ) === shotId && isActiveJob(job.status)
  );
}

function imageTaskStates(
  metadata: Record<string, any>,
  shots: Array<Record<string, any>>
) {
  const tasks = record(record(metadata.stagedPipeline).tasks);
  return shots.map(shot => ({
    shot,
    task: record(tasks[`image:${shot.shotId}`]),
  }));
}

export function missingApprovedVideoPromptShots(
  shots: Array<Record<string, any>>,
  checkpoints: Array<Record<string, any>>
): Array<Record<string, any>> {
  return shots.filter(shot => {
    if (!imageResultApproved(shot, checkpoints)) return false;
    const promptCheckpoint = checkpoints.find(
      item =>
        item.kind === "video_prompt" &&
        Number(item.shotId) === Number(shot.shotId) &&
        item.state === "approved"
    );
    return !(
      text(shot.videoPrompt) &&
      text(shot.videoPromptHash) &&
      promptCheckpoint?.contentHash === shot.videoPromptHash
    );
  });
}

export function getCompletedContinuationRecoveryStage(input: {
  shots: Array<Record<string, any>>;
  checkpoints: Array<Record<string, any>>;
  cast: StagedCastMember[];
}): "speaker_matching" | "video_prompts" | null {
  const approvedShots = input.shots.filter(shot =>
    imageResultApproved(shot, input.checkpoints)
  );
  if (
    approvedShots.some(shot => {
      const safeDialogue = removeStagedMinorDialogueLines(
        text(shot.dialogue),
        input.cast
      );
      return safeDialogue.trim() && !completeSpeakerBindings(shot, input.cast);
    })
  ) {
    return "speaker_matching";
  }
  return missingApprovedVideoPromptShots(input.shots, input.checkpoints).length
    ? "video_prompts"
    : null;
}

export function canRebaseCompletedContinuationPlan(input: {
  completedRecoveryAttempts: unknown;
  planMismatchRecoveryAttempts: unknown;
  allImagesApproved: boolean;
}): boolean {
  return (
    Number(input.completedRecoveryAttempts) === 1 &&
    Number(input.planMismatchRecoveryAttempts ?? 0) < 1 &&
    input.allImagesApproved
  );
}

/**
 * Advance the opt-in Auto Review continuation by one durable checkpoint.
 * Each expensive action uses the existing worker_jobs admission and a stable
 * idempotency key; the periodic Auto Review recovery job resumes waiting runs.
 */
export async function reconcileStagedAutoReviewAutomation(input: {
  runId: string;
  userId: number;
  tenantId: string;
  db?: any;
}): Promise<void> {
  const db = input.db ?? (await getDb());
  if (!db) return;
  const [run] = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, input.runId),
        eq(marketplaceAutoReviewRuns.userId, input.userId),
        eq(marketplaceAutoReviewRuns.tenantId, input.tenantId)
      )
    )
    .limit(1);
  if (!run) return;
  const automation = continuationFromRun(run);
  if (!automation) return;
  if (automation.status !== "running") {
    if (automation.status === "completed") {
      // Completed continuations can be reopened only for an active parent run,
      // with one bounded repair attempt. The scheduler also filters parent
      // run status, while this CAS protects concurrent edits.
    } else if (
      !canAutoResumeContinuation(automation) &&
      !(
        automation.status === "paused_error" &&
        automation.errorCode === "automatic_plan_changed" &&
        Number(record(automation.workerJobIds).completedRecoveryAttempts) === 1 &&
        Number(record(automation.workerJobIds).planMismatchRecoveryAttempts ?? 0) < 1
      )
    ) return;
  }

  const rawMetadata = record(run.metadataJson);
  const parsed =
    StagedSequentialStoryboardMetadataV1Schema.safeParse(rawMetadata);
  if (!parsed.success) {
    if (automation.status === "completed") return;
    await pauseContinuation(db, input, "staged_metadata_unavailable");
    return;
  }
  const metadata = parsed.data;
  const pipeline = record(rawMetadata.stagedPipeline);
  const plan = record(pipeline.plan);
  const shots = metadata.stagedSequentialStoryboard.shots as Array<
    Record<string, any>
  >;
  const checkpoints = metadata.stagedSequentialStoryboard
    .reviewCheckpoints as Array<Record<string, any>>;

  if (
    automation.status === "paused_error" &&
    automation.errorCode === "automatic_plan_changed"
  ) {
    const cast = Array.isArray(plan.cast) ? plan.cast : [];
    const allImagesApproved =
      shots.length > 0 && shots.every(shot => imageResultApproved(shot, checkpoints));
    const recoveryStage = getCompletedContinuationRecoveryStage({
      shots,
      checkpoints,
      cast,
    });
    if (!canRebaseCompletedContinuationPlan({
      completedRecoveryAttempts: record(automation.workerJobIds).completedRecoveryAttempts,
      planMismatchRecoveryAttempts: record(automation.workerJobIds).planMismatchRecoveryAttempts,
      allImagesApproved,
    }) || !recoveryStage) return;
    const currentPlanRevision = metadata.stagedSequentialStoryboard.planRevision;
    const resumed = await updateContinuation(
      db,
      input,
      () => ({
        status: "running",
        stage: recoveryStage,
        planRevision: currentPlanRevision,
        errorCode: undefined,
        failedAt: undefined,
        workerJobIds: { planMismatchRecoveryAttempts: 1 },
      }),
      { allowPaused: true }
    );
    if (!resumed) return;
    automation.status = "running";
    automation.stage = recoveryStage;
    automation.planRevision = currentPlanRevision;
    automation.workerJobIds = {
      ...record(automation.workerJobIds),
      planMismatchRecoveryAttempts: 1,
    };
  }

  if (automation.status === "completed") {
    if (!["queued", "running", "waiting_provider"].includes(run.status)) {
      return;
    }
    const recoveryAttempts = Number(
      record(automation.workerJobIds).completedRecoveryAttempts ?? 0
    );
    const recoveryStage = getCompletedContinuationRecoveryStage({
      shots,
      checkpoints,
      cast: Array.isArray(plan.cast) ? plan.cast : [],
    });
    if (recoveryAttempts >= 1 || !recoveryStage) return;
    const reopened = await updateContinuation(
      db,
      input,
      current => ({
        status: "running",
        stage: recoveryStage,
        planRevision: metadata.stagedSequentialStoryboard.planRevision,
        completedAt: undefined,
        errorCode: undefined,
        workerJobIds: {
          completedRecoveryAttempts: recoveryAttempts + 1,
        },
      }),
      { allowCompleted: true }
    );
    if (!reopened) return;
    automation.status = "running";
    automation.stage = recoveryStage;
    automation.planRevision = metadata.stagedSequentialStoryboard.planRevision;
    automation.workerJobIds = {
      ...record(automation.workerJobIds),
      completedRecoveryAttempts: recoveryAttempts + 1,
    };
  } else if (automation.status !== "running") {
    const recoveryAttempts =
      Number(record(automation.workerJobIds).automaticRecoveryAttempts ?? 0) + 1;
    const resumed = await updateContinuation(
      db,
      input,
      () => ({
        status: "running",
        errorCode: undefined,
        failedAt: undefined,
        workerJobIds: { automaticRecoveryAttempts: recoveryAttempts },
      }),
      { allowPaused: true }
    );
    if (!resumed) return;
    automation.status = "running";
  }

  if (
    automation.stage !== "story_draft" &&
    metadata.stagedSequentialStoryboard.planRevision !== automation.planRevision
  ) {
    await pauseContinuation(db, input, "automatic_plan_changed");
    return;
  }

  try {
    if (automation.stage === "story_draft") {
      const storyJobId = text(record(automation.workerJobIds).storyDraft);
      const storyJob = await getJobById(db, input.tenantId, storyJobId);
      if (!storyJob) {
        await pauseContinuation(db, input, "story_draft_job_missing");
        return;
      }
      if (isActiveJob(storyJob.status)) return;
      if (isFailedJob(storyJob.status)) {
        await pauseContinuation(db, input, "story_draft_failed");
        return;
      }
      if (!isSucceededJob(storyJob.status)) return;
      if (
        shots.length === 0 ||
        !text(plan.selectedConceptId) ||
        !Array.isArray(plan.shots) ||
        shots.length !== plan.shots.length
      ) {
        await pauseContinuation(db, input, "story_draft_incomplete");
        return;
      }
      const storyCheckpoint = checkpoints.find(
        item => item.kind === "story_plan"
      );
      if (!storyCheckpoint) {
        await pauseContinuation(db, input, "story_checkpoint_missing");
        return;
      }
      if (storyCheckpoint.state === "awaiting") {
        const model = text(storyCheckpoint.approvedModel);
        const provider = text(storyCheckpoint.approvedProvider);
        const safetyVerdict = text(storyCheckpoint.approvedSafetyVerdict);
        const referenceManifestHash = text(
          storyCheckpoint.approvedReferenceManifestHash
        );
        const estimatedCredits = Number(storyCheckpoint.estimatedCredits);
        if (
          !model ||
          !provider ||
          !safetyVerdict ||
          !referenceManifestHash ||
          !Number.isFinite(estimatedCredits)
        ) {
          await pauseContinuation(db, input, "story_approval_data_missing");
          return;
        }
        await approveStagedAutoReviewCheckpoint({
          runId: input.runId,
          checkpointId: String(storyCheckpoint.checkpointId),
          expectedStateDigest: stagedMetadataStateDigest(metadata),
          idempotencyKey: continuationKey(
            input.runId,
            automation.planRevision,
            "approve-story"
          ),
          expected: buildStagedApprovalExpectation({
            revision: Number(storyCheckpoint.revision),
            contentHash: String(storyCheckpoint.contentHash),
            model,
            provider,
            safetyVerdict,
            referenceManifestHash,
            estimatedCredits,
          }),
          auth: { userId: input.userId, tenantId: input.tenantId },
        });
      } else if (storyCheckpoint.state !== "approved") {
        await pauseContinuation(db, input, "story_checkpoint_not_approvable");
        return;
      }
      await updateContinuation(db, input, () => ({ stage: "image_prompts" }));
      return;
    }

    if (automation.stage === "image_prompts") {
      if (allPromptsReady(shots, checkpoints, "image")) {
        await updateContinuation(db, input, () => ({ stage: "images" }));
        return;
      }
      const key = continuationKey(
        input.runId,
        automation.planRevision,
        "image-prompts"
      );
      const existing = await getJobByKey(db, input.tenantId, key);
      if (existing) {
        if (isFailedJob(existing.status)) {
          await pauseContinuation(db, input, "image_prompt_generation_failed");
          return;
        }
        if (isActiveJob(existing.status)) return;
        if (isSucceededJob(existing.status)) {
          await pauseContinuation(db, input, "image_prompts_incomplete");
          return;
        }
      }
      const result = await startStagedAutoReviewBulkGeneration({
        runId: input.runId,
        expectedStateDigest: stagedMetadataStateDigest(metadata),
        idempotencyKey: key,
        targets: shots.map(shot => ({
          shotId: Number(shot.shotId),
          stage: "image" as const,
          promptOnly: true,
          refreshPrompt: true,
          ...(automation.promptModel
            ? { promptModel: automation.promptModel }
            : {}),
        })),
        auth: { userId: input.userId, tenantId: input.tenantId },
      });
      await updateContinuation(db, input, current => ({
        workerJobIds: {
          ...record(current.workerJobIds),
          imagePrompts: result.workerJobId,
        },
      }));
      return;
    }

    if (automation.stage === "images") {
      const imagesReady = shots.every(shot =>
        imageResultApproved(shot, checkpoints)
      );
      if (imagesReady) {
        await updateContinuation(db, input, () => ({
          stage: "speaker_matching",
        }));
        return;
      }
      const taskStates = imageTaskStates(rawMetadata, shots);
      if (
        taskStates.some(({ task }) =>
          ["failed", "cancelled", "canceled", "expired"].includes(
            text(task.status)
          )
        )
      ) {
        await pauseContinuation(db, input, "image_generation_failed");
        return;
      }
      const key = continuationKey(
        input.runId,
        automation.planRevision,
        "images"
      );
      const imageJob = await getJobByKey(db, input.tenantId, key);
      if (imageJob && isFailedJob(imageJob.status)) {
        await pauseContinuation(db, input, "image_generation_failed");
        return;
      }
      if (imageJob && isActiveJob(imageJob.status)) return;
      if (
        taskStates.some(({ task }) =>
          TASK_IN_FLIGHT_STATUSES.has(text(task.status))
        )
      ) {
        return;
      }
      if (await hasActiveAdvanceJob(db, input.tenantId, input.runId)) return;
      if (
        (imageJob && isSucceededJob(imageJob.status)) ||
        taskStates.some(({ task }) => text(task.status) === "completed")
      ) {
        await pauseContinuation(db, input, "image_results_incomplete");
        return;
      }
      const result = await startStagedAutoReviewBulkGeneration({
        runId: input.runId,
        expectedStateDigest: stagedMetadataStateDigest(metadata),
        idempotencyKey: key,
        targets: shots.map(shot => ({
          shotId: Number(shot.shotId),
          stage: "image" as const,
          model: automation.imageModel,
        })),
        auth: { userId: input.userId, tenantId: input.tenantId },
      });
      await updateContinuation(db, input, current => ({
        workerJobIds: {
          ...record(current.workerJobIds),
          images: result.workerJobId,
        },
      }));
      return;
    }

    if (automation.stage === "speaker_matching") {
      const cast = Array.isArray(plan.cast) ? plan.cast : [];
      const targetShots = shots.filter(
        shot => removeStagedMinorDialogueLines(text(shot.dialogue), cast).trim()
      );
      const incompleteShots = targetShots.filter(
        shot => !completeSpeakerBindings(shot, cast)
      );
      if (incompleteShots.length === 0) {
        await updateContinuation(db, input, () => ({ stage: "video_prompts" }));
        return;
      }
      const matchingJobIds = record(
        record(automation.workerJobIds).matchingByShot
      );
      const matchingRecoveryAttempts = {
        ...record(record(automation.workerJobIds).matchingRecoveryAttemptsByShot),
      };
      const nextMatchingJobIds = { ...matchingJobIds };
      for (const shot of incompleteShots) {
        const shotId = Number(shot.shotId);
        const imageHash = text(shot.imageArtifactHash);
        if (!imageHash || !imageResultApproved(shot, checkpoints)) {
          await pauseContinuation(db, input, "speaker_match_image_unavailable");
          return;
        }
        if (
          await hasActivePersonDetection(
            db,
            input.tenantId,
            input.runId,
            shotId
          )
        ) {
          return;
        }
        const baseKey = continuationKey(
          input.runId,
          automation.planRevision,
          `speaker-${shotId}-${imageHash}`
        );
        const previousJobId = text(matchingJobIds[String(shotId)]);
        const previousJob = previousJobId
          ? await getJobById(db, input.tenantId, previousJobId)
          : await getJobByKey(db, input.tenantId, baseKey);
        let key = baseKey;
        if (previousJob && isActiveJob(previousJob.status)) return;
        if (previousJob && !isActiveJob(previousJob.status)) {
          let retryAttempt = nextAutomaticRecoveryAttempt(
            matchingRecoveryAttempts[String(shotId)] ?? 0
          );
          let retryJob: Awaited<ReturnType<typeof getJobByKey>> | null = null;
          while (retryAttempt !== null) {
            key = continuationKey(
              input.runId,
              automation.planRevision,
              `speaker-retry-${shotId}-${imageHash}-${retryAttempt}`
            );
            retryJob = await getJobByKey(db, input.tenantId, key);
            if (!retryJob || isActiveJob(retryJob.status)) break;
            if (isSucceededJob(retryJob.status)) {
              matchingRecoveryAttempts[String(shotId)] = retryAttempt;
              retryAttempt = nextAutomaticRecoveryAttempt(retryAttempt);
              continue;
            }
            retryAttempt = nextAutomaticRecoveryAttempt(retryAttempt);
          }
          if (retryAttempt === null) {
            await pauseContinuation(db, input, "speaker_matching_failed");
            return;
          }
          matchingRecoveryAttempts[String(shotId)] = retryAttempt;
        }
        const result = await detectStagedAutoReviewShotPeople({
          runId: input.runId,
          shotId,
          expectedImageArtifactHash: imageHash,
          idempotencyKey: key,
          auth: { userId: input.userId, tenantId: input.tenantId },
        });
        nextMatchingJobIds[String(shotId)] = result.workerJobId;
        await updateContinuation(db, input, current => ({
          workerJobIds: {
            ...record(current.workerJobIds),
            matchingByShot: nextMatchingJobIds,
            matchingRecoveryAttemptsByShot: matchingRecoveryAttempts,
          },
        }));
      }
      return;
    }

    if (automation.stage === "video_prompts") {
      const cast = Array.isArray(plan.cast) ? plan.cast : [];
      if (shots.some(shot =>
        imageResultApproved(shot, checkpoints) &&
        removeStagedMinorDialogueLines(text(shot.dialogue), cast).trim() &&
        !completeSpeakerBindings(shot, cast)
      )) {
        await updateContinuation(db, input, () => ({ stage: "speaker_matching" }));
        return;
      }
      if (allPromptsReady(shots, checkpoints, "video")) {
        await updateContinuation(db, input, () => ({
          status: "completed",
          stage: "complete",
          completedAt: new Date().toISOString(),
        }));
        return;
      }
      const missingShots = missingApprovedVideoPromptShots(shots, checkpoints);
      const videoPromptJobs = {
        ...record(record(automation.workerJobIds).videoPromptsByShot),
      };
      const videoPromptRecoveryAttempts = {
        ...record(
          record(automation.workerJobIds).videoPromptRecoveryAttemptsByShot
        ),
      };
      for (const shot of missingShots) {
        const shotId = Number(shot.shotId);
        const baseKey = continuationKey(
          input.runId,
          automation.planRevision,
          `video-prompt-${shotId}-${text(shot.imageArtifactHash)}`
        );
        const previousJobId = text(videoPromptJobs[String(shotId)]);
        const previousJob = previousJobId
          ? await getJobById(db, input.tenantId, previousJobId)
          : await getJobByKey(db, input.tenantId, baseKey);
        let key = baseKey;
        if (previousJob && isActiveJob(previousJob.status)) continue;
        if (previousJob && !isActiveJob(previousJob.status)) {
          let retryAttempt = nextAutomaticRecoveryAttempt(
            videoPromptRecoveryAttempts[String(shotId)] ?? 0
          );
          let retryJob: Awaited<ReturnType<typeof getJobByKey>> | null = null;
          while (retryAttempt !== null) {
            key = continuationKey(
              input.runId,
              automation.planRevision,
              `video-prompt-retry-${shotId}-${text(shot.imageArtifactHash)}-${retryAttempt}`
            );
            retryJob = await getJobByKey(db, input.tenantId, key);
            if (!retryJob || isActiveJob(retryJob.status)) break;
            if (isSucceededJob(retryJob.status)) {
              videoPromptJobs[String(shotId)] = retryJob.id;
              await updateContinuation(db, input, current => ({
                workerJobIds: {
                  ...record(current.workerJobIds),
                  videoPromptsByShot: videoPromptJobs,
                },
              }));
              return;
            }
            retryAttempt = nextAutomaticRecoveryAttempt(retryAttempt);
          }
          if (retryAttempt === null) {
            await pauseContinuation(db, input, "video_prompt_generation_failed");
            return;
          }
          videoPromptRecoveryAttempts[String(shotId)] = retryAttempt;
        }
        const result = await generateStagedAutoReviewShotPrompt({
          runId: input.runId,
          shotId,
          stage: "video",
          expectedStateDigest: stagedMetadataStateDigest(metadata),
          idempotencyKey: key,
          auth: { userId: input.userId, tenantId: input.tenantId },
          runtime: { publicUrl: getCachedPublicAppUrl() },
          ...(automation.promptModel ? { model: automation.promptModel } : {}),
        });
        if ("workerJobId" in result && result.workerJobId) {
          videoPromptJobs[String(shotId)] = result.workerJobId;
        }
        await updateContinuation(db, input, current => ({
          workerJobIds: {
            ...record(current.workerJobIds),
            videoPromptsByShot: videoPromptJobs,
            videoPromptRecoveryAttemptsByShot: videoPromptRecoveryAttempts,
          },
        }));
      }
      return;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorCode = message.includes("staged_state_drift")
      ? "automatic_state_changed"
      : message.includes("MODEL_REQUIRED") || message.includes("model")
        ? "automatic_model_unavailable"
        : "automatic_step_failed";
    await pauseContinuation(db, input, errorCode);
  }
}
