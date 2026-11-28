import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

import {
  readStagedFinalRenderSettings,
  type StagedFinalRenderSettings,
} from "./marketplaceAutoReviewStagedRemotionRender";

import { getDb } from "../db";
import {
  marketplaceAutoReviewRuns,
  marketplaceProductAffiliateLinks,
  workerJobs,
} from "../../drizzle/schema";
import {
  enqueueMarketplaceAutoReviewWorkerJob,
  enqueueMarketplaceAutoReviewWorkerJobInTransaction,
  findMarketplaceAutoReviewWorkerJobByIdempotencyKey,
} from "./marketplaceAutoReviewWorkerJob";
import {
  StagedSequentialStoryboardMetadataV1Schema,
  type StagedCheckpointApprovalExpectationV1,
} from "@shared/marketplaceAutoReview/stagedContracts";
import { createMarketplaceDraftQcState } from "@shared/marketplaceAutoReview/draftQualityQc";
import { projectStagedReferenceManifestEntry } from "@shared/marketplaceAutoReview/stagedReferenceManifestProjection";
import { buildProductionStableHash } from "../../shared/mediaProduction";
import { deriveAssemblyDocumentationFromProductTruth } from "../../shared/marketplaceCapture/sequentialEvidencePreview";
import { deriveStagedCastFromManifest } from "./marketplaceAutoReviewStagedPipelineService";
import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  generateStagedStoryArcPlanWithLLM,
  isStagedCastMemberMinor,
  isStagedProductVisibleInShot,
  getStagedDialogueSpeakerLabels,
  parseStagedDialogueTurns,
  removeStagedMinorDialogueLines,
  type StagedStoryArcPlan,
  type StagedStoryConceptOption,
} from "./marketplaceAutoReviewStoryArcPlanner";
import { normalizeStagedDialogueTranscript } from "../../shared/marketplaceAutoReview/stagedDialogue";
import {
  findConfirmedStagedReviewConcept,
  rememberUsedReviewConcept,
} from "./marketplaceAutoReviewUsedConcepts";
import {
  buildCheckpointApprovalMutation,
  mutateStagedCheckpointMetadata,
  projectStagedCheckpoints,
  stagedMetadataStateDigest,
} from "./marketplaceAutoReviewStagedCheckpointOperations";
import {
  buildStagedImagePromptContentHash,
  buildStagedVideoPromptContentHash,
  generateStagedImagePromptWithRecovery,
} from "./marketplaceAutoReviewStagedPromptCompiler";
import {
  detectMarketplaceAutoReviewShotPeople,
  generateMarketplaceAutoReviewVideoPrompt,
  inferMarketplaceSingleSpeakerDialogueDefault,
  isMarketplaceAutoReviewVideoPromptComplete,
  MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL,
  MARKETPLACE_VERTICAL_DRAMA_VIDEO_PROMPT_SKILL,
  type MarketplaceSpeakerVisualReference,
  type MarketplaceVideoPromptSkillRun,
} from "./marketplaceAutoReviewVideoPromptSkillRunner";
import {
  generateMarketplaceSocialCaption,
  MARKETPLACE_SOCIAL_CAPTION_SKILL,
} from "./marketplaceAutoReviewSocialCaptionSkillRunner";
import {
  generateMarketplaceSocialPostImage,
  MarketplaceSocialPostImageFailure,
  resolveMarketplaceSocialPostImageModel,
  type MarketplaceSocialPostAspectRatio,
  type MarketplaceSocialPostImageResult,
} from "./marketplaceAutoReviewSocialPostImagesService";
import type { MarketplaceSocialImageVariant } from "./marketplaceAutoReviewSocialImagePromptSkillRunner";
import {
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
  refreshSequentialShotPromptWithSkillDirect,
  type SequentialStoryboardLanguage,
  type SequentialReferenceManifestEntry,
} from "./productReviewSequentialStoryboardSkillRunner";
import {
  buildStagedAudioPlan,
  buildStagedFinalAssemblyHash,
} from "./marketplaceAutoReviewStagedAudioAssembly";
import {
  MARKETPLACE_CHARACTER_CAST_MAX,
  type MarketplaceCharacterCastRole,
} from "../../shared/hyperframes/characterCast";
import { buildStagedOperationEnvelope } from "./marketplaceAutoReviewStagedCheckpointService";
import {
  initializeStagedMarketplaceAutoReviewRun,
  planAndMetadataFromRun,
  modelCost,
  modelProvider,
  requireStagedLanguagePlanFromMetadata,
  resolveShotCastSelectionFromMetadata,
} from "./marketplaceAutoReviewStagedPipelineService";
import { buildShotOrderedReferenceItems } from "../../shared/marketplaceAutoReview/shotCast";
import { stageMarketplaceInlineImageReferences } from "./mediaGenerationService";

export type StagedCheckpointAuth = { userId: number; tenantId?: string };
export type StagedCheckpointRuntime = { publicUrl?: string | null };
export type StagedAutoReviewGenerationTarget = {
  shotId: number;
  stage: "image" | "video";
  model?: string;
  promptModel?: string;
  refreshPrompt?: boolean;
  promptOnly?: boolean;
  replaceExisting?: boolean;
};

type StagedCheckpointRun = typeof marketplaceAutoReviewRuns.$inferSelect;

const STAGED_TERMINAL_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "cancelled",
]);

function assertStagedRunMutable(run: StagedCheckpointRun) {
  if (STAGED_TERMINAL_RUN_STATUSES.has(String(run.status))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_run_terminal",
    });
  }
}

function assertTerminalVideoPromptGenerationAllowed(
  run: StagedCheckpointRun,
  metadata: ReturnType<typeof parseStagedMetadata>,
  targets: Array<{ shotId: number; stage: "image" | "video" }>
) {
  if (!STAGED_TERMINAL_RUN_STATUSES.has(String(run.status))) return;
  if (
    targets.length === 0 ||
    targets.some(target => target.stage !== "video")
  ) {
    assertStagedRunMutable(run);
    return;
  }

  for (const target of targets) {
    const shot = metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === target.shotId
    );
    if (!shot) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "staged_invalid_shot_contract",
      });
    }
    if (shot.videoArtifactHash || shot.videoArtifactUrl) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "staged_terminal_prompt_cannot_replace_existing_video",
      });
    }
  }
}

function isTerminalSavedImageDispatchTarget(
  targets: StagedAutoReviewGenerationTarget[]
) {
  return (
    targets.length > 0 &&
    new Set(targets.map(target => target.shotId)).size === targets.length &&
    targets.every(
      target =>
        target.stage === "image" &&
        target.promptOnly !== true &&
        target.refreshPrompt !== true
    )
  );
}

function assertSavedImagePromptsAvailable(
  metadata: ReturnType<typeof parseStagedMetadata>,
  targets: StagedAutoReviewGenerationTarget[]
) {
  for (const target of targets) {
    if (
      target.stage !== "image" ||
      target.promptOnly === true ||
      target.refreshPrompt === true
    ) {
      continue;
    }
    const shot = metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === target.shotId
    );
    if (!shot) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "staged_invalid_shot_contract",
      });
    }
    if (!String(shot.imagePrompt ?? "").trim()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "staged_image_prompt_missing",
      });
    }
  }
}

function assertTerminalImageDispatchAllowed(
  run: StagedCheckpointRun,
  metadata: ReturnType<typeof parseStagedMetadata>,
  targets: StagedAutoReviewGenerationTarget[]
) {
  if (!STAGED_TERMINAL_RUN_STATUSES.has(String(run.status))) return;
  if (!isTerminalSavedImageDispatchTarget(targets)) {
    assertStagedRunMutable(run);
    return;
  }
  assertSavedImagePromptsAvailable(metadata, targets);
}

function assertStagedBulkGenerationAllowed(
  run: StagedCheckpointRun,
  metadata: ReturnType<typeof parseStagedMetadata>,
  targets: StagedAutoReviewGenerationTarget[]
) {
  if (!STAGED_TERMINAL_RUN_STATUSES.has(String(run.status))) return;
  if (
    targets.length > 0 &&
    targets.every(target => target.promptOnly && target.refreshPrompt)
  ) {
    assertTerminalVideoPromptGenerationAllowed(run, metadata, targets);
    return;
  }
  assertTerminalImageDispatchAllowed(run, metadata, targets);
}

function isStagedCheckpointConsumed(
  checkpoint:
    | { consumedAt?: string | null; consumedByOperationId?: string | null }
    | null
    | undefined
) {
  return Boolean(checkpoint?.consumedAt || checkpoint?.consumedByOperationId);
}

function isStagedCheckpointEditable(
  checkpoint: { state: string } | null | undefined
) {
  return Boolean(
    checkpoint &&
    ["awaiting", "rejected", "approved"].includes(checkpoint.state)
  );
}

function isStagedCheckpointRetryable(
  checkpoint:
    | {
        state: string;
        consumedAt?: string | null;
        consumedByOperationId?: string | null;
      }
    | null
    | undefined
) {
  // Any EXISTING checkpoint is retryable, full stop — the state-based
  // allowlist this used to have (only "rejected" or already-consumed) dates
  // from before every non-story checkpoint started auto-approving at
  // construction. Under that older design "approved" always meant "a human
  // just clicked approve, dispatch is about to fire in the same request", so
  // an approved-but-not-yet-consumed checkpoint was never observable state.
  // Now a checkpoint spends real time sitting "approved" but NOT yet
  // consumed — auto-approved at construction, waiting for the next sweep
  // pass (up to ~60s) to actually dispatch it — and a user who clicks retry
  // during that normal window got rejected with checkpoint_not_retryable for
  // no good reason (confirmed live: shot 5's checkpoint was approved at
  // 03:24:05 but not consumed until 03:25:13, and a retry click landing in
  // that gap 400'd). Retrying just supersedes whatever's there — including a
  // task actively in flight — and builds a fresh one; the old task, if any,
  // is simply superseded and its eventual result ignored, the same as any
  // other retry. The only case with nothing to retry is when the checkpoint
  // doesn't exist at all (shot's prompt was never compiled), which this
  // still correctly rejects.
  return Boolean(checkpoint);
}

function requireStagedTenantId(
  authTenantId?: string | null,
  runTenantId?: string | null
): string {
  const authTenant = authTenantId?.trim() ?? "";
  const runTenant = runTenantId?.trim() ?? "";
  if (!authTenant || !runTenant) {
    throw new Error("STAGED_TENANT_CONTEXT_REQUIRED");
  }
  if (authTenant !== runTenant) {
    throw new Error("STAGED_TENANT_CONTEXT_MISMATCH");
  }
  return authTenant;
}

/**
 * Prompt authoring requires approval of the current story plan.
 * `planReview.status` is a legacy summary and cannot override a newer story
 * checkpoint that returned to `awaiting` after a shot/story edit.
 */
function assertStagedStoryPlanApproved(
  metadata: ReturnType<typeof parseStagedMetadata>
) {
  const currentStoryCheckpoint =
    metadata.stagedSequentialStoryboard.reviewCheckpoints
      .filter(
        checkpoint =>
          checkpoint.kind === "story_plan" && checkpoint.state !== "superseded"
      )
      .reduce<
        | (typeof metadata.stagedSequentialStoryboard.reviewCheckpoints)[number]
        | null
      >(
        (latest, checkpoint) =>
          !latest || checkpoint.revision > latest.revision
            ? checkpoint
            : latest,
        null
      );
  if (!currentStoryCheckpoint || currentStoryCheckpoint.state !== "approved") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_story_plan_not_approved",
    });
  }
}

export function assertStagedStoryPlanApprovedForTest(metadata: unknown) {
  assertStagedStoryPlanApproved(
    StagedSequentialStoryboardMetadataV1Schema.parse(metadata)
  );
}

function assertStoryPlanApprovedForPromptRefresh(
  metadata: ReturnType<typeof parseStagedMetadata>,
  targets: StagedAutoReviewGenerationTarget[]
) {
  // A saved prompt is already a complete instruction for media generation.
  // Only authoring a replacement prompt depends on the latest story revision.
  if (targets.some(target => target.refreshPrompt)) {
    assertStagedStoryPlanApproved(metadata);
  }
}

export function assertStoryPlanApprovedForPromptRefreshForTest(
  metadata: unknown,
  targets: StagedAutoReviewGenerationTarget[]
) {
  assertStoryPlanApprovedForPromptRefresh(
    metadata as ReturnType<typeof parseStagedMetadata>,
    targets
  );
}

function tenantAccessClause(auth: StagedCheckpointAuth) {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_run_tenant_required",
    });
  }
  return eq(marketplaceAutoReviewRuns.tenantId, tenantId);
}

async function requireOwnedRun(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  runId: string,
  auth: StagedCheckpointAuth
): Promise<StagedCheckpointRun> {
  const [run] = await db
    .select()
    .from(marketplaceAutoReviewRuns)
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, runId),
        eq(marketplaceAutoReviewRuns.userId, auth.userId),
        tenantAccessClause(auth)
      )
    )
    .limit(1);
  if (!run) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Auto review run not found",
    });
  }
  return run;
}

function parseStagedMetadata(run: StagedCheckpointRun) {
  const parsed = StagedSequentialStoryboardMetadataV1Schema.safeParse(
    run.metadataJson
  );
  if (parsed.success) {
    return parsed.data;
  }
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "staged_metadata_initializing",
  });
}

function assertStagedMetadataPersisted(run: StagedCheckpointRun) {
  if (
    !StagedSequentialStoryboardMetadataV1Schema.safeParse(run.metadataJson)
      .success
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_metadata_initializing",
    });
  }
}

async function ensureStagedRunMetadata(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  run: StagedCheckpointRun
): Promise<{
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  persisted: boolean;
}> {
  const parsed = StagedSequentialStoryboardMetadataV1Schema.safeParse(
    run.metadataJson
  );
  if (parsed.success) {
    return { run, metadata: parsed.data, persisted: true };
  }

  const base = record(run.metadataJson);
  const initialization = record(base.initializationControl);
  const tenantId = String(run.tenantId ?? "").trim();
  if (!tenantId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_run_tenant_missing",
    });
  }
  if (STAGED_TERMINAL_RUN_STATUSES.has(String(run.status))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_metadata_unavailable_for_terminal_run",
    });
  }

  const baseKey = `marketplace-auto-review:${run.id}:staged-metadata-init:v1`;
  const existingJob = await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
    db,
    tenantId,
    baseKey
  );
  const activeStatuses = new Set([
    "pending",
    "queued",
    "leased",
    "claimed",
    "preparing",
    "running",
    "waiting_external",
    "retry_scheduled",
  ]);
  if (existingJob && !activeStatuses.has(String(existingJob.status))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `staged_metadata_initialization_${String(existingJob.status)}`,
    });
  }
  if (!existingJob) {
    const status = String(initialization.status ?? "missing");
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `staged_metadata_initialization_${status}`,
    });
  }

  // Do not fabricate a temporary story/shot plan while the durable skill job
  // is running. The query polls again and returns the persisted result when
  // the one initialization job succeeds.
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "staged_metadata_initializing",
  });
}

export async function initializeStagedMarketplaceAutoReviewMetadataForWorker(input: {
  runId: string;
  auth: StagedCheckpointAuth;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedRunMutable(run);
  if (
    StagedSequentialStoryboardMetadataV1Schema.safeParse(run.metadataJson)
      .success
  ) {
    return { runId: run.id, alreadyInitialized: true };
  }
  const initializedRun = await initializeStagedMarketplaceAutoReviewRun({
    db,
    run,
  });
  return { runId: initializedRun.id, alreadyInitialized: false };
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function safeArtifactUrl(value: unknown): string | null {
  const url = typeof value === "string" ? value.trim() : "";
  if (/^https?:\/\//i.test(url)) return url;
  if (
    /^\/(?:api\/|uploads\/|storage\/|media\/|assets\/|library\/|renders\/)/i.test(
      url
    )
  )
    return url;
  return null;
}

function stagedSocialCaptionProjection(value: unknown) {
  const caption = record(value);
  const text = stagedTextOrEmpty(caption.caption).slice(0, 2000);
  const hashtags = Array.isArray(caption.hashtags)
    ? caption.hashtags
        .filter((item: unknown): item is string => typeof item === "string")
        .map((item: string) => item.trim().replace(/^#+/, "").slice(0, 60))
        .filter((item: string) => item && /^[\p{L}\p{M}\p{N}_]+$/u.test(item))
        .filter(
          (item: string, index: number, all: string[]) =>
            all.indexOf(item) === index
        )
        .slice(0, 5)
    : [];
  const sourceType =
    caption.sourceType === "product" || caption.sourceType === "shot"
      ? caption.sourceType
      : null;
  if (!text || hashtags.length === 0 || !sourceType) return null;
  return {
    caption: text,
    hashtags,
    sourceType,
    referenceIndex:
      Number.isInteger(caption.referenceIndex) && caption.referenceIndex > 0
        ? caption.referenceIndex
        : null,
    shotId:
      Number.isInteger(caption.shotId) && caption.shotId > 0
        ? caption.shotId
        : null,
    sourceLabel: stagedTextOrEmpty(caption.sourceLabel).slice(0, 240),
    generatedAt: stagedTextOrEmpty(caption.generatedAt).slice(0, 64),
    postImages: stagedSocialPostImagesProjection(caption.postImages),
  };
}

export function projectStagedSocialCaptionForTest(value: unknown) {
  return stagedSocialCaptionProjection(value);
}

const STAGED_SOCIAL_IMAGE_VARIANTS = [
  "caption_source",
  "character_reference",
  "product_reference",
] as const satisfies readonly MarketplaceSocialImageVariant[];
const ACTIVE_STAGED_SOCIAL_IMAGE_JOB_STATUSES = new Set([
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "waiting_external",
  "retry_scheduled",
]);

function storedSocialPostImageUrl(value: unknown): string | null {
  const key = stagedTextOrEmpty(value).replace(/^\/+/, "");
  if (
    !key.startsWith("marketplace-auto-review/") ||
    key.split("/").some(segment => segment === ".." || !segment)
  ) {
    return null;
  }
  return `/api/storage/files/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function stagedSocialPostImagesProjection(value: unknown) {
  const postImages = record(value);
  if (!stagedTextOrEmpty(postImages.batchId)) return null;
  const variants = record(postImages.variants);
  return {
    batchId: stagedTextOrEmpty(postImages.batchId).slice(0, 100),
    requestHash: stagedTextOrEmpty(postImages.requestHash).slice(0, 256),
    modelId: stagedTextOrEmpty(postImages.modelId).slice(0, 200),
    aspectRatio:
      postImages.aspectRatio === "9:16" ? ("9:16" as const) : ("4:5" as const),
    characterReferenceIndex:
      Number.isInteger(postImages.characterReferenceIndex) &&
      postImages.characterReferenceIndex > 0
        ? postImages.characterReferenceIndex
        : null,
    productReferenceIndex:
      Number.isInteger(postImages.productReferenceIndex) &&
      postImages.productReferenceIndex > 0
        ? postImages.productReferenceIndex
        : null,
    status: ["queued", "running", "partial", "failed", "completed"].includes(
      String(postImages.status)
    )
      ? String(postImages.status)
      : "failed",
    createdAt: stagedTextOrEmpty(postImages.createdAt).slice(0, 64),
    updatedAt: stagedTextOrEmpty(postImages.updatedAt).slice(0, 64),
    variants: Object.fromEntries(
      STAGED_SOCIAL_IMAGE_VARIANTS.map(variant => {
        const entry = record(variants[variant]);
        const status = ["pending", "running", "completed", "failed"].includes(
          String(entry.status)
        )
          ? String(entry.status)
          : "pending";
        const imageUrl = storedSocialPostImageUrl(entry.imageStorageKey);
        return [
          variant,
          {
            status,
            imageUrl: status === "completed" ? imageUrl : null,
            sourceLabel: stagedTextOrEmpty(entry.sourceLabel).slice(0, 240),
            progress: Number.isFinite(Number(entry.progress))
              ? Math.max(0, Math.min(100, Number(entry.progress)))
              : null,
            promptCreditsUsed:
              Number.isFinite(Number(entry.promptCreditsUsed)) &&
              Number(entry.promptCreditsUsed) >= 0
                ? Number(entry.promptCreditsUsed)
                : null,
            imageCreditsUsed:
              Number.isFinite(Number(entry.imageCreditsUsed)) &&
              Number(entry.imageCreditsUsed) >= 0
                ? Number(entry.imageCreditsUsed)
                : null,
            createdAt: stagedTextOrEmpty(entry.createdAt).slice(0, 64),
          },
        ];
      })
    ),
  };
}

export function projectStagedSocialPostImagesForTest(value: unknown) {
  return stagedSocialPostImagesProjection(value);
}

function requireStagedImageArtifactHash(shot: {
  shotId: number;
  imageArtifactHash?: string | null;
}): string {
  const hash = shot.imageArtifactHash?.trim();
  if (!hash) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `staged_approved_image_hash_missing:shot-${shot.shotId}`,
    });
  }
  return hash;
}

function assertStagedVideoPromptImageReady(input: {
  shotId: number;
  shot:
    | {
        imageArtifactUrl?: string | null;
        imageArtifactHash?: string | null;
      }
    | undefined;
  checkpoints: Array<{
    shotId?: number | null;
    kind: string;
    state: string;
    revision?: number;
    contentHash?: string | null;
  }>;
}) {
  const currentImageResult = input.checkpoints
    .filter(
      checkpoint =>
        checkpoint.shotId === input.shotId &&
        checkpoint.kind === "image_result" &&
        checkpoint.state !== "superseded"
    )
    .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0];
  const imageHash = input.shot?.imageArtifactHash?.trim();
  if (
    !imageHash ||
    !safeArtifactUrl(input.shot.imageArtifactUrl) ||
    (currentImageResult && currentImageResult.contentHash !== imageHash)
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `staged_video_prompt_requires_approved_image:shot-${input.shotId}`,
    });
  }
}

export function assertStagedVideoPromptImageReadyForTest(input: {
  shotId: number;
  shot:
    | {
        imageArtifactUrl?: string | null;
        imageArtifactHash?: string | null;
      }
    | undefined;
  checkpoints: Array<{
    shotId?: number | null;
    kind: string;
    state: string;
    revision?: number;
    contentHash?: string | null;
  }>;
}) {
  assertStagedVideoPromptImageReady(input);
}

function stagedTextOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stagedTaskStatus(
  stagedPipeline: Record<string, any> | null | undefined,
  key: string
): string | null {
  const task = stagedPipeline?.tasks?.[key];
  const status = typeof task?.status === "string" ? task.status.trim() : "";
  return status || null;
}

function areAllWorkerTargetsPromptOnly(targets: unknown[]) {
  return (
    targets.length > 0 &&
    targets.every(target => record(target).promptOnly === true)
  );
}

export function areAllWorkerTargetsPromptOnlyForTest(targets: unknown[]) {
  return areAllWorkerTargetsPromptOnly(targets);
}

class StagedMediaTaskInFlightError extends Error {
  readonly class = "retryable" as const;
  readonly diagnosticCode = "staged_media_task_in_flight";

  constructor() {
    super("Waiting for the current shot media task to finish");
    this.name = "StagedMediaTaskInFlightError";
  }
}

/**
 * A media-producing operation that also replaces its prompt must not race a
 * render already submitted for the same shot. Prompt-only repairs do not use
 * this guard: they are independent worker jobs and supersede the active media
 * task reference when the replacement prompt is committed.
 */
export function assertStagedShotMediaSettledBeforePromptApply(
  stagedPipeline: Record<string, any> | null | undefined,
  shotId: number
) {
  const hasActiveTask = [`image:${shotId}`, `video:${shotId}`].some(key =>
    ["pending", "processing", "submitted"].includes(
      stagedTaskStatus(stagedPipeline, key) ?? ""
    )
  );
  if (hasActiveTask) throw new StagedMediaTaskInFlightError();
}

function removeStagedTasksInvalidatedByPrompt(
  stagedPipeline: Record<string, any> | null | undefined,
  targets: Array<{
    shotId: number;
    stage: "image" | "video";
    promptOnly?: boolean;
  }>
) {
  const tasks = record(stagedPipeline?.tasks);
  return Object.fromEntries(
    Object.entries(tasks).filter(
      ([key]) =>
        !targets.some(
          target =>
            key === `${target.stage}:${target.shotId}` ||
            (target.stage === "image" &&
              !target.promptOnly &&
              key === `video:${target.shotId}`)
        )
    )
  );
}

export function removeStagedTasksInvalidatedByPromptForTest(
  stagedPipeline: Record<string, any> | null | undefined,
  targets: Array<{ shotId: number; stage: "image" | "video" }>
) {
  return removeStagedTasksInvalidatedByPrompt(stagedPipeline, targets);
}

function operationFromWorkerJob(
  job: { id: string; inputJson: Record<string, unknown> },
  run: StagedCheckpointRun
) {
  const operationId =
    typeof job.inputJson.operationId === "string"
      ? job.inputJson.operationId
      : job.id;
  const metadata = parseStagedMetadata(run);
  return buildStagedOperationEnvelope({
    operationId,
    runId: run.id,
    stateDigest: stagedMetadataStateDigest(metadata),
    planRevision: metadata.stagedSequentialStoryboard.planRevision,
  });
}

function stagedResultIdempotencyKey(requestKey: string): string {
  const digest = createHash("sha256").update(requestKey).digest("hex");
  return `marketplace-auto-review-result:${digest}`;
}

export async function getStagedAutoReviewCheckpointState(
  runId: string,
  auth: StagedCheckpointAuth
) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const initialRun = await requireOwnedRun(db, runId, auth);
  let { run, metadata, persisted } = await ensureStagedRunMetadata(
    db,
    initialRun
  );

  const base = record(run.metadataJson);
  const anchors = record(base.referenceAnchors);
  const reviewTone =
    typeof anchors.reviewTone === "string" ? anchors.reviewTone : null;
  const storytellingStructure =
    typeof anchors.storytellingStructure === "string"
      ? anchors.storytellingStructure
      : null;
  const languagePlan = requireStagedLanguagePlanFromMetadata(
    metadata as Record<string, any>
  );
  const stagedPipeline =
    run.metadataJson && typeof run.metadataJson === "object"
      ? (run.metadataJson as Record<string, any>).stagedPipeline
      : null;
  const affiliateLinkRows = await db
    .select({ affiliateUrl: marketplaceProductAffiliateLinks.affiliateUrl })
    .from(marketplaceProductAffiliateLinks)
    .where(
      and(
        eq(marketplaceProductAffiliateLinks.productId, run.productId),
        eq(marketplaceProductAffiliateLinks.userId, auth.userId)
      )
    )
    .orderBy(
      asc(marketplaceProductAffiliateLinks.createdAt),
      asc(marketplaceProductAffiliateLinks.id)
    );
  const affiliateUrls: string[] = [];
  for (const row of affiliateLinkRows) {
    const affiliateUrl = row.affiliateUrl?.trim();
    if (!affiliateUrl || affiliateUrls.includes(affiliateUrl)) continue;
    try {
      const parsedUrl = new URL(affiliateUrl);
      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        continue;
      }
    } catch {
      continue;
    }
    affiliateUrls.push(affiliateUrl);
    if (affiliateUrls.length === 10) break;
  }
  // The rendered MP4 exists as soon as the worker job completes and publishes
  // its artifact. `metadata.renderUrl` is only written LATER, by Library
  // finalization, which enforces separate compliance gates (warning-overlay
  // OCR evidence, continuity QA). Field incident 2026-07-30: a render finished
  // successfully and was published as a library item, but finalization kept
  // failing its warning-overlay gate, so the panel showed nothing at all and
  // the user had no way to watch or download a video they had already paid
  // for. Surface the artifact directly; finalization staying blocked is a
  // separate (and correct) signal, not a reason to hide the file.
  const renderJobIdForArtifact =
    stagedTextOrEmpty((metadata as Record<string, any>).renderJobId) ||
    stagedTextOrEmpty((run as Record<string, any>).renderJobId);
  let publishedRenderArtifactUrl = "";
  if (
    renderJobIdForArtifact &&
    !stagedTextOrEmpty((metadata as Record<string, any>).renderUrl)
  ) {
    const [renderJobRow] = await db
      .select({ outputJson: workerJobs.outputJson, status: workerJobs.status })
      .from(workerJobs)
      .where(eq(workerJobs.id, renderJobIdForArtifact))
      .limit(1);
    if (renderJobRow && renderJobRow.status === "completed") {
      const output = (renderJobRow.outputJson ?? {}) as Record<string, any>;
      const published = Array.isArray(output.publishedArtifacts)
        ? output.publishedArtifacts
        : [];
      publishedRenderArtifactUrl =
        published
          .map((entry: any) => stagedTextOrEmpty(entry?.sourceUrl))
          .find(Boolean) ?? "";
    }
  }

  const stagedShots = metadata.stagedSequentialStoryboard.shots.map(shot => {
    const detail = stagedPipeline?.plan?.shots?.[shot.shotId - 1] ?? {};
    const promptGeneration = record(stagedPipeline?.promptGeneration);
    const standaloneDetection = record(
      promptGeneration[`person_detection:${shot.shotId}`]
    );
    const currentFrameDetection =
      standaloneDetection.sourceImageHash === shot.imageArtifactHash &&
      Array.isArray(standaloneDetection.detectedPeople)
        ? standaloneDetection.detectedPeople
        : null;
    const videoDetectionRecord = record(
      promptGeneration[`video:${shot.shotId}`]
    );
    const generatedDetection =
      currentFrameDetection ??
      (videoDetectionRecord.sourceImageHash === shot.imageArtifactHash
        ? videoDetectionRecord.detectedPeople
        : null);
    const plan = record(stagedPipeline?.plan) as unknown as StagedStoryArcPlan;
    const currentBindings = readCurrentStagedSpeakerVisualBindings({
      shot: shot as unknown as Record<string, any>,
      metadata: metadata as unknown as Record<string, any>,
      plan,
      shotId: shot.shotId,
    });
    const speakerVisualBindingsComplete =
      findStagedVideoPromptShotsMissingSpeakerBindings({
        metadata: metadata as unknown as Record<string, any>,
        plan,
        targets: [
          { shotId: shot.shotId, stage: "video", refreshPrompt: true },
        ],
      }).length === 0;
    return {
      shotId: shot.shotId,
      revision: shot.revision,
      state: shot.state,
      storySummary: shot.storySummary,
      dialogue: normalizeStagedDialogueTranscript(shot.dialogue),
      speakerFallbackName: (() => {
        const safeDialogue = removeStagedMinorDialogueLines(shot.dialogue, plan.cast);
        const speakers = getStagedDialogueSpeakerLabels(
          safeDialogue,
          plan.cast,
          (shot as any).castInShot ?? (detail as any).castInShot
        );
        return stagedDialogueSpeakerLabels(safeDialogue).length === 0 && speakers.length === 1
          ? speakers[0]
          : null;
      })(),
      title: detail.title ?? null,
      visualSummary: detail.visualSummary ?? null,
      approvedShotAction: shot.approvedShotAction ?? null,
      imagePrompt: shot.imagePrompt ?? null,
      videoPrompt: shot.videoPrompt ?? null,
      imageArtifactHash: shot.imageArtifactHash,
      videoArtifactHash: shot.videoArtifactHash,
      // Result URLs are returned only as bounded media evidence. Provider
      // task IDs, storage keys, and raw diagnostics remain server-only.
      imageArtifactUrl: safeArtifactUrl(shot.imageArtifactUrl),
      videoArtifactUrl: safeArtifactUrl(shot.videoArtifactUrl),
      imageTaskStatus: stagedTaskStatus(stagedPipeline, `image:${shot.shotId}`),
      videoTaskStatus: stagedTaskStatus(stagedPipeline, `video:${shot.shotId}`),
      // Per-shot cast (`planning/marketplace-four-character-cast/plan.md`).
      // Presence is authored by the story planner (plan shot) but can be
      // overridden by the user (state shot), so the state wins when present;
      // looks and beats are state-only and plan-only respectively.
      castInShot:
        (shot as any).castInShot ?? (detail as any).castInShot ?? null,
      castLooks: (shot as any).castLooks ?? null,
      supportingBeats: (detail as any).supportingBeats ?? null,
      detectedPeople: Array.isArray(generatedDetection)
        ? generatedDetection
            .filter((person: any) =>
              typeof person?.id === "string" &&
              typeof person?.appearance === "string" &&
              person.boundingBox &&
              [person.boundingBox.x, person.boundingBox.y, person.boundingBox.width, person.boundingBox.height].every((value: unknown) => Number.isFinite(Number(value)))
            )
            .slice(0, 12)
            .map((person: any) => ({
              id: person.id,
              appearance: String(person.appearance).slice(0, 240),
              confidence: Math.max(0, Math.min(1, Number(person.confidence) || 0)),
              boundingBox: {
                x: Math.max(0, Math.min(1, Number(person.boundingBox.x))),
                y: Math.max(0, Math.min(1, Number(person.boundingBox.y))),
                width: Math.max(0, Math.min(1, Number(person.boundingBox.width))),
                height: Math.max(0, Math.min(1, Number(person.boundingBox.height))),
              },
            }))
        : [],
      speakerVisualBindings: currentBindings ?? {},
      speakerVisualBindingsComplete,
      speakerVisualMatchIssue:
        currentFrameDetection && typeof standaloneDetection.speakerVisualMatchIssue === "string"
          ? standaloneDetection.speakerVisualMatchIssue
          : null,
    };
  });
  // Keep the persisted character identity and minor-safety fields in the
  // editor read model so a manifest edit cannot silently drop them.
  const referenceManifest = requireStagedReferenceManifest(base).map(
    (entry: any) => projectStagedReferenceManifestEntry(entry)
  );

  const workerOperationRows = await db
    .select({
      id: workerJobs.id,
      status: workerJobs.status,
      inputJson: workerJobs.inputJson,
      progressJson: workerJobs.progressJson,
      createdAt: workerJobs.createdAt,
    })
    .from(workerJobs)
    .where(
      and(
        eq(
          workerJobs.tenantId,
          requireStagedTenantId(auth.tenantId, run.tenantId)
        ),
        eq(workerJobs.jobType, "marketplace.auto_review.execute"),
        sql`${workerJobs.inputJson}->>'runId' = ${run.id}`
      )
    )
    .orderBy(
      sql`case when ${workerJobs.status} in ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled') then 0 else 1 end`,
      desc(workerJobs.createdAt)
    )
    .limit(32);
  const workerOperations = workerOperationRows.map(job => {
    const input = (job.inputJson ?? {}) as Record<string, unknown>;
    const operationInput = record(input.operationInput ?? input);
    const progress = (job.progressJson ?? {}) as Record<string, unknown>;
    const targets = Array.isArray(operationInput.targets)
      ? operationInput.targets
      : [];
    return {
      jobId: job.id,
      operation:
        typeof input.operation === "string" ? input.operation : "unknown",
      status: job.status,
      shotId: Number.isInteger(Number(operationInput.shotId))
        ? Number(operationInput.shotId)
        : null,
      targetShotIds: targets
        .map(target => Number(record(target).shotId))
        .filter(shotId => Number.isInteger(shotId) && shotId > 0),
      targetStage:
        operationInput.stage === "image" || operationInput.stage === "video"
          ? operationInput.stage
          : targets.length === 1 &&
              (record(targets[0]).stage === "image" ||
                record(targets[0]).stage === "video")
            ? record(targets[0]).stage
            : null,
      targetPromptOnly: areAllWorkerTargetsPromptOnly(targets),
      stage: typeof progress.stage === "string" ? progress.stage : null,
      progress: Number.isFinite(Number(progress.progress))
        ? Number(progress.progress)
        : null,
      createdAt:
        job.createdAt instanceof Date ? job.createdAt.toISOString() : null,
    };
  });
  const automation = record(stagedPipeline?.autoContinuation);
  const autoContinuation =
    ["running", "paused_error", "completed"].includes(
      String(automation.status)
    ) &&
    [
      "story_draft",
      "image_prompts",
      "images",
      "speaker_matching",
      "video_prompts",
      "complete",
    ].includes(String(automation.stage))
      ? {
          status: automation.status,
          stage: automation.stage,
          ...(typeof automation.errorCode === "string" &&
          /^[A-Za-z0-9_]{1,80}$/.test(automation.errorCode)
            ? { errorCode: automation.errorCode }
            : {}),
        }
      : null;

  return {
    runId: run.id,
    runStatus: run.status,
    currentStage: run.currentStage,
    outputMode: run.outputMode,
    reviewTone,
    storytellingStructure,
    planningArchitecture: metadata.planningArchitecture,
    planningArchitectureVersion: metadata.planningArchitectureVersion,
    humanApprovalPolicy: metadata.humanApprovalPolicy,
    referenceManifest,
    languagePlan,
    planRevision: metadata.stagedSequentialStoryboard.planRevision,
    stateDigest: stagedMetadataStateDigest(metadata),
    metadataInitializationPending: !persisted,
    planReview: metadata.planReview,
    autoContinuation,
    creativeQc: (metadata as any).creativeQc ?? null,
    workerOperations,
    affiliateUrls,
    audioPlan:
      stagedPipeline?.audioPlan && typeof stagedPipeline.audioPlan === "object"
        ? buildStagedAudioPlan(stagedPipeline.audioPlan as any)
        : null,
    finalAssembly:
      stagedPipeline?.finalAssembly &&
      typeof stagedPipeline.finalAssembly === "object"
        ? {
            contentHash:
              typeof stagedPipeline.finalAssembly.contentHash === "string"
                ? stagedPipeline.finalAssembly.contentHash
                : null,
            shotCount: Array.isArray(stagedPipeline.finalAssembly.shots)
              ? stagedPipeline.finalAssembly.shots.length
              : 0,
            shots: Array.isArray(stagedPipeline.finalAssembly.shots)
              ? stagedPipeline.finalAssembly.shots
                  .map((shot: any) => ({
                    shotId: Number.isInteger(shot?.shotId) ? shot.shotId : null,
                  }))
                  .filter((shot: any) => shot.shotId !== null)
              : [],
            hasAudio: Boolean(stagedPipeline.finalAssembly.audio),
            includeAudio: stagedPipeline.finalAssembly.includeAudio !== false,
          }
        : null,
    // Render settings + queue status for the "การ Render ขั้นสุดท้าย" panel.
    // Always present (never null) so the panel can show the settings form as
    // soon as the run exists, rather than only after a render was submitted.
    finalRender: {
      settings: readStagedFinalRenderSettings(metadata),
      engine:
        stagedTextOrEmpty((metadata as Record<string, any>).renderEngine) ||
        null,
      jobId:
        stagedTextOrEmpty((metadata as Record<string, any>).renderJobId) ||
        null,
      submittedAt:
        Number((metadata as Record<string, any>).renderSubmittedAt) || null,
      // `renderUrl` is written only after render finalization. The published
      // artifact URL remains visible while finalization is still pending.
      outputUrl:
        stagedTextOrEmpty((metadata as Record<string, any>).renderUrl) ||
        publishedRenderArtifactUrl ||
        null,
      /** True when the file is playable but Library finalization has not
       *  completed yet — the panel says so instead of implying it is done. */
      awaitingFinalization: Boolean(
        publishedRenderArtifactUrl &&
        !stagedTextOrEmpty((metadata as Record<string, any>).renderUrl)
      ),
      probe:
        (metadata as Record<string, any>).renderArtifactProbe &&
        typeof (metadata as Record<string, any>).renderArtifactProbe ===
          "object"
          ? {
              durationSeconds:
                Number(
                  (metadata as Record<string, any>).renderArtifactProbe
                    .durationSeconds
                ) || null,
              width:
                Number(
                  (metadata as Record<string, any>).renderArtifactProbe.width
                ) || null,
              height:
                Number(
                  (metadata as Record<string, any>).renderArtifactProbe.height
                ) || null,
              sizeBytes:
                Number(
                  (metadata as Record<string, any>).renderArtifactProbe
                    .sizeBytes
                ) || null,
            }
          : null,
      clipCount: Array.isArray((metadata as Record<string, any>).videoClipUrls)
        ? (metadata as Record<string, any>).videoClipUrls.filter(
            (url: unknown) => typeof url === "string" && url.trim()
          ).length
        : 0,
    },
    correctionRequired:
      (stagedPipeline as Record<string, any> | null)?.correctionRequired ??
      null,
    storyPlan: stagedPipeline?.planView ?? null,
    socialCaption: stagedSocialCaptionProjection(stagedPipeline?.socialCaption),
    shots: stagedShots,
    checkpoints: projectStagedCheckpoints(
      metadata.stagedSequentialStoryboard.reviewCheckpoints
    ),
  };
}

export async function generateStagedAutoReviewSocialCaption(input: {
  runId: string;
  sourceType: "product" | "shot";
  referenceIndex?: number;
  shotId?: number;
  expectedStateDigest?: string;
  expectedSourceHash?: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
  runtime?: StagedCheckpointRuntime;
  workerExecution?: boolean;
  onProgress?: (progress: {
    progress: number;
    stage: string;
    message: string;
  }) => Promise<void>;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  if (input.idempotencyKey.trim().length < 8) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid idempotency key",
    });
  }
  const sourceRef: StagedSocialCaptionSourceRef | null =
    input.sourceType === "product" &&
    Number.isSafeInteger(input.referenceIndex) &&
    input.referenceIndex! > 0 &&
    input.shotId === undefined
      ? { sourceType: "product", referenceIndex: input.referenceIndex! }
      : input.sourceType === "shot" &&
          Number.isSafeInteger(input.shotId) &&
          input.shotId! > 0 &&
          input.referenceIndex === undefined
        ? { sourceType: "shot", shotId: input.shotId! }
        : null;
  if (!sourceRef) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_caption_source_invalid",
    });
  }

  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedMetadataPersisted(run);
  const metadata = parseStagedMetadata(run);
  const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
  const sourceContext = resolveStagedSocialCaptionContext(
    run,
    metadata,
    sourceRef
  );

  if (!input.workerExecution) {
    if (
      !input.expectedStateDigest ||
      stagedMetadataStateDigest(metadata) !== input.expectedStateDigest
    ) {
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    }
    const existingJob =
      await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
        db,
        tenantId,
        input.idempotencyKey
      );
    if (existingJob) {
      if (
        existingJob.jobType !== "marketplace.auto_review.execute" ||
        record(existingJob.inputJson).operation !==
          "staged_social_caption_generation"
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "idempotency_conflict",
        });
      }
      return {
        runId: run.id,
        workerJobId: existingJob.id,
        operation: "staged_social_caption_generation",
        status: existingJob.status,
      };
    }
    const queued = await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId,
      userId: run.userId,
      runId: run.id,
      operation: {
        operation: "staged_social_caption_generation",
        runId: run.id,
        sourceType: sourceRef.sourceType,
        ...(sourceRef.sourceType === "product"
          ? { referenceIndex: sourceRef.referenceIndex }
          : { shotId: sourceRef.shotId }),
        expectedSourceHash: sourceContext.sourceHash,
        requestIdempotencyKey: input.idempotencyKey,
      },
      idempotencyKey: input.idempotencyKey,
      priority: 35,
    });
    return {
      runId: run.id,
      workerJobId: queued.jobId,
      operation: "staged_social_caption_generation",
      status: "queued",
    };
  }

  if (
    !input.expectedSourceHash ||
    sourceContext.sourceHash !== input.expectedSourceHash
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }
  const existingCaption = record(
    record(run.metadataJson).stagedPipeline
  ).socialCaption;
  if (
    existingCaption?.requestIdempotencyKey === input.idempotencyKey &&
    existingCaption?.sourceHash === input.expectedSourceHash
  ) {
    return {
      runId: run.id,
      operation: "staged_social_caption_generation",
      status: "completed",
    };
  }

  const generated = await generateMarketplaceSocialCaption({
    userId: run.userId,
    tenantId,
    publicUrl: input.runtime?.publicUrl,
    runId: run.id,
    requestIdempotencyKey: input.idempotencyKey,
    language: sourceContext.language,
    product: sourceContext.product,
    source: sourceContext.source,
    onProgress: input.onProgress,
  });

  await db.transaction(async tx => {
    const [lockedRun] = await tx
      .select()
      .from(marketplaceAutoReviewRuns)
      .where(
        and(
          eq(marketplaceAutoReviewRuns.id, input.runId),
          eq(marketplaceAutoReviewRuns.userId, input.auth.userId),
          tenantAccessClause(input.auth)
        )
      )
      .for("update")
      .limit(1);
    if (!lockedRun) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Auto review run not found",
      });
    }
    const currentMetadata = parseStagedMetadata(lockedRun);
    const currentContext = resolveStagedSocialCaptionContext(
      lockedRun,
      currentMetadata,
      sourceRef
    );
    if (currentContext.sourceHash !== input.expectedSourceHash) {
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    }
    const raw = record(lockedRun.metadataJson);
    const pipeline = record(raw.stagedPipeline);
    const generatedAt = new Date().toISOString();
    const nextMetadata = {
      ...raw,
      stagedPipeline: {
        ...pipeline,
        socialCaption: {
          caption: generated.caption,
          hashtags: generated.hashtags,
          sourceType: sourceRef.sourceType,
          ...(sourceRef.sourceType === "product"
            ? { referenceIndex: sourceRef.referenceIndex }
            : { shotId: sourceRef.shotId }),
          sourceLabel: sourceContext.source.label,
          sourceHash: input.expectedSourceHash,
          requestIdempotencyKey: input.idempotencyKey,
          skill: MARKETPLACE_SOCIAL_CAPTION_SKILL,
          generatedAt,
          creditsUsed: generated.creditsUsed,
        },
      },
    };
    await tx
      .update(marketplaceAutoReviewRuns)
      .set({ metadataJson: nextMetadata, updatedAt: new Date() })
      .where(eq(marketplaceAutoReviewRuns.id, lockedRun.id));
  });
  await input.onProgress?.({
    progress: 100,
    stage: MARKETPLACE_SOCIAL_CAPTION_SKILL,
    message: "บันทึก Caption และ Hashtag เรียบร้อยแล้ว",
  });
  return {
    runId: run.id,
    operation: "staged_social_caption_generation",
    status: "completed",
  };
}

export async function generateStagedAutoReviewSocialPostImages(input: {
  runId: string;
  batchId: string;
  expectedStateDigest?: string;
  expectedRequestHash?: string;
  requestIdempotencyKey: string;
  modelId: string;
  aspectRatio: MarketplaceSocialPostAspectRatio;
  variants: MarketplaceSocialImageVariant[];
  auth: StagedCheckpointAuth;
  runtime?: StagedCheckpointRuntime;
  workerExecution?: boolean;
  onProgress?: (progress: {
    progress: number;
    stage: string;
    message: string;
  }) => Promise<void>;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  if (
    input.requestIdempotencyKey.trim().length < 8 ||
    input.batchId.trim().length < 1
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid request key",
    });
  }
  const requestedVariants = new Set(input.variants);
  const variants = STAGED_SOCIAL_IMAGE_VARIANTS.filter(variant =>
    requestedVariants.has(variant)
  );
  if (
    variants.length === 0 ||
    variants.length !== input.variants.length ||
    new Set(variants).size !== variants.length
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_social_image_variants_invalid",
    });
  }
  if (!input.modelId.trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_social_image_selection_invalid",
    });
  }

  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedMetadataPersisted(run);
  const metadata = parseStagedMetadata(run);
  const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
  const context = resolveStagedSocialPostImagesContext({
    run,
    metadata,
    modelId: input.modelId,
    aspectRatio: input.aspectRatio,
  });
  await resolveMarketplaceSocialPostImageModel({
    modelId: input.modelId,
    aspectRatio: input.aspectRatio,
    requiredReferenceCount: Math.max(
      ...Object.values(context.sources).map(source => source.references.length)
    ),
  });
  if (
    input.expectedRequestHash &&
    context.requestHash !== input.expectedRequestHash
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }
  const requestHash = context.requestHash;
  if (input.workerExecution && !input.expectedRequestHash) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_social_image_request_hash_required",
    });
  }

  if (!input.workerExecution) {
    if (
      !input.expectedStateDigest ||
      stagedMetadataStateDigest(metadata) !== input.expectedStateDigest
    ) {
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    }
    const currentImages = record(
      record(record(record(run.metadataJson).stagedPipeline).socialCaption)
        .postImages
    );
    const isRetry = currentImages.batchId === input.batchId;
    if (!isRetry && variants.length !== STAGED_SOCIAL_IMAGE_VARIANTS.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "staged_social_image_initial_batch_requires_three_variants",
      });
    }

    return db.transaction(async tx => {
      const [lockedRun] = await tx
        .select()
        .from(marketplaceAutoReviewRuns)
        .where(
          and(
            eq(marketplaceAutoReviewRuns.id, input.runId),
            eq(marketplaceAutoReviewRuns.userId, input.auth.userId),
            tenantAccessClause(input.auth)
          )
        )
        .for("update")
        .limit(1);
      if (!lockedRun) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Auto review run not found",
        });
      }
      const lockedMetadata = parseStagedMetadata(lockedRun);
      if (
        stagedMetadataStateDigest(lockedMetadata) !== input.expectedStateDigest
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "staged_state_drift",
        });
      }
      const lockedContext = resolveStagedSocialPostImagesContext({
        run: lockedRun,
        metadata: lockedMetadata,
        modelId: input.modelId,
        aspectRatio: input.aspectRatio,
      });
      if (lockedContext.requestHash !== requestHash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "staged_state_drift",
        });
      }
      const existingJob =
        await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
          tx,
          tenantId,
          input.requestIdempotencyKey
        );
      if (existingJob) {
        if (
          existingJob.jobType !== "marketplace.auto_review.execute" ||
          record(existingJob.inputJson).operation !==
            "staged_social_post_images_generation"
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "idempotency_conflict",
          });
        }
        return {
          runId: lockedRun.id,
          batchId: input.batchId,
          workerJobId: existingJob.id,
          operation: "staged_social_post_images_generation",
          status: existingJob.status,
          requestHash,
        };
      }

      const raw = record(lockedRun.metadataJson);
      const pipeline = record(raw.stagedPipeline);
      const socialCaption = record(pipeline.socialCaption);
      const previousImages = record(socialCaption.postImages);
      const sameBatch = previousImages.batchId === input.batchId;
      if (sameBatch) {
        if (
          previousImages.requestHash !== requestHash ||
          previousImages.modelId !== input.modelId ||
          previousImages.aspectRatio !== input.aspectRatio
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "staged_state_drift",
          });
        }
        const previousVariants = record(previousImages.variants);
        const hasPendingVariant = STAGED_SOCIAL_IMAGE_VARIANTS.some(variant =>
          ["pending", "running"].includes(
            stagedTextOrEmpty(record(previousVariants[variant]).status)
          )
        );
        if (hasPendingVariant) {
          const previousRequestKey = stagedTextOrEmpty(
            previousImages.lastRequestIdempotencyKey
          );
          const previousJob = previousRequestKey
            ? await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
                tx,
                tenantId,
                previousRequestKey
              )
            : null;
          if (
            previousJob &&
            ACTIVE_STAGED_SOCIAL_IMAGE_JOB_STATUSES.has(previousJob.status)
          ) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "staged_social_images_in_progress",
            });
          }
        }
        if (
          variants.some(
            variant =>
              record(previousVariants[variant]).status === "completed" &&
              storedSocialPostImageUrl(
                record(previousVariants[variant]).imageStorageKey
              )
          )
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "staged_social_image_variant_already_completed",
          });
        }
      } else if (
        variants.length !== STAGED_SOCIAL_IMAGE_VARIANTS.length ||
        STAGED_SOCIAL_IMAGE_VARIANTS.some(
          variant => !variants.includes(variant)
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_social_image_initial_batch_requires_three_variants",
        });
      }

      const now = new Date().toISOString();
      const variantStates = sameBatch
        ? { ...record(previousImages.variants) }
        : Object.fromEntries(
            STAGED_SOCIAL_IMAGE_VARIANTS.map(variant => [
              variant,
              {
                status: "pending",
                sourceLabel: lockedContext.sources[variant].label,
                progress: 0,
              },
            ])
          );
      for (const variant of variants) {
        variantStates[variant] = {
          ...record(variantStates[variant]),
          status: "pending",
          sourceLabel: lockedContext.sources[variant].label,
          progress: 0,
          errorCode: undefined,
          updatedAt: now,
        };
      }
      const postImages = {
        ...(sameBatch ? previousImages : {}),
        batchId: input.batchId,
        requestHash: lockedContext.requestHash,
        modelId: input.modelId,
        aspectRatio: input.aspectRatio,
        status: "queued",
        createdAt: sameBatch
          ? stagedTextOrEmpty(previousImages.createdAt) || now
          : now,
        updatedAt: now,
        lastRequestIdempotencyKey: input.requestIdempotencyKey,
        variants: variantStates,
      };
      const nextMetadata = {
        ...raw,
        stagedPipeline: {
          ...pipeline,
          socialCaption: { ...socialCaption, postImages },
        },
      };
      await tx
        .update(marketplaceAutoReviewRuns)
        .set({ metadataJson: nextMetadata, updatedAt: new Date() })
        .where(eq(marketplaceAutoReviewRuns.id, lockedRun.id));
      const queued = await enqueueMarketplaceAutoReviewWorkerJobInTransaction({
        query: tx,
        admission: {
          tenantId,
          userId: lockedRun.userId,
          runId: lockedRun.id,
          operation: {
            operation: "staged_social_post_images_generation",
            runId: lockedRun.id,
            batchId: input.batchId,
            expectedRequestHash: lockedContext.requestHash,
            requestIdempotencyKey: input.requestIdempotencyKey,
            modelId: input.modelId,
            aspectRatio: input.aspectRatio,
            variants,
          },
          idempotencyKey: input.requestIdempotencyKey,
          priority: 35,
        },
      });
      return {
        runId: lockedRun.id,
        batchId: input.batchId,
        workerJobId: queued.jobId,
        operation: "staged_social_post_images_generation",
        status: "queued" as const,
        requestHash: lockedContext.requestHash,
      };
    });
  }

  const postImages = record(
    record(record(record(run.metadataJson).stagedPipeline).socialCaption)
      .postImages
  );
  if (
    postImages.batchId !== input.batchId ||
    postImages.requestHash !== requestHash ||
    postImages.modelId !== input.modelId ||
    postImages.aspectRatio !== input.aspectRatio
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }

  const persistVariant = async (
    variant: MarketplaceSocialImageVariant,
    patch: Record<string, unknown>
  ) =>
    db.transaction(async tx => {
      const [lockedRun] = await tx
        .select()
        .from(marketplaceAutoReviewRuns)
        .where(
          and(
            eq(marketplaceAutoReviewRuns.id, input.runId),
            eq(marketplaceAutoReviewRuns.userId, input.auth.userId),
            tenantAccessClause(input.auth)
          )
        )
        .for("update")
        .limit(1);
      if (!lockedRun) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Auto review run not found",
        });
      }
      const lockedMetadata = parseStagedMetadata(lockedRun);
      const currentContext = resolveStagedSocialPostImagesContext({
        run: lockedRun,
        metadata: lockedMetadata,
        modelId: input.modelId,
        aspectRatio: input.aspectRatio,
      });
      const raw = record(lockedRun.metadataJson);
      const pipeline = record(raw.stagedPipeline);
      const socialCaption = record(pipeline.socialCaption);
      const currentImages = record(socialCaption.postImages);
      if (
        currentContext.requestHash !== requestHash ||
        currentImages.batchId !== input.batchId ||
        currentImages.requestHash !== requestHash
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "staged_state_drift",
        });
      }
      const currentVariants = record(currentImages.variants);
      const nextVariants = {
        ...currentVariants,
        [variant]: {
          ...record(currentVariants[variant]),
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      };
      const statuses = STAGED_SOCIAL_IMAGE_VARIANTS.map(item =>
        stagedTextOrEmpty(record(nextVariants[item]).status)
      );
      const groupStatus = statuses.every(status => status === "completed")
        ? "completed"
        : statuses.some(status => status === "running")
          ? "running"
          : statuses.some(status => status === "pending")
            ? "queued"
            : statuses.some(status => status === "completed")
              ? "partial"
              : "failed";
      const nextPostImages = {
        ...currentImages,
        status: groupStatus,
        updatedAt: new Date().toISOString(),
        variants: nextVariants,
      };
      await tx
        .update(marketplaceAutoReviewRuns)
        .set({
          metadataJson: {
            ...raw,
            stagedPipeline: {
              ...pipeline,
              socialCaption: { ...socialCaption, postImages: nextPostImages },
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(marketplaceAutoReviewRuns.id, lockedRun.id));
      return nextPostImages;
    });

  const finalVariantStates = { ...record(postImages.variants) };
  for (const [index, variant] of variants.entries()) {
    const previousVariant = record(record(postImages.variants)[variant]);
    if (
      previousVariant.status === "completed" &&
      storedSocialPostImageUrl(previousVariant.imageStorageKey)
    ) {
      finalVariantStates[variant] = previousVariant;
      continue;
    }
    await persistVariant(variant, {
      status: "running",
      progress: 0,
      sourceLabel: context.sources[variant].label,
      attemptKey: input.requestIdempotencyKey,
      errorCode: undefined,
    });
    let generated: MarketplaceSocialPostImageResult;
    try {
      generated = await generateMarketplaceSocialPostImage({
        userId: run.userId,
        tenantId,
        publicUrl: input.runtime?.publicUrl,
        runId: run.id,
        batchId: input.batchId,
        requestIdempotencyKey: input.requestIdempotencyKey,
        modelId: input.modelId,
        aspectRatio: input.aspectRatio,
        variant,
        language: context.language,
        caption: context.caption,
        product: context.product,
        sources: context.sources[variant].references,
        onProgress: async progress => {
          const variantProgress = Math.max(
            0,
            Math.min(100, Math.round(Number(progress.progress) || 0))
          );
          await persistVariant(variant, {
            status: "running",
            progress: variantProgress,
          });
          const overallProgress = Math.round(
            ((index + variantProgress / 100) / variants.length) * 100
          );
          await input.onProgress?.({
            progress: overallProgress,
            stage: progress.stage,
            message: progress.message,
          });
        },
      });
    } catch (error) {
      const rawCode =
        error instanceof Error
          ? error.message
          : "SOCIAL_POST_IMAGE_GENERATION_FAILED";
      const errorCode = /^[A-Z0-9_:-]{1,160}$/.test(rawCode)
        ? rawCode
        : "SOCIAL_POST_IMAGE_GENERATION_FAILED";
      await persistVariant(variant, {
        status: "failed",
        progress: 100,
        ...(error instanceof MarketplaceSocialPostImageFailure
          ? {
              promptCreditsUsed: error.promptCreditsUsed,
              imageCreditsUsed: error.imageCreditsUsed,
              totalCreditsUsed:
                error.promptCreditsUsed + error.imageCreditsUsed,
            }
          : {}),
        errorCode,
      });
      finalVariantStates[variant] = { ...previousVariant, status: "failed" };
      continue;
    }
    await persistVariant(variant, {
      status: "completed",
      progress: 100,
      imageStorageKey: generated.imageStorageKey,
      taskId: generated.taskId,
      modelId: generated.modelId,
      aspectRatio: generated.aspectRatio,
      imageCreditsUsed: generated.imageCreditsUsed,
      promptCreditsUsed: generated.promptCreditsUsed,
      totalCreditsUsed:
        generated.imageCreditsUsed + generated.promptCreditsUsed,
      imagePrompt: generated.imagePrompt,
      negativePrompt: generated.negativePrompt,
      promptModel: generated.promptModel,
      promptProvider: generated.promptProvider,
      sourceLabel: context.sources[variant].label,
      errorCode: undefined,
    });
    finalVariantStates[variant] = {
      ...previousVariant,
      status: "completed",
      imageStorageKey: generated.imageStorageKey,
    };
  }
  const completedCount = STAGED_SOCIAL_IMAGE_VARIANTS.filter(
    variant =>
      record(finalVariantStates[variant]).status === "completed" &&
      storedSocialPostImageUrl(
        record(finalVariantStates[variant]).imageStorageKey
      )
  ).length;
  return {
    runId: run.id,
    batchId: input.batchId,
    operation: "staged_social_post_images_generation",
    status:
      completedCount === STAGED_SOCIAL_IMAGE_VARIANTS.length
        ? "completed"
        : completedCount > 0
          ? "partial"
          : "failed",
    completedCount,
    totalCount: STAGED_SOCIAL_IMAGE_VARIANTS.length,
  };
}

async function mutateOwnedCheckpoint(input: {
  runId: string;
  checkpointId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
  mutation: Parameters<typeof mutateStagedCheckpointMetadata>[0]["mutation"];
  jobType: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  if (input.idempotencyKey.trim().length < 8) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid idempotency key",
    });
  }

  return db.transaction(async tx => {
    const [run] = await tx
      .select()
      .from(marketplaceAutoReviewRuns)
      .where(
        and(
          eq(marketplaceAutoReviewRuns.id, input.runId),
          eq(marketplaceAutoReviewRuns.userId, input.auth.userId),
          tenantAccessClause(input.auth)
        )
      )
      .limit(1);
    if (!run) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Auto review run not found",
      });
    }
    assertStagedRunMutable(run);
    assertStagedMetadataPersisted(run);
    const metadata = parseStagedMetadata(run);
    const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
    const existingJob =
      await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
        tx,
        tenantId,
        input.idempotencyKey
      );
    if (existingJob) {
      if (existingJob.jobType !== "marketplace.auto_review.execute") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "idempotency_conflict",
        });
      }
      return {
        runId: run.id,
        operation: operationFromWorkerJob(existingJob, run),
        status: existingJob.status,
      };
    }
    const operationId = `staged-op-${nanoid(12)}`;
    const result = mutateStagedCheckpointMetadata({
      metadata,
      checkpointId: input.checkpointId,
      expectedStateDigest: input.expectedStateDigest,
      operationId,
      mutation: input.mutation,
    });
    if (!result.ok) {
      throw new TRPCError({
        code:
          result.reasonCode === "staged_state_drift"
            ? "CONFLICT"
            : "BAD_REQUEST",
        message: result.reasonCode,
      });
    }
    const metadataWithClearedCorrection = {
      ...result.metadata,
      stagedPipeline: {
        ...((result.metadata as any).stagedPipeline ?? {}),
        correctionRequired: null,
      },
    };
    const operation = buildStagedOperationEnvelope({
      operationId,
      runId: run.id,
      stateDigest: stagedMetadataStateDigest(metadataWithClearedCorrection),
      planRevision: result.operation.planRevision,
    });
    const now = new Date();
    const [updated] = await tx
      .update(marketplaceAutoReviewRuns)
      .set({
        metadataJson: metadataWithClearedCorrection as Record<string, any>,
        updatedAt: now,
      })
      .where(
        and(
          eq(marketplaceAutoReviewRuns.id, run.id),
          eq(marketplaceAutoReviewRuns.updatedAt, run.updatedAt)
        )
      )
      .returning({ id: marketplaceAutoReviewRuns.id });
    if (!updated) {
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    }
    await enqueueMarketplaceAutoReviewWorkerJobInTransaction({
      query: tx,
      admission: {
        tenantId,
        userId: input.auth.userId,
        runId: run.id,
        operation: {
          operation: "advance_run",
          runId: run.id,
          operationId,
        },
        idempotencyKey: input.idempotencyKey,
        priority: 40,
      },
    });
    return { runId: run.id, operation, status: "queued" as const };
  });
}

async function mutateOwnedStagedMetadata(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
  queueAdvance?: boolean;
  targetShotIds?: number[];
  terminalImageDispatchTargets?: StagedAutoReviewGenerationTarget[];
  terminalVideoPromptTargets?: Array<{
    shotId: number;
    stage: "image" | "video";
  }>;
  /** Merge queued shot prompts when only unrelated shot state changed. */
  allowStateDrift?: (
    metadata: ReturnType<typeof parseStagedMetadata>
  ) => boolean;
  mutate: (
    metadata: ReturnType<typeof parseStagedMetadata>,
    operationId: string
  ) =>
    | {
        metadata: ReturnType<typeof parseStagedMetadata>;
        planRevision: number;
      }
    | Promise<{
        metadata: ReturnType<typeof parseStagedMetadata>;
        planRevision: number;
      }>;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  return db.transaction(async tx => {
    const [run] = await tx
      .select()
      .from(marketplaceAutoReviewRuns)
      .where(
        and(
          eq(marketplaceAutoReviewRuns.id, input.runId),
          eq(marketplaceAutoReviewRuns.userId, input.auth.userId),
          tenantAccessClause(input.auth)
        )
      )
      .limit(1);
    if (!run)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Auto review run not found",
      });
    assertStagedMetadataPersisted(run);
    const existingMetadata = parseStagedMetadata(run);
    if (
      input.terminalImageDispatchTargets &&
      input.queueAdvance !== false
    ) {
      assertTerminalImageDispatchAllowed(
        run,
        existingMetadata,
        input.terminalImageDispatchTargets
      );
    } else if (input.terminalVideoPromptTargets && input.queueAdvance === false) {
      assertTerminalVideoPromptGenerationAllowed(
        run,
        existingMetadata,
        input.terminalVideoPromptTargets
      );
    } else {
      assertStagedRunMutable(run);
    }
    const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
    const existingJob =
      await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
        tx,
        tenantId,
        input.idempotencyKey
      );
    if (existingJob) {
      if (existingJob.jobType !== "marketplace.auto_review.execute") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "idempotency_conflict",
        });
      }
      return {
        runId: run.id,
        operation: operationFromWorkerJob(existingJob, run),
        status: existingJob.status,
      };
    }
    if (
      stagedMetadataStateDigest(existingMetadata) !==
        input.expectedStateDigest &&
      !input.allowStateDrift?.(existingMetadata)
    ) {
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    }
    const operationId = `staged-op-${nanoid(12)}`;
    const changed = await input.mutate(existingMetadata, operationId);
    const planRevisionChanged =
      changed.planRevision !==
      existingMetadata.stagedSequentialStoryboard.planRevision;
    const changedMetadata =
      planRevisionChanged && changed.metadata.creativeQc
        ? { ...changed.metadata, creativeQc: createMarketplaceDraftQcState() }
        : changed.metadata;
    const metadata = {
      ...changedMetadata,
      stagedPipeline: {
        ...((changed.metadata as any).stagedPipeline ?? {}),
        correctionRequired: null,
      },
      planReview: {
        ...changedMetadata.planReview,
        lastOperationId: operationId,
      },
    };
    const operation = buildStagedOperationEnvelope({
      operationId,
      runId: run.id,
      stateDigest: stagedMetadataStateDigest(metadata),
      planRevision: changed.planRevision,
    });
    const now = new Date();
    const reviveForImageDispatch = Boolean(
      input.terminalImageDispatchTargets &&
        STAGED_TERMINAL_RUN_STATUSES.has(String(run.status))
    );
    const [updated] = await tx
      .update(marketplaceAutoReviewRuns)
      .set({
        metadataJson: metadata as Record<string, any>,
        ...(reviveForImageDispatch
          ? {
              status: "running",
              currentStage: "image_generation",
              stageIndex: 5,
              completedAt: null,
            }
          : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(marketplaceAutoReviewRuns.id, run.id),
          eq(marketplaceAutoReviewRuns.updatedAt, run.updatedAt)
        )
      )
      .returning({ id: marketplaceAutoReviewRuns.id });
    if (!updated)
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    if (input.queueAdvance !== false) {
      await enqueueMarketplaceAutoReviewWorkerJobInTransaction({
        query: tx,
        admission: {
          tenantId,
          userId: input.auth.userId,
          runId: run.id,
        operation: {
          operation: "advance_run",
          runId: run.id,
          operationId,
          ...(input.targetShotIds
            ? { targetShotIds: input.targetShotIds }
            : input.terminalImageDispatchTargets
            ? {
                targetShotIds: input.terminalImageDispatchTargets.map(
                  target => target.shotId
                  ),
                }
              : {}),
          },
          idempotencyKey: input.idempotencyKey,
          priority: 40,
        },
      });
    }
    return {
      runId: run.id,
      operation,
      status:
        input.queueAdvance === false
          ? ("completed" as const)
          : ("queued" as const),
    };
  });
}

export async function startStagedAutoReviewBulkGeneration(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  targets: StagedAutoReviewGenerationTarget[];
  auth: StagedCheckpointAuth;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedMetadataPersisted(run);
  const metadata = parseStagedMetadata(run);
  assertSavedImagePromptsAvailable(metadata, input.targets);
  assertStagedBulkGenerationAllowed(run, metadata, input.targets);
  assertStagedVideoPromptSpeakerBindingsComplete({
    metadata: metadata as unknown as Record<string, any>,
    plan: planAndMetadataFromRun(run).plan,
    targets: input.targets,
  });
  const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
  const existingJob = await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
    db,
    tenantId,
    input.idempotencyKey
  );
  if (existingJob) {
    if (
      existingJob.jobType !== "marketplace.auto_review.execute" ||
      record(existingJob.inputJson).operation !== "staged_bulk_generation"
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "idempotency_conflict",
      });
    }
    return {
      runId: run.id,
      workerJobId: existingJob.id,
      operation: "staged_bulk_generation",
      status: existingJob.status,
    };
  }

  // This mutation only admits a durable job. Its targets and prerequisites
  // have just been validated against the latest persisted metadata above,
  // and the worker validates them again before applying anything. Comparing
  // the whole-storyboard digest here made an unrelated shot update reject an
  // otherwise valid job (the common case when users generate prompts for
  // several shots while worker results are being saved).
  assertStoryPlanApprovedForPromptRefresh(metadata, input.targets);
  if (input.targets.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_bulk_targets_required",
    });
  }
  const seenShots = new Set<number>();
  for (const target of input.targets) {
    if (seenShots.has(target.shotId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "staged_bulk_duplicate_shot",
      });
    }
    seenShots.add(target.shotId);
    if (target.promptOnly && !target.refreshPrompt) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `staged_prompt_generation_requires_refresh:shot-${target.shotId}`,
      });
    }
    if (!target.promptOnly) {
      const model = target.model?.trim();
      if (!model) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `STAGED_${target.stage.toUpperCase()}_MODEL_REQUIRED`,
        });
      }
      modelProvider(model);
      modelCost(model);
    }
    const shot = metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === target.shotId
    );
    if (!shot) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "staged_invalid_shot_contract",
      });
    }
    if (target.stage === "video") {
      assertStagedVideoPromptImageReady({
        shotId: target.shotId,
        shot,
        checkpoints: metadata.stagedSequentialStoryboard.reviewCheckpoints,
      });
    }
    const taskKeys =
      target.stage === "image"
        ? [`image:${target.shotId}`, `video:${target.shotId}`]
        : [`image:${target.shotId}`, `video:${target.shotId}`];
    const hasTaskInFlight = taskKeys.some(key =>
      ["pending", "processing", "submitted"].includes(
        stagedTaskStatus(record((metadata as any).stagedPipeline), key) ?? ""
      )
    );
    if (hasTaskInFlight && !target.promptOnly) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "staged_media_task_in_flight",
      });
    }
    if (
      target.stage === "image" &&
      !target.refreshPrompt &&
      !target.replaceExisting &&
      (shot.imageArtifactHash || shot.imageArtifactUrl)
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "staged_bulk_target_already_has_image",
      });
    }
    if (
      target.stage === "video" &&
      !target.promptOnly &&
      !target.replaceExisting &&
      (shot.videoArtifactHash || shot.videoArtifactUrl)
    ) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "staged_bulk_video_target_not_ready",
      });
    }
  }

  const queued = await enqueueMarketplaceAutoReviewWorkerJob({
    tenantId,
    userId: run.userId,
    runId: run.id,
    operation: {
      operation: "staged_bulk_generation",
      runId: run.id,
      expectedStateDigest: input.expectedStateDigest,
      requestIdempotencyKey: input.idempotencyKey,
      targets: input.targets,
    },
    idempotencyKey: input.idempotencyKey,
    priority: 35,
  });
  return {
    runId: run.id,
    workerJobId: queued.jobId,
    operation: "staged_bulk_generation",
    status: "queued",
    targetCount: input.targets.length,
  };
}

/**
 * Worker-side bulk prompt preparation. The complete target set is committed
 * in one staged metadata transaction, then one canonical advance job submits
 * the generated images/videos. Closing or refreshing the browser cannot
 * interrupt this batch.
 */
export async function executeStagedAutoReviewBulkGeneration(input: {
  runId: string;
  expectedStateDigest: string;
  requestIdempotencyKey: string;
  targets: StagedAutoReviewGenerationTarget[];
  auth: StagedCheckpointAuth;
  runtime?: StagedCheckpointRuntime;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedMetadataPersisted(run);
  const metadata = parseStagedMetadata(run);
  assertSavedImagePromptsAvailable(metadata, input.targets);
  assertStagedBulkGenerationAllowed(run, metadata, input.targets);
  assertStoryPlanApprovedForPromptRefresh(metadata, input.targets);
  assertStagedVideoPromptSpeakerBindingsComplete({
    metadata: metadata as unknown as Record<string, any>,
    plan: planAndMetadataFromRun(run).plan,
    targets: input.targets,
  });
  const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
  const requestHash = createHash("sha256")
    .update(input.requestIdempotencyKey)
    .digest("hex");
  const stagedPipeline = record((metadata as any).stagedPipeline);
  const receipts = record(stagedPipeline.bulkGenerationReceipts);
  if (receipts[requestHash]) {
    return {
      runId: run.id,
      alreadyQueued: true,
      shotCount: Array.isArray(receipts[requestHash].shotIds)
        ? receipts[requestHash].shotIds.length
        : 0,
    };
  }

  const promptByShot = new Map<
    number,
    {
      prompt: string;
      model: string;
      provider: string;
      estimatedCredits: number;
      skillRuns: MarketplaceVideoPromptSkillRun[];
      generated: boolean;
      detectedPeople?: Array<{ id: string; appearance: string }>;
    }
  >();
  const promptContextDigests = new Map<number, string>();
  // Validate the complete batch before any skill call. Prompt-only jobs can
  // run alongside media work; media dispatch requires the shot to be settled.
  for (const target of input.targets) {
    if (!target.promptOnly) {
      const model = target.model?.trim();
      if (!model) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `STAGED_${target.stage.toUpperCase()}_MODEL_REQUIRED`,
        });
      }
      modelProvider(model);
      modelCost(model);
      assertStagedShotMediaSettledBeforePromptApply(
        stagedPipeline,
        target.shotId
      );
    }
  }
  for (const target of input.targets) {
    const shot = metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === target.shotId
    );
    if (!shot) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "staged_invalid_shot_contract",
      });
    }
    const taskKeys =
      target.stage === "image"
        ? [`image:${target.shotId}`, `video:${target.shotId}`]
        : [`image:${target.shotId}`, `video:${target.shotId}`];
    const hasTaskInFlight = taskKeys.some(key =>
      ["pending", "processing", "submitted"].includes(
        stagedTaskStatus(stagedPipeline, key) ?? ""
      )
    );
    if (hasTaskInFlight && !target.promptOnly) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `staged_media_task_in_flight:shot-${target.shotId}`,
      });
    }
    if (target.promptOnly && !target.refreshPrompt) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `staged_prompt_generation_requires_refresh:shot-${target.shotId}`,
      });
    }
    if (
      target.stage === "image" &&
      !target.refreshPrompt &&
      !target.replaceExisting &&
      (shot.imageArtifactHash || shot.imageArtifactUrl)
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `staged_image_already_exists:shot-${target.shotId}`,
      });
    }
    if (
      target.stage === "video" &&
      !target.promptOnly &&
      !target.replaceExisting &&
      (shot.videoArtifactHash || shot.videoArtifactUrl)
    ) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `staged_video_already_exists:shot-${target.shotId}`,
      });
    }
    const currentPrompt =
      target.stage === "image"
        ? String(shot.imagePrompt ?? "").trim()
        : String(shot.videoPrompt ?? "").trim();
    if (!target.refreshPrompt) {
      if (!currentPrompt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `staged_${target.stage}_prompt_missing:shot-${target.shotId}`,
        });
      }
      const activePromptCheckpoint =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.shotId === target.shotId &&
            checkpoint.kind ===
              (target.stage === "image" ? "image_prompt" : "video_prompt") &&
            checkpoint.state === "approved"
        );
      if (target.promptOnly && !activePromptCheckpoint) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `staged_${target.stage}_prompt_checkpoint_missing:shot-${target.shotId}`,
        });
      }
      const model = target.model?.trim();
      if (!target.promptOnly && !model) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `STAGED_${target.stage.toUpperCase()}_MODEL_REQUIRED`,
        });
      }
      const resolvedModel = target.promptOnly
        ? activePromptCheckpoint?.approvedModel
        : model;
      const resolvedProvider = target.promptOnly
        ? activePromptCheckpoint?.approvedProvider
        : modelProvider(resolvedModel!);
      const estimatedCredits = target.promptOnly
        ? activePromptCheckpoint?.estimatedCredits
        : modelCost(resolvedModel!);
      if (!resolvedModel || !resolvedProvider || estimatedCredits === null) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `staged_${target.stage}_prompt_provenance_missing:shot-${target.shotId}`,
        });
      }
      promptByShot.set(target.shotId, {
        prompt: currentPrompt,
        model: resolvedModel,
        provider: resolvedProvider,
        estimatedCredits,
        skillRuns: [],
        generated: false,
      });
      continue;
    }
    if (target.promptOnly) {
      promptContextDigests.set(
        target.shotId,
        buildStagedShotPromptContextDigest({
          run,
          metadata,
          shotId: target.shotId,
          stage: target.stage,
          publicUrl: input.runtime?.publicUrl,
          tenantId: input.auth.tenantId,
          model: target.promptModel,
        })
      );
    }
    const generatedPrompt = await generateCompleteStagedShotPrompt({
      run,
      metadata,
      shotId: target.shotId,
      publicUrl: input.runtime?.publicUrl,
      tenantId: input.auth.tenantId,
      stage: target.stage,
      model: target.promptModel,
      requestIdempotencyKey: `marketplace-auto-review-bulk:${requestHash}:shot-${target.shotId}:${target.stage}`,
    });
    promptByShot.set(target.shotId, { ...generatedPrompt, generated: true });
  }

  if (promptByShot.size === 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_bulk_generation_produced_no_prompts",
    });
  }

  const expectedStateDigest = stagedMetadataStateDigest(metadata);
  const applyIdempotencyKey = `marketplace-auto-review-bulk-apply:${requestHash}`;
  const terminalImageDispatchTargets =
    STAGED_TERMINAL_RUN_STATUSES.has(String(run.status)) &&
    isTerminalSavedImageDispatchTarget(input.targets)
      ? input.targets
      : undefined;
  return mutateOwnedStagedMetadata({
    runId: run.id,
    expectedStateDigest,
    idempotencyKey: applyIdempotencyKey,
    auth: input.auth,
    queueAdvance: input.targets.some(target => !target.promptOnly),
    targetShotIds: input.targets
      .filter(target => !target.promptOnly)
      .map(target => target.shotId),
    ...(terminalImageDispatchTargets
      ? { terminalImageDispatchTargets }
      : {}),
    ...(input.targets.every(target => target.promptOnly && target.refreshPrompt)
      ? { terminalVideoPromptTargets: input.targets }
      : {}),
    allowStateDrift: input.targets.every(target => target.promptOnly)
      ? current =>
          input.targets.every(target => {
            const expectedContextDigest = promptContextDigests.get(
              target.shotId
            );
            const currentShot = current.stagedSequentialStoryboard.shots.find(
              shot => shot.shotId === target.shotId
            );
            return (
              typeof expectedContextDigest === "string" &&
              currentShot !== undefined &&
              buildStagedShotPromptContextDigest({
                run,
                metadata: current,
                shotId: target.shotId,
                stage: target.stage,
                publicUrl: input.runtime?.publicUrl,
                tenantId: input.auth.tenantId,
                model: target.promptModel,
              }) === expectedContextDigest
            );
          })
      : undefined,
    mutate(current, operationId) {
      const nextTargets = input.targets;
      const replacementByShot = new Map<number, any>();
      const nextShots = current.stagedSequentialStoryboard.shots.map(shot => {
        const target = nextTargets.find(item => item.shotId === shot.shotId);
        if (!target) return shot;
        const preparedPrompt = promptByShot.get(target.shotId);
        if (!preparedPrompt) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: `staged_bulk_prompt_result_missing:shot-${target.shotId}`,
          });
        }
        const prompt = preparedPrompt.prompt;
        const revision = shot.revision + 1;
        const imagePrompt = target.stage === "image";
        const kind = imagePrompt ? "image_prompt" : "video_prompt";
        const selectedModel = target.model?.trim() ?? "";
        const resolvedModel = target.promptOnly
          ? preparedPrompt.model
          : selectedModel;
        if (!resolvedModel) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `STAGED_${target.stage.toUpperCase()}_MODEL_REQUIRED`,
          });
        }
        const replacement = buildStagedCheckpoint({
          checkpointId: `${kind}:${run.id}:shot-${target.shotId}:r${revision}:bulk-${operationId}`,
          kind,
          shotId: target.shotId,
          revision,
          contentHash: imagePrompt
            ? buildStagedImagePromptContentHash({
                revision,
                shotId: target.shotId,
                prompt,
                referenceManifestHash: requireStagedReferenceManifestHash(
                  current.stagedSequentialStoryboard.referenceManifestHash
                ),
              })
            : buildStagedVideoPromptContentHash({
                revision,
                shotId: target.shotId,
                prompt,
                imageArtifactHash: requireStagedImageArtifactHash(shot),
              }),
          provider: target.promptOnly
            ? preparedPrompt.provider
            : modelProvider(resolvedModel),
          model: resolvedModel,
          estimatedCredits: target.promptOnly
            ? preparedPrompt.estimatedCredits
            : modelCost(resolvedModel),
          referenceManifestHash:
            current.stagedSequentialStoryboard.referenceManifestHash,
          autoApprove: { userId: input.auth.userId },
          ...(!target.promptOnly
            ? {
                mediaDispatchIntent: {
                  requestedByUserId: input.auth.userId,
                },
              }
            : {}),
        });
        replacementByShot.set(target.shotId, replacement);
        return imagePrompt && !target.promptOnly
          ? {
              ...shot,
              revision,
              imagePrompt: prompt,
              imagePromptHash: replacement.contentHash,
              imageArtifactHash: null,
              imageArtifactUrl: null,
              videoPrompt: null,
              videoPromptHash: null,
              videoArtifactHash: null,
              videoArtifactUrl: null,
              state: "image_prompt_awaiting",
            }
          : imagePrompt
            ? {
                ...shot,
                revision,
                imagePrompt: prompt,
                imagePromptHash: replacement.contentHash,
              }
            : {
              ...shot,
              revision,
              videoPrompt: prompt,
              videoPromptHash: replacement.contentHash,
              videoArtifactHash: null,
              videoArtifactUrl: null,
              state: "video_prompt_awaiting",
            };
      });
      const targetByShot = new Map(
        nextTargets.map(target => [target.shotId, target])
      );
      const invalidated = current.stagedSequentialStoryboard.reviewCheckpoints.map(
        checkpoint => {
          const target = targetByShot.get(checkpoint.shotId);
          const invalidatedByImage =
            target?.stage === "image" &&
            (target.promptOnly
              ? checkpoint.kind === "image_prompt"
              : [
                  "image_prompt",
                  "image_result",
                  "video_prompt",
                  "video_result",
                ].includes(checkpoint.kind));
          const invalidatedByVideo =
            target?.stage === "video" &&
            ["video_prompt", "video_result"].includes(checkpoint.kind);
          if (
            (invalidatedByImage || invalidatedByVideo) &&
            checkpoint.state !== "superseded"
          ) {
            return {
              ...checkpoint,
              state: "superseded" as const,
              rejectionReasonCode: "staged_bulk_generation",
            };
          }
          return checkpoint;
        }
      );
      const tasks = removeStagedTasksInvalidatedByPrompt(
        record((current as any).stagedPipeline),
        nextTargets.map(target => ({
          ...target,
          promptOnly: target.promptOnly,
        }))
      );
      const existingReceipts = record(
        record((current as any).stagedPipeline).bulkGenerationReceipts
      );
      const receiptEntries = Object.entries(existingReceipts).slice(-19);
      const bulkGenerationReceipts = Object.fromEntries([
        ...receiptEntries,
        [
          requestHash,
          {
            queuedAt: new Date().toISOString(),
            shotIds: nextTargets.map(target => target.shotId),
          },
        ],
      ]);
      const generatedAt = new Date().toISOString();
      const promptGeneration = {
        ...record(record((current as any).stagedPipeline).promptGeneration),
      };
      for (const target of nextTargets) {
        const prepared = promptByShot.get(target.shotId);
        if (prepared?.generated) {
          promptGeneration[`${target.stage}:${target.shotId}`] = {
            generatedAt,
            operationId,
            source: prepared.skillRuns.map(run => run.skill).join(" + "),
            model: prepared.model,
            provider: prepared.provider,
            estimatedCredits: prepared.estimatedCredits,
            skillRuns: prepared.skillRuns,
            ...(prepared.detectedPeople
              ? {
                  detectedPeople: prepared.detectedPeople,
                  sourceImageHash: current.stagedSequentialStoryboard.shots.find(
                    shot => shot.shotId === target.shotId
                  )?.imageArtifactHash,
                }
              : {}),
          };
        }
      }
      return {
        metadata: {
          ...current,
          stagedPipeline: {
            ...record((current as any).stagedPipeline),
            tasks,
            finalAssembly: null,
            promptGeneration,
            bulkGenerationReceipts,
          },
          stagedSequentialStoryboard: {
            ...current.stagedSequentialStoryboard,
            shots: nextShots,
            reviewCheckpoints: [
              ...invalidated,
              ...nextTargets
                .map(target => replacementByShot.get(target.shotId))
                .filter(Boolean),
            ],
          },
        },
        planRevision: current.planReview.planRevision,
      };
    },
  });
}

function replaceCheckpointState(
  metadata: ReturnType<typeof parseStagedMetadata>,
  checkpointId: string,
  state: "superseded"
) {
  return {
    ...metadata,
    stagedSequentialStoryboard: {
      ...metadata.stagedSequentialStoryboard,
      reviewCheckpoints:
        metadata.stagedSequentialStoryboard.reviewCheckpoints.map(checkpoint =>
          checkpoint.checkpointId === checkpointId
            ? { ...checkpoint, state, rejectionReasonCode: "staged_shot_retry" }
            : checkpoint
        ),
    },
  };
}

export async function editStagedAutoReviewShot(input: {
  runId: string;
  shotId?: number;
  expectedStateDigest: string;
  idempotencyKey: string;
  storySummary?: string;
  approvedShotAction?: string;
  dialogue?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  speakerVisualBindings?: Record<string, string>;
  auth: StagedCheckpointAuth;
}) {
  if (
    ![
      input.storySummary,
      input.approvedShotAction,
      input.dialogue,
      input.imagePrompt,
      input.videoPrompt,
      input.speakerVisualBindings,
    ].some(value => value !== undefined)
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_invalid_edit",
    });
  }
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    queueAdvance: input.speakerVisualBindings === undefined,
    mutate(metadata, operationId) {
      const storyEdit =
        input.storySummary !== undefined || input.dialogue !== undefined;
      const approvedShotActionEdit = input.approvedShotAction !== undefined;
      const plan = ((metadata as any).stagedPipeline?.plan ??
        null) as StagedStoryArcPlan | null;
      const storyCheckpoint =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.kind === "story_plan" &&
            checkpoint.state !== "superseded"
        );
      if (!plan || !storyCheckpoint) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "checkpoint_not_ready",
        });
      }

      if (storyEdit && input.shotId === undefined) {
        const revision = metadata.planReview.planRevision + 1;
        const storySummary =
          input.storySummary?.trim().slice(0, 500) || plan.storySummary;
        const nextPlan: StagedStoryArcPlan = {
          ...plan,
          planRevision: revision,
          storySummary,
        };
        nextPlan.storyPlanHash = buildProductionStableHash(nextPlan);
        const replacement = buildStagedCheckpoint({
          checkpointId: `story-plan:${input.runId}:r${revision}:op-${operationId}`,
          kind: "story_plan",
          revision,
          contentHash: nextPlan.storyPlanHash,
          model: "user-edit",
          provider: "user",
          estimatedCredits: 0,
          referenceManifestHash:
            metadata.stagedSequentialStoryboard.referenceManifestHash,
        });
        const invalidatedCheckpoints =
          metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
            checkpoint => {
              const invalidated =
                checkpoint.kind === "story_plan" ||
                checkpoint.kind === "video_prompt" ||
                checkpoint.kind === "video_result" ||
                checkpoint.kind === "audio_plan" ||
                checkpoint.kind === "final_assembly";
              return invalidated && checkpoint.state !== "superseded"
                ? {
                    ...checkpoint,
                    state: "superseded" as const,
                    rejectionReasonCode: "staged_story_updated",
                  }
                : checkpoint;
            }
          );
        const pipeline = record((metadata as any).stagedPipeline);
        const tasks = Object.fromEntries(
          Object.entries(record(pipeline.tasks)).filter(([key]) =>
            !/^(?:image|video|audio):/.test(key)
          )
        );
        return {
          metadata: {
            ...metadata,
            planReview: {
              ...metadata.planReview,
              planRevision: revision,
              status: "awaiting" as const,
              approvedRevision: null,
            },
            stagedPipeline: {
              ...pipeline,
              plan: nextPlan,
              planView: buildStagedPlanView(nextPlan),
              tasks,
              audioPlan: null,
              audioUrl: null,
              finalAssembly: null,
            },
            stagedSequentialStoryboard: {
              ...metadata.stagedSequentialStoryboard,
              planRevision: revision,
              storyPlanStatus: "awaiting" as const,
              storyPlanHash: nextPlan.storyPlanHash,
              shots: metadata.stagedSequentialStoryboard.shots.map(item => ({
                ...item,
                revision: item.revision + 1,
                state:
                  item.imageArtifactHash && item.imageArtifactUrl
                    ? "image_result_approved"
                    : "story_awaiting",
                videoPrompt: null,
                videoPromptHash: null,
                videoArtifactHash: null,
                videoArtifactUrl: null,
              })),
              reviewCheckpoints: [...invalidatedCheckpoints, replacement],
            },
          },
          planRevision: revision,
        };
      }

      if (input.shotId === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_invalid_shot_contract",
        });
      }
      const shot = metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === input.shotId
      );
      if (!shot) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_invalid_shot_contract",
        });
      }

      if (approvedShotActionEdit) {
        if (
          input.storySummary !== undefined ||
          input.dialogue !== undefined ||
          input.imagePrompt !== undefined ||
          input.videoPrompt !== undefined ||
          input.speakerVisualBindings !== undefined
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "staged_shot_action_edit_must_be_isolated",
          });
        }
        const approvedShotAction = input.approvedShotAction!.trim();
        if (!approvedShotAction || approvedShotAction.length > 420) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "staged_shot_action_required",
          });
        }
        const revision = shot.revision + 1;
        const invalidatedCheckpoints =
          metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
            checkpoint => {
              const invalidatedVideo =
                checkpoint.shotId === input.shotId &&
                ["video_prompt", "video_result"].includes(checkpoint.kind);
              const invalidatedFinal = checkpoint.kind === "final_assembly";
              return (invalidatedVideo || invalidatedFinal) &&
                checkpoint.state !== "superseded"
                ? {
                    ...checkpoint,
                    state: "superseded" as const,
                    rejectionReasonCode: "staged_shot_action_updated",
                  }
                : checkpoint;
            }
          );
        const tasks = removeStagedTasksInvalidatedByPrompt(
          record((metadata as any).stagedPipeline),
          [{ shotId: input.shotId, stage: "video" }]
        );
        return {
          metadata: {
            ...metadata,
            stagedPipeline: {
              ...record((metadata as any).stagedPipeline),
              tasks,
              finalAssembly: null,
            },
            stagedSequentialStoryboard: {
              ...metadata.stagedSequentialStoryboard,
              shots: metadata.stagedSequentialStoryboard.shots.map(item =>
                item.shotId === input.shotId
                  ? {
                      ...item,
                      revision,
                      approvedShotAction,
                      state:
                        shot.videoPrompt ||
                        shot.videoArtifactHash ||
                        shot.videoArtifactUrl
                          ? "video_prompt_awaiting"
                          : shot.state,
                      videoPrompt: null,
                      videoPromptHash: null,
                      videoArtifactHash: null,
                      videoArtifactUrl: null,
                    }
                  : item
              ),
              reviewCheckpoints: invalidatedCheckpoints,
            },
          },
          planRevision: metadata.planReview.planRevision,
        };
      }

      if (input.speakerVisualBindings !== undefined) {
        if (
          input.storySummary !== undefined || input.dialogue !== undefined ||
          input.imagePrompt !== undefined || input.videoPrompt !== undefined
        ) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "staged_speaker_binding_edit_must_be_isolated" });
        }
        const safeDialogue = removeStagedMinorDialogueLines(
          shot.dialogue,
          plan.cast
        );
        const dialogueSpeakers = getStagedDialogueSpeakerLabels(
          safeDialogue,
          plan.cast,
          shot.castInShot
        );
        const bindings = input.speakerVisualBindings;
        const promptGeneration = record((metadata as any).stagedPipeline?.promptGeneration);
        const standaloneDetection = record(promptGeneration[`person_detection:${input.shotId}`]);
        const videoDetection = record(promptGeneration[`video:${input.shotId}`]);
        const detectionKey =
          standaloneDetection.sourceImageHash === shot.imageArtifactHash &&
          Array.isArray(standaloneDetection.detectedPeople)
            ? `person_detection:${input.shotId}`
            : `video:${input.shotId}`;
        const currentDetection =
          detectionKey === `person_detection:${input.shotId}`
            ? standaloneDetection
            : videoDetection;
        const detected =
          currentDetection.sourceImageHash === shot.imageArtifactHash &&
          Array.isArray(currentDetection.detectedPeople)
            ? currentDetection.detectedPeople
            : null;
        if (!Array.isArray(detected)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "staged_person_detection_required" });
        }
        if (bindings !== undefined) {
          const detectedIds = new Set(
            detected.map((person: any) => person?.id)
          );
          const selectedIds = Object.values(bindings);
          if (
            Object.keys(bindings).length !== dialogueSpeakers.length ||
            dialogueSpeakers.some(speaker => typeof bindings[speaker] !== "string" || !detectedIds.has(bindings[speaker])) ||
            new Set(selectedIds).size !== selectedIds.length
          ) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "staged_invalid_speaker_visual_bindings" });
          }
        }
        const revision = shot.revision + 1;
        const bindingsSourceHash = buildStagedSpeakerBindingsSourceHash({
          imageArtifactHash: shot.imageArtifactHash,
          dialogue: safeDialogue,
          speakerLabels: dialogueSpeakers,
        });
        const invalidatedCheckpoints = metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
          checkpoint =>
            checkpoint.shotId === input.shotId &&
            ["video_prompt", "video_result"].includes(checkpoint.kind) &&
            checkpoint.state !== "superseded"
              ? {
                  ...checkpoint,
                  state: "superseded" as const,
                  rejectionReasonCode: "staged_speaker_binding_updated",
                }
              : checkpoint
        );
        const tasks = removeStagedTasksInvalidatedByPrompt(
          record((metadata as any).stagedPipeline),
          [{ shotId: input.shotId, stage: "video" }]
        );
        const nextShot = {
          ...shot,
          revision,
          state: "video_prompt_awaiting" as const,
          videoPrompt: null,
          videoPromptHash: null,
          videoArtifactHash: null,
          videoArtifactUrl: null,
          ...(bindings !== undefined
            ? {
                speakerVisualBindings: bindings,
                speakerVisualBindingsImageHash: shot.imageArtifactHash,
                speakerVisualBindingsMatchType: "manual",
                speakerVisualBindingsSourceHash: bindingsSourceHash,
              }
            : {}),
        };
        return {
          metadata: {
            ...metadata,
            stagedPipeline: {
              ...record((metadata as any).stagedPipeline),
              tasks,
              finalAssembly: null,
            },
            stagedSequentialStoryboard: {
              ...metadata.stagedSequentialStoryboard,
              shots: metadata.stagedSequentialStoryboard.shots.map(item =>
                item.shotId === input.shotId
                  ? nextShot
                  : item
              ),
              reviewCheckpoints: invalidatedCheckpoints,
            },
          },
          planRevision: metadata.planReview.planRevision,
        };
      }

      if (storyEdit) {
        const revision = metadata.planReview.planRevision + 1;
        const shotRevision = shot.revision + 1;
        const safeDialogue = removeStagedMinorDialogueLines(
          input.dialogue ?? shot.dialogue,
          plan.cast
        );
        const nextShot = {
          ...shot,
          revision: shotRevision,
          storySummary: input.storySummary ?? shot.storySummary,
          dialogue: safeDialogue,
          state:
            shot.imageArtifactHash || shot.imageArtifactUrl
              ? "image_result_approved"
              : "story_awaiting",
          videoPrompt: null,
          videoPromptHash: null,
          videoArtifactHash: null,
          videoArtifactUrl: null,
        };
        const nextShots = metadata.stagedSequentialStoryboard.shots.map(item =>
          item.shotId === input.shotId ? nextShot : item
        );
        const nextPlan: StagedStoryArcPlan = {
          ...plan,
          planRevision: revision,
          shots: plan.shots.map((item: any) => {
            if (item.shotId !== input.shotId) return item;
            const updated = {
              ...item,
              storySummary: nextShot.storySummary,
              dialogue: nextShot.dialogue,
            };
            if (input.dialogue !== undefined) {
              const dialogueTurns = parseStagedDialogueTurns(
                nextShot.dialogue,
                plan.cast
              );
              if (dialogueTurns) updated.dialogueTurns = dialogueTurns;
              else delete updated.dialogueTurns;
            }
            return updated;
          }),
        };
        nextPlan.storyPlanHash = buildProductionStableHash(nextPlan);
        const replacement = buildStagedCheckpoint({
          checkpointId: `story-plan:${input.runId}:r${revision}:shot-${input.shotId}:op-${operationId}`,
          kind: "story_plan",
          revision,
          contentHash: nextPlan.storyPlanHash,
          model: "user-edit",
          provider: "user",
          estimatedCredits: 0,
          referenceManifestHash:
            metadata.stagedSequentialStoryboard.referenceManifestHash,
        });
        const dialogueChanged = input.dialogue !== undefined;
        const checkpoints =
          metadata.stagedSequentialStoryboard.reviewCheckpoints
            .filter(checkpoint => {
              if (checkpoint.state === "superseded") return true;
              if (checkpoint.kind === "story_plan") return false;
              if (
                checkpoint.shotId === input.shotId &&
                ["video_prompt", "video_result"].includes(checkpoint.kind)
              ) {
                return false;
              }
              if (dialogueChanged && checkpoint.kind === "audio_plan")
                return false;
              if (checkpoint.kind === "final_assembly") return false;
              return true;
            })
            .concat(replacement);
        const pipeline = (metadata as any).stagedPipeline ?? {};
        const tasks = Object.fromEntries(
          Object.entries(
            (pipeline.tasks ?? {}) as Record<string, unknown>
          ).filter(
            ([key]) =>
              key !== `image:${input.shotId}` &&
              key !== `video:${input.shotId}` &&
              (!dialogueChanged || key !== "audio:0")
          )
        );
        return {
          metadata: {
            ...metadata,
            planReview: {
              ...metadata.planReview,
              planRevision: revision,
              status: "awaiting" as const,
              approvedRevision: null,
            },
            stagedPipeline: {
              ...pipeline,
              plan: nextPlan,
              planView: buildStagedPlanView(nextPlan),
              tasks,
              finalAssembly: null,
              ...(dialogueChanged ? { audioPlan: null, audioUrl: null } : {}),
            },
            stagedSequentialStoryboard: {
              ...metadata.stagedSequentialStoryboard,
              planRevision: revision,
              storyPlanStatus: "awaiting" as const,
              storyPlanHash: nextPlan.storyPlanHash,
              // A per-shot narrative/dialogue edit can change motion without
              // invalidating the already approved start frame. Keep its image
              // prompt and artifact, and regenerate only downstream video.
              shots: nextShots,
              reviewCheckpoints: checkpoints,
            },
          },
          planRevision: revision,
        };
      }

      const kind =
        input.imagePrompt !== undefined ? "image_prompt" : "video_prompt";
      const revision = shot.revision + 1;
      const imagePrompt = input.imagePrompt !== undefined;
      const content = imagePrompt
        ? input.imagePrompt!.trim()
        : input.videoPrompt!.trim();
      if (!content) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `staged_${imagePrompt ? "image" : "video"}_prompt_required`,
        });
      }
      if (!imagePrompt) requireStagedImageArtifactHash(shot);
      const replacement = buildStagedCheckpoint({
        checkpointId: `${kind}:${input.runId}:shot-${input.shotId}:r${revision}:op-${operationId}`,
        kind,
        shotId: input.shotId,
        revision,
        contentHash: imagePrompt
          ? buildStagedImagePromptContentHash({
              revision,
              shotId: input.shotId,
              prompt: content,
              referenceManifestHash: requireStagedReferenceManifestHash(
                metadata.stagedSequentialStoryboard.referenceManifestHash
              ),
            })
          : buildStagedVideoPromptContentHash({
              revision,
              shotId: input.shotId,
              prompt: content,
              imageArtifactHash: requireStagedImageArtifactHash(shot),
            }),
        model: "user-edit",
        provider: "user",
        estimatedCredits: 0,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
      });
      const checkpoints =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
          checkpoint => {
            const invalidatedByEdit = imagePrompt
              ? checkpoint.shotId === input.shotId &&
                checkpoint.kind === "image_prompt"
              : checkpoint.shotId === input.shotId &&
                (checkpoint.kind === "video_prompt" ||
                  checkpoint.kind === "video_result");
            const invalidatesFinal = checkpoint.kind === "final_assembly";
            return (invalidatedByEdit || invalidatesFinal) &&
              checkpoint.state !== "superseded"
              ? {
                  ...checkpoint,
                  state: "superseded" as const,
                  rejectionReasonCode: "staged_shot_edit",
                }
              : checkpoint;
          }
        );
      const nextShot = {
        ...shot,
        revision,
        ...(imagePrompt
          ? {
              imagePrompt: content,
              imagePromptHash: replacement.contentHash,
            }
          : {
              videoPrompt: content,
              videoPromptHash: replacement.contentHash,
              videoArtifactHash: null,
              videoArtifactUrl: null,
              state: "video_prompt_awaiting",
            }),
      };
      const pipeline = (metadata as any).stagedPipeline ?? {};
      const tasks = Object.fromEntries(
        Object.entries(
          (pipeline.tasks ?? {}) as Record<string, unknown>
        ).filter(([key]) =>
          imagePrompt
            ? key !== `image:${input.shotId}`
            : key !== `video:${input.shotId}`
        )
      );
      return {
        metadata: {
          ...metadata,
          stagedPipeline: {
            ...pipeline,
            tasks,
            finalAssembly: null,
          },
          stagedSequentialStoryboard: {
            ...metadata.stagedSequentialStoryboard,
            shots: metadata.stagedSequentialStoryboard.shots.map(item =>
              item.shotId === input.shotId ? nextShot : item
            ),
            reviewCheckpoints: [...checkpoints, replacement],
          },
        },
        planRevision: metadata.planReview.planRevision,
      };
    },
  });
}

function stagedAbsoluteReferenceUrl(
  value: string,
  publicUrl?: string | null
): string {
  if (/^https?:\/\//i.test(value)) return value;
  const base = publicUrl?.trim();
  if (!base) throw new Error("MARKETPLACE_PUBLIC_BASE_URL_REQUIRED");
  return new URL(value, `${base.replace(/\/+$/, "")}/`).toString();
}

function requireStagedReferenceManifest(
  metadata: Record<string, any>
): Array<Record<string, any>> {
  const manifest = metadata.customReferenceManifest;
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error("STAGED_REFERENCE_MANIFEST_REQUIRED");
  }
  return manifest.map((entry: unknown, index: number) => {
    const item = record(entry);
    if (
      !Number.isSafeInteger(item.index) ||
      item.index < 1 ||
      typeof item.url !== "string" ||
      !item.url.trim() ||
      typeof item.role !== "string" ||
      !item.role.trim() ||
      typeof item.active !== "boolean"
    ) {
      throw new Error(`STAGED_REFERENCE_MANIFEST_ENTRY_INVALID:${index + 1}`);
    }
    return item;
  });
}

type StagedSocialCaptionSourceRef =
  | { sourceType: "product"; referenceIndex: number; shotId?: never }
  | { sourceType: "shot"; shotId: number; referenceIndex?: never };

function boundedCaptionFacts(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return value.trim().slice(0, 1000);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 30).map(item => boundedCaptionFacts(item, depth + 1));
  }
  if (value && typeof value === "object" && depth < 3) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, 40)
        .map(([key, item]) => [
          key.slice(0, 100),
          boundedCaptionFacts(item, depth + 1),
        ])
    );
  }
  return undefined;
}

function resolveStagedSocialCaptionContext(
  run: StagedCheckpointRun,
  _metadata: ReturnType<typeof parseStagedMetadata>,
  sourceRef: StagedSocialCaptionSourceRef
) {
  const base = record(run.metadataJson);
  const pipeline = record(base.stagedPipeline);
  const plan = record(pipeline.plan);
  const product = record(plan.product);
  const productName = stagedTextOrEmpty(product.productName).slice(0, 240);
  if (!productName) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_caption_product_info_missing",
    });
  }
  const productInfo = {
    productName,
    description: stagedTextOrEmpty(product.description).slice(0, 3000),
    specs: boundedCaptionFacts(product.specs) as
      Record<string, unknown> | undefined,
  };
  const languagePlan = record(plan.languagePlan);
  const language = languagePlan.summaryLanguage === "en" ? "en" : "th";

  let source: {
    type: "product" | "shot";
    label: string;
    imageUrl: string;
    shotId?: number;
    shotContext?: string;
  };
  let sourceEvidence: Record<string, unknown>;
  if (sourceRef.sourceType === "product") {
    const item = requireStagedReferenceManifest(base).find(
      entry => entry.index === sourceRef.referenceIndex
    );
    const imageUrl =
      item?.active === true && item.role !== "character"
        ? safeArtifactUrl(item.url)
        : null;
    if (!item || !imageUrl) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "staged_caption_product_image_unavailable",
      });
    }
    const imageLabel = stagedTextOrEmpty(item.label).slice(0, 180);
    source = {
      type: "product",
      label: imageLabel || `รูปสินค้า ${sourceRef.referenceIndex}`,
      imageUrl,
    };
    sourceEvidence = {
      type: "product",
      referenceIndex: item.index,
      imageUrl,
      role: item.role,
      label: imageLabel,
    };
  } else {
    const shot = _metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === sourceRef.shotId
    );
    const imageUrl = shot ? safeArtifactUrl(shot.imageArtifactUrl) : null;
    const imageHash = shot?.imageArtifactHash?.trim();
    if (!shot || !imageUrl || !imageHash) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `staged_caption_shot_image_unavailable:shot-${sourceRef.shotId}`,
      });
    }
    const planShot = Array.isArray(plan.shots)
      ? record(plan.shots[sourceRef.shotId - 1])
      : {};
    const shotContext = [
      stagedTextOrEmpty(planShot.title),
      stagedTextOrEmpty(planShot.visualSummary),
      shot.storySummary,
      shot.dialogue,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2400);
    source = {
      type: "shot",
      label: `Shot ${sourceRef.shotId} · ภาพเริ่มต้น`,
      imageUrl,
      shotId: sourceRef.shotId,
      shotContext,
    };
    sourceEvidence = {
      type: "shot",
      shotId: sourceRef.shotId,
      imageUrl,
      imageHash,
      shotContext,
    };
  }

  const sourceHash = createHash("sha256")
    .update(
      JSON.stringify({
        product: productInfo,
        language,
        source: sourceEvidence,
      })
    )
    .digest("hex");
  return { sourceHash, source, product: productInfo, language };
}

export function resolveStagedSocialCaptionContextForTest(
  run: StagedCheckpointRun,
  metadata: ReturnType<typeof parseStagedMetadata>,
  sourceRef: StagedSocialCaptionSourceRef
) {
  return resolveStagedSocialCaptionContext(run, metadata, sourceRef);
}

type StagedSocialPostImagesContext = {
  requestHash: string;
  caption: string;
  language: "th" | "en";
  product: {
    productName: string;
    description?: string | null;
    specs?: Record<string, unknown>;
  };
  sources: Record<
    MarketplaceSocialImageVariant,
    {
      label: string;
      imageUrls: string[];
      references: Array<{ label: string; imageUrl: string }>;
      context?: string;
    }
  >;
};

function resolveStagedSocialPostImagesContext(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  modelId: string;
  aspectRatio: MarketplaceSocialPostAspectRatio;
}): StagedSocialPostImagesContext {
  const pipeline = record(record(input.run.metadataJson).stagedPipeline);
  const socialCaption = record(pipeline.socialCaption);
  const caption = stagedTextOrEmpty(socialCaption.caption).slice(0, 2000);
  const captionSourceRef: StagedSocialCaptionSourceRef | null =
    socialCaption.sourceType === "product" &&
    Number.isSafeInteger(socialCaption.referenceIndex) &&
    socialCaption.referenceIndex > 0
      ? {
          sourceType: "product",
          referenceIndex: socialCaption.referenceIndex,
        }
      : socialCaption.sourceType === "shot" &&
          Number.isSafeInteger(socialCaption.shotId) &&
          socialCaption.shotId > 0
        ? { sourceType: "shot", shotId: socialCaption.shotId }
        : null;
  if (!caption || !captionSourceRef) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_social_caption_required",
    });
  }
  const captionSource = resolveStagedSocialCaptionContext(
    input.run,
    input.metadata,
    captionSourceRef
  );
  if (
    !stagedTextOrEmpty(socialCaption.sourceHash) ||
    socialCaption.sourceHash !== captionSource.sourceHash
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }
  let manifest: Array<Record<string, any>> = [];
  try {
    manifest = requireStagedReferenceManifest(record(input.run.metadataJson));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "STAGED_REFERENCE_MANIFEST_REQUIRED"
    ) {
      throw error;
    }
  }
  const referenceItems = (role: "character" | "product") =>
    manifest
      .filter(
        item =>
          item.active &&
          (role === "character"
            ? item.role === "character"
            : item.role === "product")
      )
      .map(item => {
        const imageUrl = safeArtifactUrl(item.url);
        if (!imageUrl) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `staged_social_${role}_reference_unavailable`,
          });
        }
        return {
          item,
          imageUrl,
          label:
            (role === "character"
              ? stagedTextOrEmpty(item.characterName)
              : "") ||
            stagedTextOrEmpty(item.label) ||
            `${role === "character" ? "ตัวละคร" : "รูปสินค้า"} ${item.index}`,
        };
      });
  const refFingerprint = (
    reference: ReturnType<typeof referenceItems>[number]
  ) => ({
    index: reference.item.index,
    role: reference.item.role,
    label: stagedTextOrEmpty(reference.item.label),
    characterName: stagedTextOrEmpty(reference.item.characterName),
    imageUrl: reference.imageUrl,
    checksum: stagedTextOrEmpty(
      reference.item.checksum ??
        reference.item.contentHash ??
        reference.item.sha256 ??
        reference.item.imageHash
    ),
    portraitAssetId: stagedTextOrEmpty(reference.item.portraitAssetId),
    vdCharacterId: stagedTextOrEmpty(reference.item.vdCharacterId),
    variantLabel: stagedTextOrEmpty(reference.item.variantLabel),
  });
  const characterReferences = referenceItems("character");
  const productReferences = referenceItems("product");
  const captionSourceContext = captionSource.source;
  const captionSourceImage = {
    label: captionSourceContext.label,
    imageUrl: captionSourceContext.imageUrl,
    context: captionSourceContext.shotContext,
  };
  const characterSources = characterReferences.length
    ? characterReferences.map(reference => ({
        label: reference.label,
        imageUrl: reference.imageUrl,
      }))
    : [
        {
          ...captionSourceImage,
          label: `${captionSourceImage.label} · ใช้แทนภาพตัวละครอ้างอิง`,
        },
      ];
  const productSources = productReferences.length
    ? productReferences.map(reference => ({
        label: reference.label,
        imageUrl: reference.imageUrl,
      }))
    : [
        {
          ...captionSourceImage,
          label: `${captionSourceImage.label} · ใช้แทนภาพสินค้าอ้างอิง`,
        },
      ];
  const combinedReferences = new Map<
    string,
    { label: string; imageUrl: string; context?: string }
  >();
  for (const source of [
    captionSourceImage,
    ...characterSources,
    ...productSources,
  ]) {
    const imageUrl = source.imageUrl.trim();
    if (!imageUrl || combinedReferences.has(imageUrl)) continue;
    combinedReferences.set(imageUrl, { ...source, imageUrl });
  }
  const adReferences = [...combinedReferences.values()];
  const adReferenceLabel = adReferences.map(source => source.label).join(", ");
  const adImageUrls = adReferences.map(source => source.imageUrl);
  const requestHash = buildProductionStableHash({
    caption,
    hashtags: Array.isArray(socialCaption.hashtags)
      ? socialCaption.hashtags
      : [],
    captionRequestIdempotencyKey: stagedTextOrEmpty(
      socialCaption.requestIdempotencyKey
    ),
    captionSourceHash: captionSource.sourceHash,
    product: captionSource.product,
    language: captionSource.language,
    characterReferences: characterReferences.map(refFingerprint),
    productReferences: productReferences.map(refFingerprint),
    characterFallbackUsed: characterReferences.length === 0,
    productFallbackUsed: productReferences.length === 0,
    imageModelId: input.modelId.trim(),
    aspectRatio: input.aspectRatio,
  });
  return {
    requestHash,
    caption,
    language: captionSource.language,
    product: captionSource.product,
    sources: {
      caption_source: {
        label: adReferenceLabel,
        imageUrls: adImageUrls,
        references: adReferences,
        context: captionSourceContext.shotContext,
      },
      character_reference: {
        label: adReferenceLabel,
        imageUrls: adImageUrls,
        references: adReferences,
      },
      product_reference: {
        label: adReferenceLabel,
        imageUrls: adImageUrls,
        references: adReferences,
      },
    },
  };
}

export function resolveStagedSocialPostImagesContextForTest(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  modelId: string;
  aspectRatio: MarketplaceSocialPostAspectRatio;
}) {
  return resolveStagedSocialPostImagesContext(input);
}

function buildStagedShotSpeakerReferences(input: {
  metadata: Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}): MarketplaceSpeakerVisualReference[] {
  try {
    const customManifest = requireStagedReferenceManifest(input.metadata);
    const activeCharacters = customManifest.filter(
      item => item.active && item.role === "character"
    );
    const selection = resolveShotCastSelectionFromMetadata({
      metadata: input.metadata,
      plan: input.plan,
      shotId: input.shotId,
    });
    const selectedCharacters = buildShotOrderedReferenceItems({
      productItems: [],
      characterItems: activeCharacters,
      castInShot: selection.castInShot,
      castLooks: selection.castLooks,
    }).shotCharacterItems;
    const normalizeName = (value: string) =>
      value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
    return (input.plan.cast ?? []).flatMap(member => {
      if (
        isStagedCastMemberMinor(member) ||
        !selection.castInShot.includes(member.castId)
      ) return [];
      const matchingItems = selectedCharacters.filter(item => {
        const name =
          typeof item.characterName === "string" && item.characterName.trim()
            ? item.characterName.trim()
            : typeof item.label === "string"
              ? item.label.trim()
              : "";
        return name && normalizeName(name) === normalizeName(member.name);
      });
      if (matchingItems.length !== 1) return [];
      const url = typeof matchingItems[0].url === "string"
        ? matchingItems[0].url.trim()
        : "";
      return url
        ? [{ speakerLabel: member.name, castId: member.castId, url }]
        : [];
    });
  } catch (error) {
    console.warn("[MarketplaceSpeakerAttribution] Cast references unavailable:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

function stagedDialogueSpeakerLabels(dialogue: string): string[] {
  return Array.from(
    new Set(
      dialogue
        .split(/\r?\n/)
        .map(line => line.match(/^([^:\n]{1,100}):\s*.+$/)?.[1]?.trim())
        .filter((speaker): speaker is string => Boolean(speaker))
    )
  );
}

function buildStagedSpeakerBindingsSourceHash(input: {
  imageArtifactHash?: string | null;
  dialogue: string;
  speakerReferences?: readonly MarketplaceSpeakerVisualReference[];
  speakerLabels?: readonly string[];
}): string {
  const speakerLabels = [
    ...(input.speakerLabels ?? stagedDialogueSpeakerLabels(input.dialogue)),
  ].sort((a, b) => a.localeCompare(b));
  const speakerReferences = input.speakerReferences
    ? [...input.speakerReferences]
        .map(reference => ({
          speakerLabel: reference.speakerLabel.trim(),
          castId: reference.castId.trim(),
          url: reference.url.trim(),
        }))
        .sort((a, b) => a.speakerLabel.localeCompare(b.speakerLabel))
    : null;
  return buildProductionStableHash({
    kind: "marketplace-speaker-visual-bindings-v1",
    imageArtifactHash: input.imageArtifactHash ?? null,
    speakerLabels,
    speakerReferences,
  });
}

function readCurrentStagedDetectedPeople(input: {
  shotId: number;
  imageArtifactHash?: string | null;
  metadata: Record<string, any>;
}): {
  detectedPeople: Array<{
    id: string;
    appearance: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
  detectionSkillRun?: MarketplaceVideoPromptSkillRun;
} | undefined {
  if (!input.imageArtifactHash) return undefined;
  const promptGeneration = record(
    record(input.metadata.stagedPipeline).promptGeneration
  );
  // Older video-prompt generations stored their start-frame detection under
  // video:<shot>. Reuse it just like the newer standalone detection record so
  // prompt generation does not repeat detection after a saved speaker match.
  for (const key of [
    `person_detection:${input.shotId}`,
    `video:${input.shotId}`,
  ]) {
    const detection = record(promptGeneration[key]);
    if (
      detection.sourceImageHash !== input.imageArtifactHash ||
      !Array.isArray(detection.detectedPeople)
    ) {
      continue;
    }
    const detectionSkillRun = Array.isArray(detection.skillRuns)
      ? detection.skillRuns
          .map((skillRun: unknown) => record(skillRun))
          .find(
            (skillRun: Record<string, any>) =>
              skillRun.skill === MARKETPLACE_VERTICAL_DRAMA_DETECTION_SKILL
          )
      : undefined;
    return {
      detectedPeople: detection.detectedPeople,
      ...(detectionSkillRun
        ? { detectionSkillRun: detectionSkillRun as MarketplaceVideoPromptSkillRun }
        : {}),
    };
  }
  return undefined;
}

function readCurrentStagedSpeakerVisualBindings(input: {
  shot: Record<string, any>;
  metadata: Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}): Record<string, string> | undefined {
  const shot = input.shot;
  if (
    !shot.imageArtifactHash ||
    shot.speakerVisualBindingsImageHash !== shot.imageArtifactHash
  ) {
    return undefined;
  }
  const bindings = record(shot.speakerVisualBindings) as Record<string, string>;
  const safeDialogue = removeStagedMinorDialogueLines(
    String(shot.dialogue ?? ""),
    input.plan.cast
  );
  const speakers = getStagedDialogueSpeakerLabels(
    safeDialogue,
    input.plan.cast,
    input.shot.castInShot
  );
  if (
    Object.keys(bindings).length !== speakers.length ||
    speakers.some(speaker => typeof bindings[speaker] !== "string") ||
    new Set(Object.values(bindings)).size !== speakers.length
  ) {
    return undefined;
  }
  const isAuto = shot.speakerVisualBindingsMatchType === "auto";
  const references = isAuto
    ? buildStagedShotSpeakerReferences({
        metadata: input.metadata,
        plan: input.plan,
        shotId: input.shotId,
      })
    : undefined;
  const expectedHash = buildStagedSpeakerBindingsSourceHash({
    imageArtifactHash: shot.imageArtifactHash,
    dialogue: safeDialogue,
    speakerReferences: references,
    speakerLabels: speakers,
  });
  const savedHash =
    typeof shot.speakerVisualBindingsSourceHash === "string"
      ? shot.speakerVisualBindingsSourceHash
      : "";
  if (savedHash && savedHash !== expectedHash) return undefined;
  return bindings;
}

/** Return video-prompt refresh targets whose current image is not bound to
 * every eligible dialogue speaker. Minor dialogue is excluded by the same
 * safety filter used by prompt authoring. */
export function findStagedVideoPromptShotsMissingSpeakerBindings(input: {
  metadata: Record<string, any>;
  plan: StagedStoryArcPlan;
  targets: StagedAutoReviewGenerationTarget[];
}): number[] {
  const shots = input.metadata.stagedSequentialStoryboard?.shots;
  if (!Array.isArray(shots)) return [];
  const missing: number[] = [];
  for (const target of input.targets) {
    if (target.stage !== "video" || target.refreshPrompt !== true) continue;
    const shot = shots.find((item: Record<string, any>) => item.shotId === target.shotId);
    if (!shot) continue;
    const safeDialogue = removeStagedMinorDialogueLines(
      String(shot.dialogue ?? ""),
      input.plan.cast
    );
    if (!safeDialogue.trim()) continue;
    const speakers = getStagedDialogueSpeakerLabels(
      safeDialogue,
      input.plan.cast,
      shot.castInShot
    );
    // If dialogue exists but cannot be attributed (for example, two adults
    // are in the cast and the transcript has no speaker labels), it is not
    // safe to author a video prompt with an implicit speaker.
    const adultsInShot = (input.plan.cast ?? []).filter(
      member =>
        !isStagedCastMemberMinor(member) &&
        (!shot.castInShot?.length || shot.castInShot.includes(member.castId))
    );
    if (speakers.length === 0 && adultsInShot.length > 1) {
      missing.push(target.shotId);
      continue;
    }
    if (
      speakers.length > 0 &&
      !readCurrentStagedSpeakerVisualBindings({
        shot,
        metadata: input.metadata,
        plan: input.plan,
        shotId: target.shotId,
      })
    ) {
      missing.push(target.shotId);
    }
  }
  return [...new Set(missing)].sort((a, b) => a - b);
}

function assertStagedVideoPromptSpeakerBindingsComplete(input: {
  metadata: Record<string, any>;
  plan: StagedStoryArcPlan;
  targets: StagedAutoReviewGenerationTarget[];
}) {
  const missing = findStagedVideoPromptShotsMissingSpeakerBindings(input);
  if (missing.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `staged_speaker_visual_bindings_required:shots-${missing.join(",")}`,
    });
  }
}

function requireStagedReferenceManifestHash(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("STAGED_REFERENCE_MANIFEST_HASH_REQUIRED");
  }
  return value.trim();
}

// Fix B (marketplace auto-review staged pipeline: shot images ignoring
// dialogue sentiment) — `demonstration_type` DISPATCH heuristic. This is a
// coarse, conservative classification decision (which enum value to declare
// before the LLM authors the actual prompt wording), NOT a creative
// judgment call — the creative "problem_solution" framing wording still
// lives entirely in the skill (skill.md + references/demonstration-
// evidence.md), never here. `StagedStoryArcShot` carries no structured
// narrative-beat/role field to branch on (see SHOT_BEATS in
// marketplaceAutoReviewStoryArcPlanner.ts — shot titles are plain strings,
// not an enum), so the shot's own dialogue text is the only signal
// available. Keyword list is intentionally small and literal (no fuzzy
// matching) to keep false positives rare; defaults to "usage_demo" (the
// prior hardcoded behavior) whenever no problem/defect/frustration signal
// is detected.
const STAGED_PROBLEM_SENTIMENT_PATTERN =
  /พัง|แตก|อันตราย|คมกริบ|เสียหาย|บกพร่อง|หงุดหงิด|เบื่อ|ใช้ไม่ได้|ชำรุด|broken|damage[ds]?|hazard(?:ous)?|dangerous|defect(?:ive)?|frustrat(?:e|ed|ing)?|annoy(?:ed|ing)?/i;

function classifyStagedDemonstrationType(
  dialogue: string
): "problem_solution" | "usage_demo" {
  return STAGED_PROBLEM_SENTIMENT_PATTERN.test(dialogue || "")
    ? "problem_solution"
    : "usage_demo";
}

export function classifyStagedDemonstrationTypeForTest(
  dialogue: string
): "problem_solution" | "usage_demo" {
  return classifyStagedDemonstrationType(dialogue);
}

// Fix B2 — mirrors marketplaceAutoReviewService.ts's private
// `buildGuardianPresenceDirective` / `buildDemonstrationEvidenceDirective`
// (identical marker text and wording) for the staged single-shot regenerate
// path, which never wired the legacy `metadata.evidenceGuard` toggle system
// (the staged metadata schema — `StagedSequentialStoryboardMetadataV1Schema`
// — has no `evidenceGuard` field at all, and those two legacy builders take
// an `AutoReviewPlan`-shaped guard context this pipeline doesn't produce).
// Rather than bolt that whole system onto the staged pipeline (out of scope
// for this fix), this derives the same three underlying facts
// (productChildRelated, assemblyDocumented, guardianReferenceIndex) from
// data already available in `buildStagedSingleShotRefreshInput` below.
const STAGED_GUARDIAN_PRESENCE_LOCK_MARKER = "GUARDIAN PRESENCE LOCK:";
const STAGED_DEMONSTRATION_EVIDENCE_LOCK_MARKER =
  "DEMONSTRATION EVIDENCE LOCK:";

function buildStagedGuardianPresenceDirective(input: {
  productChildRelated: boolean;
  guardianReferenceIndex: number | null;
}): string {
  if (!input.productChildRelated) return "";
  const parts = [
    STAGED_GUARDIAN_PRESENCE_LOCK_MARKER,
    "Any frame that shows the child using the product MUST also show a supervising adult guardian in the same frame; never show an unaccompanied minor using the product.",
  ];
  if (typeof input.guardianReferenceIndex === "number") {
    parts.push(
      `The supervising adult guardian identity is @Image${input.guardianReferenceIndex}; keep that same adult identity consistent whenever the guardian appears.`
    );
  }
  return parts.join(" ");
}

function buildStagedDemonstrationEvidenceDirective(input: {
  assemblyDocumented: boolean;
}): string {
  if (!input.assemblyDocumented) {
    return [
      STAGED_DEMONSTRATION_EVIDENCE_LOCK_MARKER,
      'Assembly is not confirmed for this product: do not depict assembly, disassembly, exploded/spread parts, fasteners, internal mechanisms, or "what\'s in the box" parts-spread content.',
      "Show only the finished, fully assembled product exactly as shown in the reference images; visible-operation demonstrations of the finished product remain allowed.",
    ].join(" ");
  }
  return [
    STAGED_DEMONSTRATION_EVIDENCE_LOCK_MARKER,
    "Assembly is confirmed by the product's own evidence: depict only the documented assembly/parts content; never invent assembly steps, fasteners, or parts beyond what the evidence supports.",
  ].join(" ");
}

export function buildStagedSingleShotRefreshInput(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  shotId: number;
  publicUrl?: string | null;
  tenantId?: string;
  /** New capability — free-text per-shot instruction for AI-assisted prompt
   *  adjustment (see `userInstruction` on `SequentialSingleShotRefreshInput`). */
  instruction?: string | null;
  model?: string | null;
  requestIdempotencyKey?: string | null;
  /** Which prompt half is being (re)generated. Defaults to `"image"` for
   *  every pre-existing caller/test that never passed this. Only `"video"`
   *  changes behavior: the shot's own already-approved `imageArtifactUrl`
   *  (the actual rendered start frame, not just a pre-generation reference
   *  photo) is appended to the reference manifest / vision inputs so the
   *  video-prompt half of the skill call can literally SEE what it must stay
   *  visually consistent with. */
  stage?: "image" | "video";
}) {
  const staged = input.metadata.stagedSequentialStoryboard;
  const shot = staged.shots.find(item => item.shotId === input.shotId);
  const plan = (input.metadata as any).stagedPipeline?.plan as
    StagedStoryArcPlan | undefined;
  const planShot = plan?.shots.find(item => item.shotId === input.shotId);
  if (!shot || !plan || !planShot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_invalid_shot_contract",
    });
  }
  const customManifest = requireStagedReferenceManifest(
    input.metadata as Record<string, any>
  );

  // Per-shot cast + look overrides, resolved by the SAME helper the dispatch
  // path uses so the `@ImageN` tags the skill authors always address the
  // images that shot actually receives
  // (`planning/marketplace-four-character-cast/plan.md` §5).
  const shotCastSelection = resolveShotCastSelectionFromMetadata({
    metadata: input.metadata as Record<string, any>,
    plan,
    shotId: input.shotId,
  });
  const activeManifestItems = customManifest.filter((item: any) => item.active);
  const productVisible = isStagedProductVisibleInShot(
    planShot,
    plan.product.productName,
  );
  const shotOrderedManifestItems = buildShotOrderedReferenceItems({
    productItems: productVisible
      ? activeManifestItems.filter((item: any) => item.role !== "character")
      : [],
    characterItems: activeManifestItems.filter(
      (item: any) => item.role === "character"
    ),
    castInShot: shotCastSelection.castInShot,
    castLooks: shotCastSelection.castLooks,
  }).ordered;

  const baseReferenceManifest: SequentialReferenceManifestEntry[] =
    shotOrderedManifestItems.map((item: any, idx: number) => ({
      index: idx + 1,
      role: item.role,
      url: String(item.url).trim(),
      angleLabel:
        typeof item.label === "string" && item.label.trim()
          ? item.label
          : undefined,
      evidenceOnly: false,
      // Cast identity — the skill receives the exact person mapping as facts.
      characterName:
        typeof item.characterName === "string" && item.characterName.trim()
          ? item.characterName
          : undefined,
      characterRole:
        typeof item.characterRole === "string" && item.characterRole.trim()
          ? item.characterRole
          : undefined,
      variantLabel:
        typeof item.variantLabel === "string" && item.variantLabel.trim()
          ? item.variantLabel
          : undefined,
      depictsMinor:
        typeof item.depictsMinor === "boolean" ? item.depictsMinor : undefined,
    }));
  // Video-prompt generation must SEE the shot's own already-approved image
  // (the actual rendered start frame), not just the pre-generation reference
  // manifest — see doc comment on `stage` above. Appended as its own manifest
  // entry (never merged into `baseReferenceManifest`) so its role is
  // unambiguous to the skill and its index never displaces the product/
  // character reference indices the skill already relies on.
  const approvedShotImageUrl =
    input.stage === "video" ? safeArtifactUrl(shot.imageArtifactUrl) : null;
  if (input.stage === "video" && !approvedShotImageUrl) {
    throw new Error(`STAGED_APPROVED_SHOT_IMAGE_REQUIRED:${input.shotId}`);
  }
  const referenceManifest: SequentialReferenceManifestEntry[] =
    input.stage === "video"
      ? [
          ...baseReferenceManifest,
          {
            index: baseReferenceManifest.length + 1,
            role: "approved_shot_image",
            url: approvedShotImageUrl!,
            evidenceOnly: false,
          },
        ]
      : baseReferenceManifest;
  const skillVisionUrls = referenceManifest.map(entry =>
    stagedAbsoluteReferenceUrl(entry.url, input.publicUrl)
  );
  const productTruth = record((input.metadata as any).productTruth);
  const languagePlan = requireStagedLanguagePlanFromMetadata(
    input.metadata as Record<string, any>
  );
  const previousShot = plan.shots.find(
    item => item.shotId === input.shotId - 1
  );
  const nextShot = plan.shots.find(item => item.shotId === input.shotId + 1);
  // Fix B2 — same three facts the legacy evidence-guard resolver derives,
  // computed here since the staged pipeline has no `evidenceGuard` toggle
  // (see comment on the two builder functions above). `productChildRelated`
  // intentionally mirrors `childSubjectPolicy.productChildRelated` below
  // (currently always `false` — the staged pipeline does not yet derive
  // child-relatedness; fixing that is out of scope here), so
  // `guardianPresenceDirective` stays "" under today's staged behavior,
  // same as before this fix.
  //
  // The guardian is the first ADULT character, not merely the first character
  // (`planning/marketplace-four-character-cast/plan.md`, limit 3). With a
  // 4-person roster the old heuristic could nominate the child itself as its
  // own guardian. `depictsMinor === true` is the only value that excludes a
  // candidate: `undefined` stays unknown and remains eligible, which preserves
  // today's behavior byte-for-byte for every run that never stated the fact
  // (`project_marketplace_minor_safety_qa_grounding`).
  const characterManifestEntries = referenceManifest.filter(
    entry => entry.role === "character"
  );
  const minorCastIdsInShot = new Set(
    (plan.cast ?? [])
      .filter(member =>
        shotCastSelection.castInShot.includes(member.castId) &&
        isStagedCastMemberMinor(member)
      )
      .map(member => member.castId)
  );
  const depictsMinor = minorCastIdsInShot.size > 0;
  const guardianReferenceIndex = depictsMinor
    ? characterManifestEntries.find(
        entry => (entry as any).depictsMinor === false
      )?.index ?? null
    : null;
  const assemblyDocumented = deriveAssemblyDocumentationFromProductTruth({
    productName: plan.product.productName,
    description: plan.product.description,
    specs: {},
  }).documented;
  const guardianPresenceDirective = depictsMinor
    ? [
        "MINOR SUPPORT SAFETY LOCK: A selected person under 18 is present only as a silent supporting character; keep their mouth closed, give them no dialogue or lip movement, and do not show them touching or using the product.",
        guardianReferenceIndex
          ? `Show the supervising adult identity from @Image${guardianReferenceIndex} in the same frame.`
          : "Show an adult supervisor in the same frame.",
      ].join(" ")
    : buildStagedGuardianPresenceDirective({
        productChildRelated: false,
        guardianReferenceIndex,
      });
  const demonstrationEvidenceDirective =
    buildStagedDemonstrationEvidenceDirective({ assemblyDocumented });
  const userInstruction = (input.instruction ?? "").trim() || null;
  return {
    tenantId: requireStagedTenantId(input.tenantId, input.run.tenantId),
    userId: input.run.userId,
    runId: input.run.id,
    model: input.model ?? null,
    ...(input.requestIdempotencyKey
      ? { requestIdempotencyKey: input.requestIdempotencyKey }
      : {}),
    publicUrl: input.publicUrl,
    originSurface: "marketplace_capture" as const,
    targetShotId: input.shotId,
    ...(input.stage === "image" ? { promptTarget: "image" as const } : {}),
    imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
    referenceManifest,
    skillVisionUrls,
    globalContinuity: {},
    shotContract: {
      purpose: planShot.title,
      story_summary: planShot.storySummary,
      product_in_shot: productVisible,
      dialogue: normalizeStagedDialogueTranscript(planShot.dialogue),
      duration_seconds: planShot.durationSeconds,
      demonstration_type: classifyStagedDemonstrationType(planShot.dialogue),
      depicts_minor: depictsMinor,
      guardian_required: depictsMinor,
      visual_summary: [
        planShot.visualSummary,
        input.stage !== "video" && productVisible
          ? "PRODUCT REFERENCE ONLY: use the attached product reference image(s) as the sole source of product appearance and identity. Do not describe, infer, or restate the product's shape, parts, colors, materials, finish, labels, or branding in text. Treat any conflicting product description in the story or shot summary as non-authoritative. Describe only the scene, action, framing, and lighting; show the exact product from its reference image."
          : null,
        planShot.cameraDirection
          ? `Camera/framing: ${planShot.cameraDirection}`
          : null,
        planShot.movementDirection
          ? `Visible action: ${planShot.movementDirection}`
          : null,
        planShot.transition ? `Transition: ${planShot.transition}` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join("; "),
    },
    previousShotVisualSummary: previousShot?.visualSummary ?? null,
    nextShotVisualSummary: nextShot?.visualSummary ?? null,
    childSubjectPolicy: {
      productChildRelated: false,
      childDepictionPlanned: depictsMinor,
      guardianReferenceIndex,
    },
    blockedClaims: [],
    forbiddenClaims: [],
    productCategory:
      typeof productTruth.productCategory === "string"
        ? productTruth.productCategory
        : null,
    guardianPresenceDirective: guardianPresenceDirective || undefined,
    demonstrationEvidenceDirective: demonstrationEvidenceDirective || undefined,
    userInstruction,
    summaryLanguage:
      languagePlan.summaryLanguage as SequentialStoryboardLanguage,
    dialogueLanguage:
      languagePlan.dialogueLanguage as SequentialStoryboardLanguage,
    promptLanguage: languagePlan.promptLanguage as SequentialStoryboardLanguage,
  };
}

function buildStagedShotPromptContextDigest(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  shotId: number;
  stage: "image" | "video";
  publicUrl?: string | null;
  tenantId?: string;
  instruction?: string | null;
  model?: string | null;
}) {
  const refreshInput = buildStagedSingleShotRefreshInput(input);
  // Public URLs and absolute vision URLs can differ between request and
  // worker runtimes; the relative manifest and prompt context remain stable.
  const context = Object.fromEntries(
    Object.entries(refreshInput).filter(
      ([key]) => key !== "publicUrl" && key !== "skillVisionUrls"
    )
  );
  const targetShot = input.metadata.stagedSequentialStoryboard.shots.find(
    shot => shot.shotId === input.shotId
  );
  return buildProductionStableHash({
    ...context,
    targetShotRevision: targetShot?.revision ?? null,
  });
}

export function buildStagedShotPromptContextDigestForTest(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  shotId: number;
  stage?: "image" | "video";
  publicUrl?: string | null;
  tenantId?: string;
  instruction?: string | null;
  model?: string | null;
}) {
  return buildStagedShotPromptContextDigest({
    ...input,
    stage: input.stage ?? "image",
  });
}

/** Test-only wrapper (repo `...ForTest` convention). */
export function buildStagedSingleShotRefreshInputForTest(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  shotId: number;
  publicUrl?: string | null;
  tenantId?: string;
  instruction?: string | null;
  model?: string | null;
  stage?: "image" | "video";
}) {
  return buildStagedSingleShotRefreshInput(input);
}

async function generateCompleteStagedShotPrompt(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  shotId: number;
  stage: "image" | "video";
  publicUrl?: string | null;
  tenantId?: string;
  instruction?: string | null;
  model?: string | null;
  requestIdempotencyKey: string;
  onProgress?: (progress: {
    progress: number;
    stage: string;
    message: string;
  }) => Promise<void>;
}): Promise<{
  prompt: string;
  model: string;
  provider: string;
  estimatedCredits: number;
  skillRuns: MarketplaceVideoPromptSkillRun[];
  detectedPeople?: Array<{
    id: string;
    appearance: string;
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
}> {
  const plan = record(record(input.metadata).stagedPipeline).plan as
    StagedStoryArcPlan | undefined;
  const planShot = plan?.shots.find(shot => shot.shotId === input.shotId);
  if (!plan || !planShot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_invalid_shot_contract",
    });
  }

  const stagedShot = input.metadata.stagedSequentialStoryboard.shots.find(
    shot => shot.shotId === input.shotId
  );
  if (input.stage === "video") {
    assertStagedVideoPromptSpeakerBindingsComplete({
      metadata: input.metadata as unknown as Record<string, any>,
      plan,
      targets: [
        { shotId: input.shotId, stage: "video", refreshPrompt: true },
      ],
    });
  }
  if (input.stage === "image") {
    await input.onProgress?.({
      progress: 20,
      stage: "product-review-sequential-storyboard",
      message: `กำลังสร้าง Prompt ภาพ · product-review-sequential-storyboard · Shot ${input.shotId}`,
    });
    const tenantId = requireStagedTenantId(input.tenantId, input.run.tenantId);
    if (!tenantId.trim()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "MARKETPLACE_IMAGE_PROMPT_TENANT_REQUIRED",
      });
    }
    const refreshInput = buildStagedSingleShotRefreshInput({
      ...input,
      tenantId,
      stage: "image",
      requestIdempotencyKey: input.requestIdempotencyKey,
    });
    const skillVisionUrls = await stageMarketplaceInlineImageReferences(
      refreshInput.skillVisionUrls,
      {
        auditContext: {
          source: "marketplace_auto_review_staged",
          tenantId,
          userId: input.run.userId,
        },
      }
    ) ?? [];
    const generation = await generateStagedImagePromptWithRecovery({
      requestIdempotencyKey: input.requestIdempotencyKey,
      generate: attempt =>
        refreshSequentialShotPromptWithSkillDirect({
          ...refreshInput,
          skillVisionUrls,
          requestIdempotencyKey: attempt.requestIdempotencyKey,
          ...(attempt.recoveryInstruction
            ? { recoveryInstruction: attempt.recoveryInstruction }
            : {}),
        }),
    });
    const refresh =
      generation.attemptResults[generation.attemptResults.length - 1]!;
    const prompt = refresh.startFrameImagePrompt.trim();
    const estimatedCredits = generation.attemptResults.reduce(
      (total, attempt) => total + attempt.estimatedCredits,
      0
    );
    if (generation.providerRecovery === "empty_response") {
      console.info(
        "[marketplaceAutoReview] image prompt recovered after empty provider response",
        {
          runId: input.run.id,
          shotId: input.shotId,
          attempts: 2,
          estimatedCredits,
        }
      );
    }
    if (generation.validationIssues.length > 0) {
      console.error(
        "[marketplaceAutoReview] image prompt failed validation after bounded recovery",
        {
          runId: input.run.id,
          shotId: input.shotId,
          attempts: generation.attemptResults.length,
          validationIssues: generation.validationIssues,
        }
      );
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `MARKETPLACE_IMAGE_PROMPT_SKILL_OUTPUT_INCOMPLETE:shot-${input.shotId}:attempts-${generation.attemptResults.length}:requirements-${generation.validationIssues.join(",")}`,
      });
    }
    if (generation.recoveryIssues.length > 0) {
      console.info(
        "[marketplaceAutoReview] image prompt recovered after validation retry",
        {
          runId: input.run.id,
          shotId: input.shotId,
          attempts: generation.attemptResults.length,
          recoveredIssues: generation.recoveryIssues,
          estimatedCredits,
        }
      );
    }
    return {
      prompt,
      model: refresh.model,
      provider: refresh.provider,
      estimatedCredits,
      skillRuns: [
        {
          skill: "product-review-sequential-storyboard",
          model: refresh.model,
          provider: refresh.provider,
          estimatedCredits,
        },
      ],
    };
  }

  assertStagedVideoPromptImageReady({
    shotId: input.shotId,
    shot: stagedShot,
    checkpoints: input.metadata.stagedSequentialStoryboard.reviewCheckpoints,
  });
  const approvedImageUrl = safeArtifactUrl(stagedShot.imageArtifactUrl)!;
  const refreshInput = buildStagedSingleShotRefreshInput({
    ...input,
    stage: "video",
    requestIdempotencyKey: input.requestIdempotencyKey,
  });
  const productFacts = [
    plan.product.description,
    ...Object.entries(plan.product.specs ?? {}).map(([key, value]) =>
      value === null || value === undefined || typeof value === "object"
        ? ""
        : `${key}: ${String(value)}`
    ),
  ].filter(
    (fact): fact is string => typeof fact === "string" && fact.trim().length > 0
  );
  const tenantId = requireStagedTenantId(input.tenantId, input.run.tenantId);
  const savedDetection = readCurrentStagedDetectedPeople({
    shotId: input.shotId,
    imageArtifactHash: stagedShot.imageArtifactHash,
    metadata: input.metadata as unknown as Record<string, any>,
  });
  const savedBindings = readCurrentStagedSpeakerVisualBindings({
    shot: stagedShot as unknown as Record<string, any>,
    metadata: input.metadata as unknown as Record<string, any>,
    plan,
    shotId: input.shotId,
  });
  const safeDialogue = removeStagedMinorDialogueLines(
    planShot.dialogue,
    plan.cast
  );
  const requiredSpeakerLabels = getStagedDialogueSpeakerLabels(
    safeDialogue,
    plan.cast,
    stagedShot.castInShot
  );
  if (requiredSpeakerLabels.length > 0 && !savedBindings) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_speaker_visual_bindings_required",
    });
  }
  if (!tenantId.trim()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "MARKETPLACE_VIDEO_PROMPT_TENANT_REQUIRED",
    });
  }
  const generated = await generateMarketplaceAutoReviewVideoPrompt({
    userId: input.run.userId,
    tenantId,
    publicUrl: input.publicUrl,
    runId: input.run.id,
    shotId: input.shotId,
    approvedImageUrl,
    promptModel: input.model,
    requestIdempotencyKey: input.requestIdempotencyKey,
    shot: stagedShot?.approvedShotAction
      ? { ...planShot, approvedShotAction: stagedShot.approvedShotAction }
      : planShot,
    speakerVisualBindings: savedBindings,
    ...(savedDetection
      ? {
          detectedPeople: savedDetection.detectedPeople,
          detectedPeopleSkillRun: savedDetection.detectionSkillRun,
        }
      : {}),
    cast: plan.cast ?? [],
    productName: plan.product.productName,
    productFacts,
    referenceManifest: refreshInput.referenceManifest,
    instruction: input.instruction,
    onProgress: input.onProgress,
  });
  if (
    !isMarketplaceAutoReviewVideoPromptComplete({
      value: generated.prompt,
      approvedDialogue: removeStagedMinorDialogueLines(
        planShot.dialogue,
        plan.cast
      ),
      detectedPersonIds: generated.detectedPeople.map(person => person.id),
      derivedDialogueTurns: planShot.dialogueTurns?.filter(turn => {
        const member = plan.cast?.find(
          candidate => candidate.castId === turn.castId
        );
        return !member || !isStagedCastMemberMinor(member);
      }),
      cast: plan.cast,
    })
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `MARKETPLACE_VIDEO_PROMPT_SKILL_OUTPUT_INCOMPLETE:shot-${input.shotId}`,
    });
  }
  return {
    prompt: generated.prompt,
    model: generated.model,
    provider: generated.provider,
    estimatedCredits: generated.estimatedCredits,
    skillRuns: generated.skillRuns,
    detectedPeople: generated.detectedPeople,
  };
}

/**
 * Detect people in the exact approved start frame independently of video
 * prompt authoring. The result is persisted before the user maps dialogue
 * speakers, so a later prompt-generation failure cannot discard the review.
 */
export async function detectStagedAutoReviewShotPeople(input: {
  runId: string;
  shotId: number;
  expectedImageArtifactHash: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
  runtime?: StagedCheckpointRuntime;
  workerExecution?: boolean;
  onProgress?: (progress: {
    progress: number;
    stage: string;
    message: string;
  }) => Promise<void>;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedMetadataPersisted(run);
  assertStagedRunMutable(run);
  const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
  const metadata = parseStagedMetadata(run);
  const shot = metadata.stagedSequentialStoryboard.shots.find(
    item => item.shotId === input.shotId
  );
  if (!shot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_invalid_shot_contract",
    });
  }
  assertStagedVideoPromptImageReady({
    shotId: input.shotId,
    shot,
    checkpoints: metadata.stagedSequentialStoryboard.reviewCheckpoints,
  });
  const imageArtifactHash = requireStagedImageArtifactHash(shot);
  if (imageArtifactHash !== input.expectedImageArtifactHash) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }

  const resultIdempotencyKey = stagedResultIdempotencyKey(input.idempotencyKey);
  const existingJob = await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
    db,
    tenantId,
    input.workerExecution ? resultIdempotencyKey : input.idempotencyKey
  );
  if (existingJob) {
    return {
      runId: run.id,
      workerJobId: existingJob.id,
      status: existingJob.status,
    };
  }

  if (!input.workerExecution) {
    const activeDetectionJobs = await db
      .select({ id: workerJobs.id, status: workerJobs.status, inputJson: workerJobs.inputJson })
      .from(workerJobs)
      .where(
        and(
          eq(workerJobs.tenantId, tenantId),
          eq(workerJobs.jobType, "marketplace.auto_review.execute"),
          sql`${workerJobs.inputJson}->>'runId' = ${run.id}`,
          sql`${workerJobs.status} in ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled')`
        )
      )
      .orderBy(desc(workerJobs.createdAt))
      .limit(32);
    const activeDetectionJob = activeDetectionJobs.find(job => {
      const jobInput = record(job.inputJson);
      const operationInput = record(jobInput.operationInput ?? jobInput);
      return (
        jobInput.operation === "staged_person_detection" &&
        Number(operationInput.shotId) === input.shotId
      );
    });
    if (activeDetectionJob) {
      return {
        runId: run.id,
        workerJobId: activeDetectionJob.id,
        operation: "staged_person_detection",
        status: activeDetectionJob.status,
      };
    }
    const queued = await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId,
      userId: input.auth.userId,
      runId: run.id,
      operation: {
        operation: "staged_person_detection",
        runId: run.id,
        shotId: input.shotId,
        expectedImageArtifactHash: imageArtifactHash,
        requestIdempotencyKey: input.idempotencyKey,
      },
      idempotencyKey: input.idempotencyKey,
      priority: 35,
    });
    return {
      runId: run.id,
      workerJobId: queued.jobId,
      operation: "staged_person_detection",
      status: "queued" as const,
    };
  }

  const approvedImageUrl = safeArtifactUrl(shot.imageArtifactUrl);
  if (!approvedImageUrl) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_image_artifact_missing",
    });
  }
  const stagedPipeline = record((metadata as any).stagedPipeline);
  const plan = record(stagedPipeline.plan) as unknown as StagedStoryArcPlan;
  const safeDialogue = removeStagedMinorDialogueLines(shot.dialogue, plan.cast);
  const speakerReferences = buildStagedShotSpeakerReferences({
    metadata: metadata as unknown as Record<string, any>,
    plan,
    shotId: input.shotId,
  });
  const detection = await detectMarketplaceAutoReviewShotPeople({
    userId: input.auth.userId,
    tenantId,
    publicUrl: input.runtime?.publicUrl,
    runId: run.id,
    shotId: input.shotId,
    approvedImageUrl,
    requestIdempotencyKey: input.idempotencyKey,
    dialogue: safeDialogue,
    speakerReferences,
    singleSpeakerDialogueFallback:
      inferMarketplaceSingleSpeakerDialogueDefault(plan.cast ?? []),
    onProgress: input.onProgress,
  });

  const dialogueSpeakers = getStagedDialogueSpeakerLabels(
    safeDialogue,
    plan.cast,
    shot.castInShot
  );
  const autoBindings = detection.speakerVisualBindings;
  const completeAutoBindings =
    dialogueSpeakers.length > 0 &&
    Object.keys(autoBindings).length === dialogueSpeakers.length &&
    dialogueSpeakers.every(speaker => typeof autoBindings[speaker] === "string") &&
    new Set(Object.values(autoBindings)).size === dialogueSpeakers.length &&
    Object.values(autoBindings).every(personId =>
      detection.detectedPeople.some(person => person.id === personId)
    );
  const autoBindingsSourceHash = completeAutoBindings
    ? buildStagedSpeakerBindingsSourceHash({
        imageArtifactHash,
        dialogue: safeDialogue,
        speakerReferences,
        speakerLabels: dialogueSpeakers,
      })
    : null;

  return mutateOwnedStagedMetadata({
    runId: run.id,
    expectedStateDigest: stagedMetadataStateDigest(metadata),
    idempotencyKey: resultIdempotencyKey,
    auth: input.auth,
    queueAdvance: false,
    allowStateDrift(current) {
      const currentShot = current.stagedSequentialStoryboard.shots.find(
        item => item.shotId === input.shotId
      );
      const currentReferences = buildStagedShotSpeakerReferences({
        metadata: current as unknown as Record<string, any>,
        plan: record(record((current as any).stagedPipeline).plan) as unknown as StagedStoryArcPlan,
        shotId: input.shotId,
      });
      return (
        currentShot?.imageArtifactHash === imageArtifactHash &&
        currentShot.dialogue === shot.dialogue &&
        currentShot.speakerVisualBindingsImageHash ===
          (shot as any).speakerVisualBindingsImageHash &&
        (currentShot as any).speakerVisualBindingsMatchType ===
          (shot as any).speakerVisualBindingsMatchType &&
        (currentShot as any).speakerVisualBindingsSourceHash ===
          (shot as any).speakerVisualBindingsSourceHash &&
        JSON.stringify(record(currentShot.speakerVisualBindings)) ===
          JSON.stringify(record((shot as any).speakerVisualBindings)) &&
        JSON.stringify(currentReferences) === JSON.stringify(speakerReferences)
      );
    },
    mutate(current) {
      const currentShot = current.stagedSequentialStoryboard.shots.find(
        item => item.shotId === input.shotId
      );
      if (
        !currentShot ||
        currentShot.imageArtifactHash !== imageArtifactHash ||
        currentShot.dialogue !== shot.dialogue
      ) {
        throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
      }
      const promptGeneration = {
        ...record(record((current as any).stagedPipeline).promptGeneration),
        [`person_detection:${input.shotId}`]: {
          detectedAt: new Date().toISOString(),
          sourceImageHash: imageArtifactHash,
          detectedPeople: detection.detectedPeople,
          model: detection.model,
          provider: detection.provider,
          estimatedCredits:
            detection.estimatedCredits +
            (detection.attributionSkillRun?.estimatedCredits ?? 0),
          speakerVisualMatchIssue: detection.speakerVisualMatchIssue ?? null,
          skillRuns: [
            detection.skillRun,
            ...(detection.attributionSkillRun
              ? [detection.attributionSkillRun]
              : []),
          ],
        },
      };
      const invalidatedCheckpoints = current.stagedSequentialStoryboard.reviewCheckpoints.map(
        checkpoint =>
          checkpoint.shotId === input.shotId &&
          ["video_prompt", "video_result"].includes(checkpoint.kind) &&
          checkpoint.state !== "superseded"
            ? {
                ...checkpoint,
                state: "superseded" as const,
                rejectionReasonCode: "staged_speaker_binding_updated",
              }
            : checkpoint
      );
      const tasks = removeStagedTasksInvalidatedByPrompt(
        record((current as any).stagedPipeline),
        [{ shotId: input.shotId, stage: "video" }]
      );
      const nextShot = { ...currentShot } as Record<string, any>;
      nextShot.revision = currentShot.revision + 1;
      nextShot.state = "video_prompt_awaiting";
      nextShot.videoPrompt = null;
      nextShot.videoPromptHash = null;
      nextShot.videoArtifactHash = null;
      nextShot.videoArtifactUrl = null;
      // A new detection can assign different IDs. Invalidate any mapping
      // against the previous detection before exposing the new choices.
      if (completeAutoBindings) {
        nextShot.speakerVisualBindings = autoBindings;
        nextShot.speakerVisualBindingsImageHash = imageArtifactHash;
        nextShot.speakerVisualBindingsMatchType = "auto";
        nextShot.speakerVisualBindingsSourceHash = autoBindingsSourceHash;
      } else {
        delete nextShot.speakerVisualBindings;
        delete nextShot.speakerVisualBindingsImageHash;
        delete nextShot.speakerVisualBindingsMatchType;
        delete nextShot.speakerVisualBindingsSourceHash;
      }
      return {
        metadata: {
          ...current,
          stagedPipeline: {
            ...record((current as any).stagedPipeline),
            tasks,
            finalAssembly: null,
            promptGeneration,
          },
          stagedSequentialStoryboard: {
            ...current.stagedSequentialStoryboard,
            shots: current.stagedSequentialStoryboard.shots.map(item =>
              item.shotId === input.shotId ? (nextShot as typeof item) : item
            ),
            reviewCheckpoints: invalidatedCheckpoints,
          },
        },
        planRevision: current.planReview.planRevision,
      };
    },
  });
}

/**
 * Generates one shot prompt through the existing single-shot skill seam.
 * This operation never submits an image/video task or queues provider spend;
 * only a separate explicit image/video action can authorize media generation.
 */
export async function generateStagedAutoReviewShotPrompt(input: {
  runId: string;
  shotId: number;
  stage: "image" | "video";
  expectedStateDigest: string;
  expectedShotRevision?: number;
  promptContextDigest?: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
  runtime?: StagedCheckpointRuntime;
  /** Set only by the canonical worker executor after durable admission. */
  workerExecution?: boolean;
  onProgress?: (progress: {
    progress: number;
    stage: string;
    message: string;
  }) => Promise<void>;
  /** New capability — optional free-text per-shot instruction for
   *  AI-assisted prompt adjustment (e.g. "there's an 8-month-old baby in
   *  the scene"). Threaded through to the skill call as a distinct,
   *  clearly-delimited section; never merged into the base story/dialogue
   *  content. */
  instruction?: string;
  model?: string;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedMetadataPersisted(run);
  const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
  const resultIdempotencyKey = stagedResultIdempotencyKey(input.idempotencyKey);
  const existingJob = await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
    db,
    tenantId,
    input.workerExecution ? resultIdempotencyKey : input.idempotencyKey
  );
  if (existingJob) {
    return {
      runId: run.id,
      operation: operationFromWorkerJob(existingJob, run),
      status: existingJob.status,
      workerJobId: existingJob.id,
    };
  }
  const metadata = parseStagedMetadata(run);
  const shot = metadata.stagedSequentialStoryboard.shots.find(
    item => item.shotId === input.shotId
  );
  if (input.stage === "video") {
    assertTerminalVideoPromptGenerationAllowed(run, metadata, [
      { shotId: input.shotId, stage: input.stage },
    ]);
  } else {
    assertStagedRunMutable(run);
  }
  const hasPromptSnapshot =
    input.expectedShotRevision !== undefined &&
    typeof input.promptContextDigest === "string" &&
    input.promptContextDigest.length > 0;
  const promptSnapshotMatches = Boolean(
    input.workerExecution &&
    hasPromptSnapshot &&
    shot?.revision === input.expectedShotRevision &&
    buildStagedShotPromptContextDigest({
      run,
      metadata,
      shotId: input.shotId,
      stage: input.stage,
      publicUrl: input.runtime?.publicUrl,
      tenantId: input.auth.tenantId,
      instruction: input.instruction,
      model: input.model,
    }) === input.promptContextDigest
  );
  if (
    input.workerExecution &&
    (hasPromptSnapshot
      ? !promptSnapshotMatches
      : stagedMetadataStateDigest(metadata) !== input.expectedStateDigest)
  ) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }
  if (!shot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "checkpoint_not_editable",
    });
  }
  if (input.stage === "video") {
    assertStagedVideoPromptSpeakerBindingsComplete({
      metadata: metadata as unknown as Record<string, any>,
      plan: planAndMetadataFromRun(run).plan,
      targets: [
        { shotId: input.shotId, stage: "video", refreshPrompt: true },
      ],
    });
  }
  if (input.stage === "video") {
    assertStagedVideoPromptImageReady({
      shotId: input.shotId,
      shot,
      checkpoints: metadata.stagedSequentialStoryboard.reviewCheckpoints,
    });
  }
  if (!input.workerExecution) {
    const promptContextDigest = buildStagedShotPromptContextDigest({
      run,
      metadata,
      shotId: input.shotId,
      stage: input.stage,
      publicUrl: input.runtime?.publicUrl,
      tenantId: input.auth.tenantId,
      instruction: input.instruction,
      model: input.model,
    });
    const queued = await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId,
      userId: input.auth.userId,
      runId: run.id,
      operation: {
        operation: "staged_prompt_generation",
        runId: run.id,
        shotId: input.shotId,
        stage: input.stage,
        expectedStateDigest: input.expectedStateDigest,
        expectedShotRevision: shot.revision,
        promptContextDigest,
        requestIdempotencyKey: input.idempotencyKey,
        instruction: input.instruction,
        model: input.model,
      },
      idempotencyKey: input.idempotencyKey,
      priority: 35,
    });
    return {
      runId: run.id,
      workerJobId: queued.jobId,
      operation: "staged_prompt_generation",
      status: "queued",
    };
  }

  const generated = await generateCompleteStagedShotPrompt({
    run,
    metadata,
    shotId: input.shotId,
    publicUrl: input.runtime?.publicUrl,
    tenantId: input.auth.tenantId,
    instruction: input.instruction,
    model: input.model,
    stage: input.stage,
    requestIdempotencyKey: input.idempotencyKey,
    onProgress: input.onProgress,
  });

  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: resultIdempotencyKey,
    auth: input.auth,
    queueAdvance: false,
    ...(input.stage === "video"
      ? {
          terminalVideoPromptTargets: [
            { shotId: input.shotId, stage: input.stage },
          ],
        }
      : {}),
    ...(hasPromptSnapshot
      ? {
          allowStateDrift(current) {
            const currentShot = current.stagedSequentialStoryboard.shots.find(
              item => item.shotId === input.shotId
            );
            return (
              currentShot?.revision === input.expectedShotRevision &&
              buildStagedShotPromptContextDigest({
                run,
                metadata: current,
                shotId: input.shotId,
                stage: input.stage,
                publicUrl: input.runtime?.publicUrl,
                tenantId: input.auth.tenantId,
                instruction: input.instruction,
                model: input.model,
              }) === input.promptContextDigest
            );
          },
        }
      : {}),
    mutate(current, operationId) {
      const currentShot = current.stagedSequentialStoryboard.shots.find(
        item => item.shotId === input.shotId
      );
      if (!currentShot) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "staged_state_drift",
        });
      }
      const revision = currentShot.revision + 1;
      const imagePrompt = input.stage === "image";
      const contentHash = imagePrompt
        ? buildStagedImagePromptContentHash({
            revision,
            shotId: input.shotId,
            prompt: generated.prompt,
            referenceManifestHash: requireStagedReferenceManifestHash(
              current.stagedSequentialStoryboard.referenceManifestHash
            ),
          })
        : buildStagedVideoPromptContentHash({
            revision,
            shotId: input.shotId,
            prompt: generated.prompt,
            imageArtifactHash: requireStagedImageArtifactHash(currentShot),
          });
      const replacement = buildStagedCheckpoint({
        checkpointId: `${imagePrompt ? "image_prompt" : "video_prompt"}:${input.runId}:shot-${input.shotId}:r${revision}:generate-${operationId}`,
        kind: imagePrompt ? "image_prompt" : "video_prompt",
        shotId: input.shotId,
        revision,
        contentHash,
        model: generated.model,
        provider: generated.provider,
        estimatedCredits: generated.estimatedCredits,
        referenceManifestHash:
          current.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
      });
      const invalidated =
        current.stagedSequentialStoryboard.reviewCheckpoints.map(item => {
          const invalidatedByImage =
            imagePrompt &&
            item.shotId === input.shotId &&
            item.kind === "image_prompt";
          const invalidatedByVideo =
            !imagePrompt &&
            item.shotId === input.shotId &&
            ["video_prompt", "video_result"].includes(item.kind);
          return (invalidatedByImage || invalidatedByVideo) &&
            item.state !== "superseded"
            ? {
                ...item,
                state: "superseded" as const,
                rejectionReasonCode: "staged_prompt_generated",
              }
            : item;
        });
      const tasks = removeStagedTasksInvalidatedByPrompt(
        record((current as any).stagedPipeline),
        [{ shotId: input.shotId, stage: input.stage, promptOnly: true }]
      );
      const correctionRequired = record(
        record((current as any).stagedPipeline).correctionRequired
      );
      const nextShot = {
        ...currentShot,
        revision,
        ...(imagePrompt
          ? {
              imagePrompt: generated.prompt,
              imagePromptHash: contentHash,
            }
          : {
              videoPrompt: generated.prompt,
              videoPromptHash: contentHash,
              videoArtifactHash: null,
              videoArtifactUrl: null,
              state: "video_prompt_awaiting",
            }),
      };
      const nextShots = current.stagedSequentialStoryboard.shots.map(item =>
        item.shotId === input.shotId ? nextShot : item
      );
      const isLegacyUnscopedPromptCorrection =
        (correctionRequired.reasonCode ===
          "MARKETPLACE_SINGLE_SHOT_SKILL_FAILED" ||
          correctionRequired.reasonCode ===
            "MARKETPLACE_IMAGE_PROMPT_SKILL_OUTPUT_INCOMPLETE") &&
        (correctionRequired.shotId === null ||
          correctionRequired.shotId === undefined) &&
        nextShots.every(shot => Boolean(String(shot.imagePrompt ?? "").trim()));
      const clearsPromptGenerationCorrection =
        input.stage === "image" &&
        correctionRequired.stageKey === "image_generation" &&
        ((correctionRequired.reasonCode ===
          "MARKETPLACE_IMAGE_PROMPT_GENERATION_FAILED" &&
          Number(correctionRequired.shotId) === input.shotId) ||
          isLegacyUnscopedPromptCorrection);
      return {
        metadata: {
          ...current,
          stagedPipeline: {
            ...((current as any).stagedPipeline ?? {}),
            ...(clearsPromptGenerationCorrection
              ? { correctionRequired: null }
              : {}),
            tasks,
            finalAssembly: null,
            promptGeneration: {
              ...record((current as any).stagedPipeline?.promptGeneration),
              [`${input.stage}:${input.shotId}`]: {
                generatedAt: new Date().toISOString(),
                operationId,
                source: generated.skillRuns.map(run => run.skill).join(" + "),
                model: generated.model,
                provider: generated.provider,
                estimatedCredits: generated.estimatedCredits,
                skillRuns: generated.skillRuns,
                ...(generated.detectedPeople
                  ? {
                      detectedPeople: generated.detectedPeople,
                      sourceImageHash: currentShot.imageArtifactHash,
                    }
                  : {}),
              },
            },
          },
          stagedSequentialStoryboard: {
            ...current.stagedSequentialStoryboard,
            shots: nextShots,
            reviewCheckpoints: [...invalidated, replacement],
          },
        },
        planRevision: current.planReview.planRevision,
      };
    },
  });
}

export async function editStagedAutoReviewAudioPlan(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  text: string;
  language?: string;
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    queueAdvance:
      input.storySummary !== undefined || input.dialogue !== undefined,
    mutate(metadata, operationId) {
      const current =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.kind === "audio_plan" &&
            checkpoint.state !== "superseded"
        );
      const currentPlan = ((metadata as any).stagedPipeline?.audioPlan ??
        null) as Record<string, any> | null;
      if (!current || !isStagedCheckpointEditable(current) || !currentPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "checkpoint_not_awaiting",
        });
      }
      const language = input.language ?? currentPlan.language;
      const model = currentPlan.model;
      const provider = currentPlan.provider;
      const estimatedCredits = Number(currentPlan.estimatedCredits);
      if (
        typeof language !== "string" ||
        typeof model !== "string" ||
        typeof provider !== "string" ||
        !Number.isFinite(estimatedCredits)
      ) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "staged_audio_plan_incomplete",
        });
      }
      const nextPlan = buildStagedAudioPlan({
        text: input.text.trim().slice(0, 4000),
        language: language.trim().slice(0, 12),
        model,
        provider,
        estimatedCredits,
      });
      const revision = current.revision + 1;
      const replacement = buildStagedCheckpoint({
        checkpointId: `audio-plan:${input.runId}:r${revision}:edit-${operationId}`,
        kind: "audio_plan",
        revision,
        contentHash: buildProductionStableHash(nextPlan),
        model: nextPlan.model,
        provider: nextPlan.provider,
        estimatedCredits: nextPlan.estimatedCredits,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
      });
      return {
        metadata: {
          ...metadata,
          stagedPipeline: {
            ...((metadata as any).stagedPipeline ?? {}),
            audioPlan: nextPlan,
            audioUrl: null,
            finalAssembly: null,
            tasks: Object.fromEntries(
              Object.entries(
                ((metadata as any).stagedPipeline?.tasks ?? {}) as Record<
                  string,
                  unknown
                >
              ).filter(([key]) => key !== "audio:0")
            ),
          },
          stagedSequentialStoryboard: {
            ...metadata.stagedSequentialStoryboard,
            reviewCheckpoints: [
              ...metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
                checkpoint =>
                  checkpoint.checkpointId === current.checkpointId ||
                  (checkpoint.kind === "final_assembly" &&
                    checkpoint.state !== "superseded")
                    ? {
                        ...checkpoint,
                        state: "superseded" as const,
                        rejectionReasonCode: "staged_audio_edit",
                      }
                    : checkpoint
              ),
              replacement,
            ],
          },
        },
        planRevision: metadata.planReview.planRevision,
      };
    },
  });
}

export async function redraftStagedAutoReviewPlan(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  notes?: string;
  model?: string;
  selectedConcept?: StagedStoryConceptOption;
  autoContinuation?: { imageModel: string; promptModel?: string };
  auth: StagedCheckpointAuth;
  /** Set only by the canonical worker executor after durable admission. */
  workerExecution?: boolean;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const run = await requireOwnedRun(db, input.runId, input.auth);
  assertStagedRunMutable(run);
  assertStagedMetadataPersisted(run);
  const tenantId = requireStagedTenantId(input.auth.tenantId, run.tenantId);
  const resultIdempotencyKey = stagedResultIdempotencyKey(input.idempotencyKey);
  const existingJob = await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
    db,
    tenantId,
    input.workerExecution ? resultIdempotencyKey : input.idempotencyKey
  );
  if (existingJob) {
    return {
      runId: run.id,
      operation: operationFromWorkerJob(existingJob, run),
      status: existingJob.status,
      workerJobId: existingJob.id,
    };
  }
  const metadata = parseStagedMetadata(run);
  if (stagedMetadataStateDigest(metadata) !== input.expectedStateDigest) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }
  const current = ((metadata as any).stagedPipeline?.plan ?? null) as
    | (StagedStoryArcPlan & { state?: string })
    | null;
  if (!current || current.state === "superseded") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "checkpoint_not_awaiting",
    });
  }
  if (
    (!(typeof current.selectedConceptId === "string" && current.selectedConceptId.trim()) && !input.selectedConcept) ||
    (Array.isArray(current.shots) && current.shots.length === 0 && !input.selectedConcept)
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_story_concept_selection_required",
    });
  }
  const redraftCount = metadata.planReview.redraftCount;
  if (!Number.isSafeInteger(redraftCount) || redraftCount < 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_redraft_count_invalid",
    });
  }
  if (redraftCount >= 3) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_redraft_limit_reached",
    });
  }

  if (!input.workerExecution) {
    if (input.autoContinuation) {
      return db.transaction(async tx => {
        const [currentRun] = await tx
          .select()
          .from(marketplaceAutoReviewRuns)
          .where(
            and(
              eq(marketplaceAutoReviewRuns.id, input.runId),
              eq(marketplaceAutoReviewRuns.userId, input.auth.userId),
              tenantAccessClause(input.auth)
            )
          )
          .limit(1);
        if (!currentRun) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Auto review run not found",
          });
        }
        assertStagedRunMutable(currentRun);
        assertStagedMetadataPersisted(currentRun);
        const currentMetadata = parseStagedMetadata(currentRun);
        if (
          stagedMetadataStateDigest(currentMetadata) !==
          input.expectedStateDigest
        ) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "staged_state_drift",
          });
        }
        const existing = await findMarketplaceAutoReviewWorkerJobByIdempotencyKey(
          tx,
          tenantId,
          input.idempotencyKey
        );
        if (existing) {
          return {
            runId: currentRun.id,
            operation: operationFromWorkerJob(existing, currentRun),
            status: existing.status,
            workerJobId: existing.id,
          };
        }

        const now = new Date().toISOString();
        const automation = {
          schemaVersion: 1,
          status: "running" as const,
          stage: "story_draft" as const,
          planRevision: currentMetadata.planReview.planRevision + 1,
          imageModel: input.autoContinuation.imageModel.trim(),
          ...(input.autoContinuation.promptModel?.trim()
            ? { promptModel: input.autoContinuation.promptModel.trim() }
            : {}),
          workerJobIds: {},
          startedAt: now,
          updatedAt: now,
        };
        const queued = await enqueueMarketplaceAutoReviewWorkerJobInTransaction({
          query: tx,
          admission: {
            tenantId,
            userId: currentRun.userId,
            runId: currentRun.id,
            operation: {
              operation: "staged_story_redraft",
              runId: currentRun.id,
              expectedStateDigest: input.expectedStateDigest,
              requestIdempotencyKey: input.idempotencyKey,
              notes: input.notes?.trim().slice(0, 1200),
              model: input.model,
              selectedConcept: input.selectedConcept,
            },
            idempotencyKey: input.idempotencyKey,
            priority: 35,
          },
        });
        const currentPipeline = record(
          (currentMetadata as any).stagedPipeline
        );
        const nextMetadata = {
          ...currentMetadata,
          stagedPipeline: {
            ...currentPipeline,
            autoContinuation: {
              ...automation,
              workerJobIds: { storyDraft: queued.jobId },
            },
          },
        };
        const [updated] = await tx
          .update(marketplaceAutoReviewRuns)
          .set({
            metadataJson: nextMetadata as Record<string, any>,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(marketplaceAutoReviewRuns.id, currentRun.id),
              eq(marketplaceAutoReviewRuns.userId, input.auth.userId),
              eq(marketplaceAutoReviewRuns.updatedAt, currentRun.updatedAt),
              tenantAccessClause(input.auth)
            )
          )
          .returning({ id: marketplaceAutoReviewRuns.id });
        if (!updated) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "staged_state_drift",
          });
        }
        return {
          runId: currentRun.id,
          workerJobId: queued.jobId,
          operation: "staged_story_redraft",
          status: "queued" as const,
        };
      });
    }
    const queued = await enqueueMarketplaceAutoReviewWorkerJob({
      tenantId,
      userId: input.auth.userId,
      runId: run.id,
      operation: {
        operation: "staged_story_redraft",
        runId: run.id,
        expectedStateDigest: input.expectedStateDigest,
        requestIdempotencyKey: input.idempotencyKey,
        notes: input.notes?.trim().slice(0, 1200),
        model: input.model,
        selectedConcept: input.selectedConcept,
      },
      idempotencyKey: input.idempotencyKey,
      priority: 35,
    });
    return {
      runId: run.id,
      workerJobId: queued.jobId,
      operation: "staged_story_redraft",
      status: "queued",
    };
  }

  const anchors = record((metadata as Record<string, any>).referenceAnchors);
  const base = metadata as Record<string, any>;
  const languagePlan = requireStagedLanguagePlanFromMetadata(base);
  const requestedShotCount = anchors.shotCount;
  const shotCount =
    requestedShotCount === "auto"
      ? "auto"
      : typeof requestedShotCount === "number"
        ? requestedShotCount
        : undefined;
  const shotDurationSeconds =
    typeof anchors.shotDurationSeconds === "number"
      ? anchors.shotDurationSeconds
      : undefined;
  const cast = deriveStagedCastFromManifest(base.customReferenceManifest);
  const storyPlanningModel =
    typeof anchors.storyPlanningModel === "string"
      ? anchors.storyPlanningModel
      : undefined;
  const reviewTone =
    typeof anchors.reviewTone === "string" ? anchors.reviewTone : undefined;
  const storytellingStructure =
    typeof anchors.storytellingStructure === "string"
      ? anchors.storytellingStructure
      : undefined;
  const nextPlan = await generateStagedStoryArcPlanWithLLM({
    runId: input.runId,
    userId: input.auth.userId,
    tenantId,
    product: current.product,
    referenceManifestHash: current.referenceManifestHash,
    revision: metadata.planReview.planRevision + 1,
    reviewTone,
    storytellingStructure,
    cast,
    shotCount,
    shotDurationSeconds,
    model: input.model ?? storyPlanningModel,
    languagePlan,
    previousStorySummary: input.notes?.trim()
      ? input.notes.trim().slice(0, 500)
      : null,
    selectedConcept: input.selectedConcept ?? findConfirmedStagedReviewConcept(current),
  });
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: `story-plan:${input.runId}:r${nextPlan.planRevision}:redraft`,
    kind: "story_plan",
    revision: nextPlan.planRevision,
    contentHash: nextPlan.storyPlanHash,
    model: nextPlan.authoring.model,
    provider: nextPlan.authoring.provider,
    estimatedCredits: 0,
    referenceManifestHash: nextPlan.referenceManifestHash,
  });
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: resultIdempotencyKey,
    auth: input.auth,
    mutate(currentMetadata) {
      const currentPipeline = record((currentMetadata as any).stagedPipeline);
      const currentPlan = (currentPipeline.plan ?? null) as typeof current;
      if (!currentPlan || currentPlan.state === "superseded") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "staged_state_drift",
        });
      }
      const currentRedraftCount =
        Number(currentMetadata.planReview.redraftCount) || 0;
      return {
        metadata: {
          ...currentMetadata,
          planReview: {
            ...currentMetadata.planReview,
            status: "awaiting" as const,
            planRevision: nextPlan.planRevision,
            approvedRevision: null,
            redraftCount: currentRedraftCount + 1,
          },
          stagedPipeline: {
            ...currentPipeline,
            usedReviewConcepts: rememberUsedReviewConcept(
              currentPipeline.usedReviewConcepts,
              findConfirmedStagedReviewConcept(currentPlan)
            ),
            plan: nextPlan,
            planView: buildStagedPlanView(nextPlan),
            tasks: {},
            audioPlan: null,
            audioUrl: null,
            finalAssembly: null,
          },
          stagedSequentialStoryboard: {
            ...currentMetadata.stagedSequentialStoryboard,
            planRevision: nextPlan.planRevision,
            storyPlanStatus: "awaiting" as const,
            storyPlanHash: nextPlan.storyPlanHash,
            referenceManifestHash: nextPlan.referenceManifestHash,
            shots: nextPlan.shots.map(shot => ({
              shotId: shot.shotId,
              revision: nextPlan.planRevision,
              state: "story_awaiting",
              storySummary: shot.storySummary,
              dialogue: shot.dialogue,
              imagePromptHash: null,
              imageArtifactHash: null,
              videoPromptHash: null,
              videoArtifactHash: null,
            })),
            reviewCheckpoints: [storyCheckpoint],
          },
        },
        planRevision: nextPlan.planRevision,
      };
    },
  });
}

export async function editStagedAutoReviewFinalAssembly(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  shotOrder: number[];
  includeAudio: boolean;
  // Additive (marketplace-staged-remotion-final-render): which of the 10
  // shared caption presets the staged Remotion final render burns
  // `captionLines` in with; `"no_subtitle_style"` disables burn-in
  // entirely. Optional — omitted requests keep whatever was persisted
  // before (defaulting to `"classic_box"` if never set).
  subtitlePresetId?: string;
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    mutate(metadata, operationId) {
      const current =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.kind === "final_assembly" &&
            checkpoint.state !== "superseded"
        );
      const assembly = ((metadata as any).stagedPipeline?.finalAssembly ??
        null) as Record<string, any> | null;
      if (
        !current ||
        !isStagedCheckpointEditable(current) ||
        !assembly ||
        !Array.isArray(assembly.shots)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "checkpoint_not_awaiting",
        });
      }
      const subtitlePresetId = input.subtitlePresetId?.trim();
      if (!subtitlePresetId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "staged_subtitle_preset_required",
        });
      }
      const available = assembly.shots
        .map((shot: any) => Number(shot?.shotId))
        .filter(Number.isInteger);
      const order = input.shotOrder.map(Number);
      if (
        available.length === 0 ||
        order.length !== available.length ||
        new Set(order).size !== available.length ||
        order.some(shotId => !available.includes(shotId))
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_invalid_assembly_order",
        });
      }
      const shotsById = new Map(
        assembly.shots.map((shot: any) => [Number(shot.shotId), shot])
      );
      const nextAssembly = {
        ...assembly,
        shots: order.map(shotId => shotsById.get(shotId)),
        includeAudio: input.includeAudio,
        audio: input.includeAudio ? (assembly.audio ?? null) : null,
        subtitlePresetId,
      };
      const revision = current.revision + 1;
      const replacement = buildStagedCheckpoint({
        checkpointId: `final-assembly:${input.runId}:r${revision}:edit-${operationId}`,
        kind: "final_assembly",
        revision,
        contentHash: buildStagedFinalAssemblyHash(nextAssembly),
        model: "user-edit",
        provider: "user",
        estimatedCredits: 0,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
      });
      return {
        metadata: {
          ...metadata,
          stagedPipeline: {
            ...((metadata as any).stagedPipeline ?? {}),
            finalAssembly: {
              ...nextAssembly,
              contentHash: replacement.contentHash,
            },
          },
          stagedSequentialStoryboard: {
            ...metadata.stagedSequentialStoryboard,
            reviewCheckpoints: [
              ...metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
                checkpoint =>
                  checkpoint.checkpointId === current.checkpointId
                    ? {
                        ...checkpoint,
                        state: "superseded" as const,
                        rejectionReasonCode: "staged_assembly_edit",
                      }
                    : checkpoint
              ),
              replacement,
            ],
          },
        },
        planRevision: metadata.planReview.planRevision,
      };
    },
  });
}

/**
 * Pure transform used by `retryStagedAutoReviewFinalAssembly`'s
 * `mutateOwnedStagedMetadata` call — extracted so it can be unit-tested
 * without DB mocking (repo `...ForTest` convention).
 *
 * Clears BOTH `stagedPipeline.finalAssembly` AND the top-level render refs
 * (`renderJobId`/`renderEngine`/`renderSubmittedAt`) — leaving the latter
 * behind would make `advanceMarketplaceAutoReviewStagedArchitecture`'s
 * `hasRenderJobId` gate skip submitting a fresh render and instead re-poll
 * the same dead worker job forever. Belt-and-suspenders with the equivalent
 * clear in `reconcileStagedRemotionFinalRender`'s failed-job branch
 * (`marketplaceAutoReviewService.ts`); harmless/idempotent if both fire.
 */
export function computeRetryStagedAutoReviewFinalAssemblyMetadata(
  metadata: ReturnType<typeof parseStagedMetadata>
): {
  metadata: ReturnType<typeof parseStagedMetadata>;
  planRevision: number;
} {
  const current = metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
    checkpoint =>
      checkpoint.kind === "final_assembly" && checkpoint.state !== "superseded"
  );
  if (!current)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_final_assembly_unavailable",
    });
  const {
    renderJobId: _clearedRenderJobId,
    renderEngine: _clearedRenderEngine,
    renderSubmittedAt: _clearedRenderSubmittedAt,
    ...metadataWithoutRenderRefs
  } = metadata as unknown as Record<string, unknown>;
  return {
    metadata: {
      ...metadataWithoutRenderRefs,
      stagedPipeline: {
        ...((metadata as any).stagedPipeline ?? {}),
        finalAssembly: null,
      },
      stagedSequentialStoryboard: {
        ...metadata.stagedSequentialStoryboard,
        reviewCheckpoints:
          metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
            checkpoint =>
              checkpoint.checkpointId === current.checkpointId
                ? {
                    ...checkpoint,
                    state: "superseded" as const,
                    rejectionReasonCode: "staged_final_assembly_retry",
                  }
                : checkpoint
          ),
      },
    } as unknown as typeof metadata,
    planRevision: metadata.planReview.planRevision,
  };
}

export async function updateStagedAutoReviewFinalRenderSettings(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  settings: {
    subtitlePresetId?: string;
    aiDisclosureEnabled?: boolean;
    silenceTrimEnabled?: boolean;
    overlayText?: StagedFinalRenderSettings["overlayText"];
    overlayImage?: StagedFinalRenderSettings["overlayImage"];
  };
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    mutate(metadata) {
      const current = readStagedFinalRenderSettings(metadata);
      const overlayTextContent = input.settings.overlayText?.content?.trim();
      const overlayImageUrl = input.settings.overlayImage?.url?.trim();
      const next: StagedFinalRenderSettings = {
        subtitlePresetId:
          input.settings.subtitlePresetId?.trim() || current.subtitlePresetId,
        aiDisclosureEnabled:
          input.settings.aiDisclosureEnabled === undefined
            ? current.aiDisclosureEnabled
            : input.settings.aiDisclosureEnabled,
        silenceTrimEnabled:
          input.settings.silenceTrimEnabled === undefined
            ? current.silenceTrimEnabled
            : input.settings.silenceTrimEnabled,
        // An explicitly-sent overlay with empty content/url means "turn it
        // off" — that is the only way the UI can clear one.
        overlayText:
          input.settings.overlayText === undefined
            ? current.overlayText
            : overlayTextContent
              ? { ...input.settings.overlayText!, content: overlayTextContent }
              : null,
        overlayImage:
          input.settings.overlayImage === undefined
            ? current.overlayImage
            : overlayImageUrl
              ? { ...input.settings.overlayImage!, url: overlayImageUrl }
              : null,
      };
      return {
        metadata: {
          ...metadata,
          stagedPipeline: {
            ...((metadata as any).stagedPipeline ?? {}),
            finalRenderSettings: next,
          },
        } as typeof metadata,
        planRevision: metadata.planReview.planRevision,
      };
    },
  });
}

export async function retryStagedAutoReviewFinalAssembly(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    mutate: computeRetryStagedAutoReviewFinalAssemblyMetadata,
  });
}

export async function retryStagedAutoReviewShot(input: {
  runId: string;
  shotId: number;
  stage: "image" | "video";
  // Retained for API back-compat with existing callers. Every retry now
  // auto-approves the replacement checkpoint unconditionally (auto-approve
  // is the run-wide policy for every non-story checkpoint — see
  // buildStagedCheckpoint's autoApprove param), so this flag's value no
  // longer changes behavior.
  autoApprove?: boolean;
  // The model currently selected in the UI at the moment the user clicks
  // retry. Without this, the replacement checkpoint silently inherits
  // whatever model the shot happened to be approved with on a PRIOR
  // revision — stale, and invisible to the user, since nothing in the
  // retry response shows which model will actually be used.
  model?: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
}) {
  const selectedModel =
    typeof input.model === "string" ? input.model.trim() : "";
  const result = await mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    targetShotIds: [input.shotId],
    mutate(metadata, operationId) {
      const shot = metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === input.shotId
      );
      if (!shot)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_invalid_shot_contract",
        });
      // The client no longer disables the dispatch buttons on a
      // client-derived "does this shot have a prompt yet" check (2026-07-30
      // dead-button incident — a stale/mismatched client value silently
      // killed the button with no error). The server is now the single
      // authority: dispatching a shot that genuinely has no prompt yet fails
      // loudly here with a code the UI maps to plain Thai, instead of the
      // click doing nothing.
      const promptForStage =
        input.stage === "image"
          ? (shot as { imagePrompt?: string | null }).imagePrompt
          : (shot as { videoPrompt?: string | null }).videoPrompt;
      if (typeof promptForStage !== "string" || !promptForStage.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            input.stage === "image"
              ? "staged_image_prompt_missing"
              : "staged_video_prompt_missing",
        });
      }
      const currentImagePrompt =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.shotId === input.shotId &&
            checkpoint.kind === "image_prompt" &&
            checkpoint.state !== "superseded"
        );
      const currentImageResult =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.shotId === input.shotId &&
            checkpoint.kind === "image_result" &&
            checkpoint.state !== "superseded"
        );
      const currentVideoPrompt =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.shotId === input.shotId &&
            checkpoint.kind === "video_prompt" &&
            checkpoint.state !== "superseded"
        );
      const currentVideoResult =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.shotId === input.shotId &&
            checkpoint.kind === "video_result" &&
            checkpoint.state !== "superseded"
        );
      const correctionRequired = (metadata as any).stagedPipeline
        ?.correctionRequired as Record<string, unknown> | null | undefined;
      const correctionStage = String(correctionRequired?.stageKey ?? "");
      const correctionShotId = Number(correctionRequired?.shotId);
      const providerCorrectionMatches =
        correctionShotId === input.shotId &&
        ((input.stage === "image" && correctionStage === "image_generation") ||
          (input.stage === "video" && correctionStage === "video_generation"));
      const retryableCheckpointAvailable =
        input.stage === "image"
          ? isStagedCheckpointRetryable(currentImagePrompt) ||
            isStagedCheckpointRetryable(currentImageResult) ||
            (!currentImagePrompt && !currentImageResult)
          : (isStagedCheckpointRetryable(currentVideoPrompt) &&
              (!currentVideoResult ||
                currentVideoResult.state === "approved" ||
                isStagedCheckpointRetryable(currentVideoResult))) ||
            !currentVideoPrompt;
      if (!retryableCheckpointAvailable && !providerCorrectionMatches) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "checkpoint_not_retryable",
        });
      }
      const revision = shot.revision + 1;
      const kind = input.stage === "image" ? "image_prompt" : "video_prompt";
      const source = promptForStage.trim();
      if (input.stage === "video") {
        if (!safeArtifactUrl(shot.imageArtifactUrl)) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "staged_image_artifact_missing",
          });
        }
        requireStagedImageArtifactHash(shot);
      }
      let next = metadata;
      for (const checkpoint of metadata.stagedSequentialStoryboard
        .reviewCheckpoints) {
        if (
          checkpoint.shotId === input.shotId &&
          (input.stage === "image" ||
            checkpoint.kind === "video_prompt" ||
            checkpoint.kind === "video_result") &&
          checkpoint.state !== "superseded"
        ) {
          next = replaceCheckpointState(
            next,
            checkpoint.checkpointId,
            "superseded"
          );
        }
      }
      if (!selectedModel) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `STAGED_${input.stage.toUpperCase()}_MODEL_REQUIRED`,
        });
      }
      const resolvedModel = selectedModel;
      const resolvedProvider = modelProvider(resolvedModel);
      const resolvedEstimatedCredits = modelCost(resolvedModel);
      // Every retry auto-approves unconditionally (see the `autoApprove`
      // field doc-comment above) — build the replacement already `approved`
      // via buildStagedCheckpoint's autoApprove param instead of building it
      // `awaiting` and then separately transitioning it.
      const replacement = buildStagedCheckpoint({
        checkpointId: `${kind}:${input.runId}:shot-${input.shotId}:r${revision}:retry-${operationId}`,
        kind,
        shotId: input.shotId,
        revision,
        contentHash:
          input.stage === "image"
            ? buildStagedImagePromptContentHash({
                revision,
                shotId: input.shotId,
                prompt: source,
                referenceManifestHash: requireStagedReferenceManifestHash(
                  metadata.stagedSequentialStoryboard.referenceManifestHash
                ),
              })
            : buildStagedVideoPromptContentHash({
                revision,
                shotId: input.shotId,
                prompt: source,
                imageArtifactHash: requireStagedImageArtifactHash(shot),
              }),
        model: resolvedModel,
        provider: resolvedProvider,
        estimatedCredits: resolvedEstimatedCredits,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
        mediaDispatchIntent: {
          requestedByUserId: input.auth.userId,
        },
      });
      return {
        metadata: {
          ...next,
          stagedPipeline: {
            ...(next as any).stagedPipeline,
            tasks: Object.fromEntries(
              Object.entries(
                ((next as any).stagedPipeline?.tasks ?? {}) as Record<
                  string,
                  unknown
                >
              ).filter(([key]) => key !== `${input.stage}:${input.shotId}`)
            ),
          },
          stagedSequentialStoryboard: {
            ...next.stagedSequentialStoryboard,
            shots: next.stagedSequentialStoryboard.shots.map(item =>
              item.shotId === input.shotId
                ? {
                    ...item,
                    revision,
                    state:
                      input.stage === "image"
                        ? "image_prompt_awaiting"
                        : "video_prompt_awaiting",
                    ...(input.stage === "image"
                      ? {
                          imageArtifactHash: null,
                          imageArtifactUrl: null,
                          videoPrompt: null,
                          videoPromptHash: null,
                          videoArtifactHash: null,
                          videoArtifactUrl: null,
                        }
                      : {
                          videoArtifactHash: null,
                          videoArtifactUrl: null,
                        }),
                  }
                : item
            ),
            reviewCheckpoints: [
              ...next.stagedSequentialStoryboard.reviewCheckpoints,
              replacement,
            ],
          },
        },
        planRevision: metadata.planReview.planRevision,
      };
    },
  });

  // Every retry auto-approves unconditionally (see the `autoApprove` field
  // doc-comment above), so the follow-up advance is no longer conditional
  // either — wake the run so the newly-approved checkpoint gets dispatched
  // without waiting for the next poll.
  return result;
}

/**
 * Content hash for a manually-uploaded shot media file. `buildProductionStableHash`
 * is a generic deterministic hash of any JSON-serializable value — nothing
 * downstream re-derives or validates it against a provider taskId, only
 * checks equality against what's stored on the corresponding checkpoint —
 * so hashing a manual-upload-shaped payload here (instead of a provider
 * `{taskId, url}` pair, which doesn't exist for a manual upload) makes the
 * resulting checkpoint indistinguishable from an AI-generated one to every
 * downstream reader.
 */
export function buildStagedManualUploadContentHash(input: {
  runId: string;
  shotId: number;
  stage: "image" | "video";
  url: string;
  uploadedAt: string;
}): string {
  return buildProductionStableHash({
    source: "manual_upload",
    runId: input.runId,
    shotId: input.shotId,
    stage: input.stage,
    url: input.url,
    uploadedAt: input.uploadedAt,
  });
}

/**
 * Pure metadata transform for a manual shot-media upload — factored out of
 * `uploadStagedAutoReviewShotMedia` so it's directly unit-testable against
 * plain metadata fixtures without any DB mocking (mirrors this file's
 * existing `buildStagedSingleShotRefreshInputForTest` testability pattern).
 */
export function applyStagedAutoReviewShotMediaUpload(input: {
  metadata: ReturnType<typeof parseStagedMetadata>;
  runId: string;
  shotId: number;
  stage: "image" | "video";
  url: string;
  contentHash: string;
  userId: number;
  operationId: string;
}): {
  metadata: ReturnType<typeof parseStagedMetadata>;
  planRevision: number;
} {
  const {
    metadata,
    runId,
    shotId,
    stage,
    url,
    contentHash,
    userId,
    operationId,
  } = input;
  const shot = metadata.stagedSequentialStoryboard.shots.find(
    item => item.shotId === shotId
  );
  if (!shot)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_invalid_shot_contract",
    });

  const revision = shot.revision + 1;

  // Supersede prior non-superseded checkpoints for this shot. Replacing an
  // image invalidates all shot media derived from it. Replacing a video only
  // supersedes the prior video result; the video prompt is independent of the
  // uploaded file and remains available as the approved prompt draft.
  let next = metadata;
  for (const checkpoint of metadata.stagedSequentialStoryboard
    .reviewCheckpoints) {
    if (
      checkpoint.shotId === shotId &&
      (stage === "image" || checkpoint.kind === "video_result") &&
      checkpoint.state !== "superseded"
    ) {
      next = replaceCheckpointState(
        next,
        checkpoint.checkpointId,
        "superseded"
      );
    }
  }

  // Delete stale in-flight provider task records so a background sweep
  // never lets a dead AI generation task silently overwrite this manual
  // upload once it eventually resolves (reconcileImageProvider /
  // reconcileVideoProvider only act when taskRecord(...)?.taskId is
  // truthy — deleting the key makes the sweep skip straight past). An
  // image replacement drops BOTH the image and video task keys (a new
  // image invalidates any video that was built against the old one); a
  // video replacement drops only the video task key.
  const tasksToDrop =
    stage === "image"
      ? new Set([`image:${shotId}`, `video:${shotId}`])
      : new Set([`video:${shotId}`]);
  const existingTasks = ((next as any).stagedPipeline?.tasks ?? {}) as Record<
    string,
    unknown
  >;

  const checkpointKind = stage === "image" ? "image_result" : "video_result";
  const checkpointIdPrefix =
    stage === "image" ? "image-result" : "video-result";
  const replacement = buildStagedCheckpoint({
    checkpointId: `${checkpointIdPrefix}:${runId}:shot-${shotId}:r${revision}:manual-${operationId}`,
    kind: checkpointKind,
    shotId,
    revision,
    contentHash,
    // Distinct sentinel model/provider values make a manual upload
    // trivially identifiable in checkpoint history/audit views, while
    // `estimatedCredits: 0` + never calling any creditService function
    // ensures this path never spends the user's credits — this is their
    // own media, not platform-generated.
    model: "manual_upload",
    provider: "manual_upload",
    estimatedCredits: 0,
    referenceManifestHash:
      metadata.stagedSequentialStoryboard.referenceManifestHash,
    autoApprove: { userId },
  });

  return {
    metadata: {
      ...next,
      stagedPipeline: {
        ...(next as any).stagedPipeline,
        tasks: Object.fromEntries(
          Object.entries(existingTasks).filter(([key]) => !tasksToDrop.has(key))
        ),
      },
      stagedSequentialStoryboard: {
        ...next.stagedSequentialStoryboard,
        shots: next.stagedSequentialStoryboard.shots.map(item =>
          item.shotId === shotId
            ? {
                ...item,
                revision,
                ...(stage === "image"
                  ? {
                      // Mirrors reconcileImageProvider's post-completion
                      // shot state exactly, so a manually-uploaded image is
                      // indistinguishable from an AI-generated one to
                      // everything downstream. The 4 fields nulled here are
                      // copied precisely from retryStagedAutoReviewShot's
                      // image-retry cascade (imageArtifactHash/Url are
                      // deliberately NOT in this null list — they're set to
                      // the new upload below instead).
                      state: "image_result_approved",
                      imageArtifactHash: contentHash,
                      imageArtifactUrl: url,
                      videoPrompt: null,
                      videoPromptHash: null,
                      videoArtifactHash: null,
                      videoArtifactUrl: null,
                    }
                  : {
                      // Mirrors reconcileVideoProvider's post-completion
                      // shot state exactly — "video_completed" is also what
                      // allShotsHave() gates final assembly on.
                      state: "video_completed",
                      videoArtifactHash: contentHash,
                      videoArtifactUrl: url,
                    }),
              }
            : item
        ),
        reviewCheckpoints: [
          ...next.stagedSequentialStoryboard.reviewCheckpoints,
          replacement,
        ],
      },
    },
    planRevision: metadata.planReview.planRevision,
  };
}

/**
 * Lets a user manually upload a local image or video file to replace a
 * specific shot's image or video slot in the staged auto-review pipeline.
 * The result is indistinguishable from an AI-generated result to every
 * downstream reader (video-prompt compilation and final assembly both read
 * shot.imageArtifactHash/videoArtifactHash directly off the shot record; no
 * code path validates hash provenance) — see
 * `applyStagedAutoReviewShotMediaUpload` for the actual metadata transform.
 *
 * Never charges or reserves any credits: this is the user's own media, not
 * platform-generated. Do not add any creditService import/call to this
 * function or to `applyStagedAutoReviewShotMediaUpload`.
 */
export async function uploadStagedAutoReviewShotMedia(input: {
  runId: string;
  shotId: number;
  stage: "image" | "video";
  url: string;
  expectedStateDigest: string;
  expectedShotRevision?: number;
  expectedPlanRevision?: number;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
}) {
  const uploadedAt = new Date().toISOString();
  const contentHash = buildStagedManualUploadContentHash({
    runId: input.runId,
    shotId: input.shotId,
    stage: input.stage,
    url: input.url,
    uploadedAt,
  });

  const result = await mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    ...(Number.isInteger(input.expectedShotRevision)
      ? {
          allowStateDrift: metadata =>
            metadata.stagedSequentialStoryboard.planRevision ===
              input.expectedPlanRevision &&
            metadata.stagedSequentialStoryboard.shots.find(
              shot => shot.shotId === input.shotId
            )?.revision === input.expectedShotRevision,
        }
      : {}),
    mutate(metadata, operationId) {
      return applyStagedAutoReviewShotMediaUpload({
        metadata,
        runId: input.runId,
        shotId: input.shotId,
        stage: input.stage,
        url: input.url,
        contentHash,
        userId: input.auth.userId,
        operationId,
      });
    },
  });

  // Wake the run so downstream stages continue immediately — same pattern
  // as retryStagedAutoReviewShot's background advance below — instead of
  // waiting for the outbox sweep/poll: a manually-uploaded image should
  // immediately let the run proceed to compiling a video prompt, and a
  // manually-uploaded video should immediately let the run proceed toward
  // final assembly, same as an AI-generated result would.
  return result;
}

export async function retryStagedAutoReviewAudioPlan(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    mutate(metadata) {
      const current =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.kind === "audio_plan" &&
            checkpoint.state !== "superseded"
        );
      const audioPlan = (metadata as any).stagedPipeline?.audioPlan;
      if (!current || !audioPlan) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_audio_plan_unavailable",
        });
      }
      const revision = current.revision + 1;
      const superseded =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.map(checkpoint =>
          checkpoint.checkpointId === current.checkpointId
            ? {
                ...checkpoint,
                state: "superseded" as const,
                rejectionReasonCode: "staged_audio_retry",
              }
            : checkpoint
        );
      const replacement = buildStagedCheckpoint({
        checkpointId: `audio-plan:${input.runId}:r${revision}:retry`,
        kind: "audio_plan",
        revision,
        contentHash: buildProductionStableHash(audioPlan),
        model: current.approvedModel,
        provider: current.approvedProvider,
        estimatedCredits: current.estimatedCredits,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
      });
      return {
        metadata: {
          ...metadata,
          stagedPipeline: {
            ...(metadata as any).stagedPipeline,
            audioUrl: null,
            tasks: Object.fromEntries(
              Object.entries(
                ((metadata as any).stagedPipeline?.tasks ?? {}) as Record<
                  string,
                  unknown
                >
              ).filter(([key]) => key !== "audio:0")
            ),
          },
          stagedSequentialStoryboard: {
            ...metadata.stagedSequentialStoryboard,
            reviewCheckpoints: [...superseded, replacement],
          },
        },
        planRevision: metadata.planReview.planRevision,
      };
    },
  });
}

export function buildStagedApprovalExpectation(input: {
  revision: number;
  contentHash: string;
  model: string;
  provider: string;
  safetyVerdict: string;
  referenceManifestHash: string;
  estimatedCredits: number;
}): StagedCheckpointApprovalExpectationV1 {
  return input;
}

export async function approveStagedAutoReviewCheckpoint(input: {
  runId: string;
  checkpointId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  expected: StagedCheckpointApprovalExpectationV1;
  auth: StagedCheckpointAuth;
}) {
  const result = await mutateOwnedCheckpoint({
    ...input,
    mutation: buildCheckpointApprovalMutation({
      expected: input.expected,
      userId: input.auth.userId,
      approvedAt: new Date().toISOString(),
    }),
    // Reuse the existing worker advance job contract. The outbox worker only
    // claims the architecture-aware advance job family; a separate job type
    // would make a successful approval durable but never wake the run.
    jobType: "advance_run",
  });

  return result;
}

/**
 * Patch ONE shot's cast presence and/or per-shot look overrides
 * (`planning/marketplace-four-character-cast/plan.md` §6).
 *
 * Free and non-destructive: it only touches `castInShot`/`castLooks` on the
 * addressed shot inside `stagedSequentialStoryboard.shots`, leaving every other
 * field (and every other shot) byte-identical. Deliberately does NOT invalidate
 * the shot's prompt/artifact hashes — the user is telling us who is in the
 * frame, and the next prompt compile/dispatch reads these fields through
 * `resolveShotCastSelectionFromMetadata` on its own.
 */
export async function updateStagedAutoReviewShotCast(input: {
  runId: string;
  auth: StagedCheckpointAuth;
  shotId: number;
  castInShot?: string[];
  castLooks?: Record<
    string,
    {
      url: string;
      portraitAssetId?: string;
      vdCharacterId?: string;
      variantLabel?: string;
    }
  >;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const initialRun = await requireOwnedRun(db, input.runId, input.auth);
  const { run, persisted } = await ensureStagedRunMetadata(db, initialRun);
  if (!persisted) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_metadata_initializing",
    });
  }
  const baseRecord = record(run.metadataJson);
  const staged = record(baseRecord.stagedSequentialStoryboard);
  const shots = Array.isArray(staged.shots) ? (staged.shots as Array<any>) : [];
  const shotIndex = shots.findIndex(
    shot => Number(shot?.shotId) === Number(input.shotId)
  );
  if (shotIndex < 0) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `Shot ${input.shotId} not found on run ${input.runId}`,
    });
  }

  const nextShots = shots.map((shot, index) => {
    if (index !== shotIndex) return shot;
    const next = { ...shot };
    if (input.castInShot) next.castInShot = input.castInShot;
    if (input.castLooks) {
      // An empty map CLEARS the overrides, so "switch back to the main look"
      // leaves no stale entry behind.
      if (Object.keys(input.castLooks).length === 0) delete next.castLooks;
      else next.castLooks = input.castLooks;
    }
    return next;
  });

  const nextRunMetadataJson = {
    ...baseRecord,
    stagedSequentialStoryboard: { ...staged, shots: nextShots },
  };

  await db
    .update(marketplaceAutoReviewRuns)
    .set({ metadataJson: nextRunMetadataJson, updatedAt: new Date() })
    .where(eq(marketplaceAutoReviewRuns.id, run.id));

  return { ok: true as const, shotId: input.shotId };
}

export function applyStagedReferenceManifestUpdate(
  baseRecord: Record<string, any>,
  metadata: ReturnType<typeof parseStagedMetadata>,
  updatedManifest: Array<{
    role: string;
    url: string;
    active: boolean;
  }>
) {
  // `castId`s are POSITIONAL over the character entries (`cast-1`..`cast-4`,
  // minted by `deriveStagedCastFromManifest`). So the moment the character
  // roster changes shape — someone added, removed, or reordered — every
  // per-shot `castInShot`/`castLooks` that referenced a position now points at
  // a DIFFERENT person. Dropping that per-shot state is the honest response:
  // stale presence would silently put the wrong character in a frame, and a
  // stale look would dress them in someone else's outfit
  // (`planning/marketplace-four-character-cast/plan.md`).
  const characterIdentity = (items: Array<{ role?: string; url?: string }>) =>
    items
      .filter(item => item.role === "character")
      .map(item => String(item.url ?? ""))
      .join("|");
  const previousManifest = Array.isArray(baseRecord.customReferenceManifest)
    ? (baseRecord.customReferenceManifest as Array<any>)
    : [];
  const rosterChanged =
    characterIdentity(previousManifest) !== characterIdentity(updatedManifest);

  const productReferences = (
    items: Array<{ role?: string; url?: string; active?: boolean }>
  ) =>
    items
      .filter(item => item?.role !== "character" && item?.active !== false)
      .flatMap(item =>
        item?.url?.trim() ? [{ role: item.role, url: item.url.trim() }] : []
      );
  const productReferencesChanged =
    buildProductionStableHash(productReferences(previousManifest)) !==
    buildProductionStableHash(productReferences(updatedManifest));
  const plan = record(baseRecord.stagedPipeline).plan as
    | StagedStoryArcPlan
    | undefined;
  const affectedShots = new Set<number>();
  if (productReferencesChanged) {
    for (const shot of metadata.stagedSequentialStoryboard.shots) {
      const planShot = plan?.shots.find(item => item.shotId === shot.shotId);
      if (
        !plan ||
        !planShot ||
        isStagedProductVisibleInShot(planShot, plan.product.productName)
      ) {
        affectedShots.add(shot.shotId);
      }
    }
  }

  const staged = metadata.stagedSequentialStoryboard;
  return {
    ...baseRecord,
    customReferenceManifest: updatedManifest,
    stagedSequentialStoryboard: {
      ...record(baseRecord.stagedSequentialStoryboard),
      shots: staged.shots.map(shot => {
        const next = { ...shot };
        if (rosterChanged) {
          delete next.castInShot;
          delete next.castLooks;
        }
        if (affectedShots.has(shot.shotId)) {
          next.imagePrompt = null;
          next.imagePromptHash = null;
        }
        return next;
      }),
      reviewCheckpoints: staged.reviewCheckpoints.map(checkpoint =>
        checkpoint.kind === "image_prompt" &&
        checkpoint.shotId !== null &&
        affectedShots.has(checkpoint.shotId) &&
        checkpoint.state !== "superseded"
          ? {
              ...checkpoint,
              state: "superseded",
              rejectionReasonCode: "staged_product_reference_changed",
            }
          : checkpoint
      ),
    },
  };
}

export async function updateStagedAutoReviewReferenceManifest(input: {
  runId: string;
  auth: StagedCheckpointAuth;
  referenceManifest: Array<{
    index: number;
    url: string;
    role: string;
    label?: string;
    active: boolean;
    characterName?: string;
    characterRole?: MarketplaceCharacterCastRole;
    vdCharacterId?: string;
    vdBaseCharacterId?: string;
    variantLabel?: string;
    vdSeriesId?: string;
    portraitAssetId?: string;
    ageRange?: string | null;
    depictsMinor?: boolean;
    descriptor?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Database unavailable",
    });
  }
  const initialRun = await requireOwnedRun(db, input.runId, input.auth);
  const { run, metadata, persisted } = await ensureStagedRunMetadata(
    db,
    initialRun
  );
  if (!persisted) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_metadata_initializing",
    });
  }

  const baseRecord = record(run.metadataJson);
  const updatedManifest = input.referenceManifest.map(item => ({
    index: item.index,
    url: item.url.trim(),
    role: item.role.trim(),
    label: item.label ? String(item.label).trim() : undefined,
    active: item.active,
    characterName: item.characterName
      ? String(item.characterName).trim()
      : undefined,
    characterRole: item.characterRole,
    vdCharacterId: item.vdCharacterId
      ? String(item.vdCharacterId).trim()
      : undefined,
    // Look identity — the family root and the look's own label. Dropping
    // these is what made per-shot look switching impossible before
    // `planning/marketplace-four-character-cast/plan.md` §4.
    vdBaseCharacterId: item.vdBaseCharacterId
      ? String(item.vdBaseCharacterId).trim()
      : undefined,
    variantLabel: item.variantLabel
      ? String(item.variantLabel).trim()
      : undefined,
    vdSeriesId: item.vdSeriesId ? String(item.vdSeriesId).trim() : undefined,
    portraitAssetId: item.portraitAssetId
      ? String(item.portraitAssetId).trim()
      : undefined,
    ageRange:
      item.ageRange === null
        ? null
        : item.ageRange
          ? String(item.ageRange).trim()
          : undefined,
    // Never coerced to a boolean: `undefined` means "not stated", which the
    // guardian/minor-safety resolver must keep treating conservatively.
    depictsMinor:
      typeof item.depictsMinor === "boolean" ? item.depictsMinor : undefined,
    descriptor: item.descriptor ? String(item.descriptor).trim() : undefined,
  }));
  if (updatedManifest.length === 0) {
    throw new Error("STAGED_REFERENCE_MANIFEST_REQUIRED");
  }
  if (updatedManifest.some(item => !item.url || !item.role)) {
    throw new Error("STAGED_REFERENCE_MANIFEST_ENTRY_INVALID");
  }
  if (!updatedManifest.some(item => item.role !== "character" && item.active)) {
    throw new Error("STAGED_ACTIVE_PRODUCT_REFERENCE_REQUIRED");
  }
  if (
    new Set(updatedManifest.map(item => item.index)).size !==
    updatedManifest.length
  ) {
    throw new Error("STAGED_REFERENCE_MANIFEST_INDEX_DUPLICATE");
  }
  const characterCount = updatedManifest.filter(
    item => item.role === "character"
  ).length;
  if (characterCount > MARKETPLACE_CHARACTER_CAST_MAX) {
    throw new Error(
      `MARKETPLACE_CHARACTER_CAST_LIMIT_EXCEEDED:${MARKETPLACE_CHARACTER_CAST_MAX}`
    );
  }

  const urls = await stageMarketplaceInlineImageReferences(
    updatedManifest.map(item => item.url),
    {
      auditContext: {
        source: "marketplace_auto_review_staged",
        tenantId: requireStagedTenantId(input.auth.tenantId, run.tenantId),
        userId: run.userId,
      },
    },
    "managed"
  );
  const nextRunMetadataJson = applyStagedReferenceManifestUpdate(
    baseRecord,
    metadata,
    updatedManifest.map((item, index) => ({
      ...item,
      url: urls?.[index] ?? item.url,
    }))
  );

  const [updated] = await db
    .update(marketplaceAutoReviewRuns)
    .set({
      metadataJson: nextRunMetadataJson,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(marketplaceAutoReviewRuns.id, run.id),
        eq(marketplaceAutoReviewRuns.updatedAt, run.updatedAt)
      )
    )
    .returning({ id: marketplaceAutoReviewRuns.id });
  if (!updated) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }

  return getStagedAutoReviewCheckpointState(input.runId, input.auth);
}

export async function rejectStagedAutoReviewCheckpoint(input: {
  runId: string;
  checkpointId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  reasonCode: string;
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedCheckpoint({
    ...input,
    mutation: { type: "reject", reasonCode: input.reasonCode },
    // A rejection is a durable state transition that may unblock a retry or
    // correction path. Use the same worker-recognized advance job family as
    // approval; an unknown outbox job type would leave the run parked forever.
    jobType: "advance_run",
  });
}

export async function acceptStagedAutoReviewImage(input: {
  runId: string;
  checkpointId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  expected: StagedCheckpointApprovalExpectationV1;
  auth: StagedCheckpointAuth;
}) {
  return approveStagedAutoReviewCheckpoint(input);
}
