import { and, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

import {
  readStagedFinalRenderSettings,
  type StagedFinalRenderSettings,
} from "./marketplaceAutoReviewStagedRemotionRender";

import { getDb } from "../db";
import {
  marketplaceAutoReviewOutboxJobs,
  marketplaceAutoReviewRuns,
  workerJobs,
} from "../../drizzle/schema";
import {
  StagedSequentialStoryboardMetadataV1Schema,
  type StagedCheckpointApprovalExpectationV1,
} from "@shared/marketplaceAutoReview/stagedContracts";
import { buildProductionStableHash } from "../../shared/mediaProduction";
import { deriveAssemblyDocumentationFromProductTruth } from "../../shared/marketplaceCapture/sequentialEvidencePreview";
import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
  generateStagedStoryArcPlanWithLLM,
  type StagedStoryArcPlan,
} from "./marketplaceAutoReviewStoryArcPlanner";
import {
  buildCheckpointApprovalMutation,
  mutateStagedCheckpointMetadata,
  projectStagedCheckpoints,
  stagedMetadataStateDigest,
} from "./marketplaceAutoReviewStagedCheckpointOperations";
import {
  buildStagedImagePromptContentHash,
  buildStagedVideoPromptContentHash,
} from "./marketplaceAutoReviewStagedPromptCompiler";
import {
  PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
  refreshSequentialShotPromptWithSkill,
  type SequentialStoryboardLanguage,
  type SequentialReferenceManifestEntry,
} from "./productReviewSequentialStoryboardSkillRunner";
import {
  buildStagedAudioPlan,
  buildStagedFinalAssemblyHash,
} from "./marketplaceAutoReviewStagedAudioAssembly";
import type { MarketplaceCharacterCastRole } from "../../shared/hyperframes/characterCast";
import {
  buildStagedOperationEnvelope,
} from "./marketplaceAutoReviewStagedCheckpointService";
import {
  initializeStagedMarketplaceAutoReviewRun,
  planAndMetadataFromRun,
  modelCost,
  modelProvider,
  resolveShotCastSelectionFromMetadata,
} from "./marketplaceAutoReviewStagedPipelineService";
import { buildShotOrderedReferenceItems } from "../../shared/marketplaceAutoReview/shotCast";

export type StagedCheckpointAuth = { userId: number; tenantId?: string };
export type StagedCheckpointRuntime = { publicUrl?: string | null };

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

function tenantAccessClause(auth: StagedCheckpointAuth) {
  const tenantId = auth.tenantId?.trim();
  if (!tenantId) return undefined;
  return or(
    eq(marketplaceAutoReviewRuns.tenantId, tenantId),
    isNull(marketplaceAutoReviewRuns.tenantId)
  );
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
  const fallback = planAndMetadataFromRun(run).metadata;
  const fallbackParsed = StagedSequentialStoryboardMetadataV1Schema.safeParse(
    fallback
  );
  if (fallbackParsed.success) {
    return fallbackParsed.data;
  }
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Staged checkpoint state is unavailable for this run",
  });
}

async function ensureStagedRunMetadata(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  run: StagedCheckpointRun
): Promise<{
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
}> {
  const parsed = StagedSequentialStoryboardMetadataV1Schema.safeParse(
    run.metadataJson
  );
  if (parsed.success) {
    return { run, metadata: parsed.data };
  }
  try {
    const initializedRun = await initializeStagedMarketplaceAutoReviewRun({
      db,
      run,
    });
    const reParsed = StagedSequentialStoryboardMetadataV1Schema.safeParse(
      initializedRun.metadataJson
    );
    if (reParsed.success) {
      return { run: initializedRun, metadata: reParsed.data };
    }
  } catch (err) {
    // If DB initialization encounters a race or constraint, fall back gracefully to synthesized metadata
  }
  const fallbackMetadata = parseStagedMetadata(run);
  return { run, metadata: fallbackMetadata };
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

function operationFromPayload(value: unknown, fallback: StagedCheckpointRun) {
  const payload =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const operation = payload.operation;
  if (operation && typeof operation === "object") {
    return operation as ReturnType<typeof buildStagedOperationEnvelope>;
  }
  return buildStagedOperationEnvelope({
    operationId: fallback.id,
    runId: fallback.id,
    stateDigest: stagedMetadataStateDigest(parseStagedMetadata(fallback)),
    planRevision:
      parseStagedMetadata(fallback).stagedSequentialStoryboard.planRevision,
  });
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
  let { run, metadata } = await ensureStagedRunMetadata(db, initialRun);

  // Advance automatically on query whenever there is durable work waiting:
  // story plan approved but image prompts not compiled yet (e.g. outbox
  // delay), or any shot has a media task in flight that hasn't been
  // reconciled into an artifact hash yet. Reconciliation itself happens only
  // through the canonical path (reconcileImageProvider/reconcileVideoProvider
  // in the pipeline service) so there is exactly one hash formula for a
  // completed task, instead of the inline copy that used to live here
  // computing a different hash for the same task and racing the canonical
  // path's `db.update()` with no optimistic-concurrency check of its own.
  const currentStoryCp = metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
    c => c.kind === "story_plan" && c.state !== "superseded"
  );
  const baseRecord = record(run.metadataJson);
  const pipelineTasksForTrigger = record(record(baseRecord.stagedPipeline).tasks);
  const hasOutstandingStagedMediaTask = metadata.stagedSequentialStoryboard.shots.some(shot => {
    const imgTask = record(pipelineTasksForTrigger[`image:${shot.shotId}`]);
    if (
      imgTask.taskId &&
      imgTask.status !== "completed" &&
      imgTask.status !== "failed" &&
      !shot.imageArtifactHash
    ) {
      return true;
    }
    const vidTask = record(pipelineTasksForTrigger[`video:${shot.shotId}`]);
    return Boolean(
      vidTask.taskId &&
        vidTask.status !== "completed" &&
        vidTask.status !== "failed" &&
        !shot.videoArtifactHash
    );
  });
  if (
    ((currentStoryCp?.state === "approved" || baseRecord.planReview?.status === "approved") &&
      !metadata.stagedSequentialStoryboard.reviewCheckpoints.some(c => c.kind === "image_prompt")) ||
    hasOutstandingStagedMediaTask
  ) {
    const { advanceMarketplaceAutoReviewRun } = await import(
      "./marketplaceAutoReviewService"
    );
    void advanceMarketplaceAutoReviewRun(
      runId,
      { userId: auth.userId, tenantId: auth.tenantId ?? undefined },
      { userToken: "internal" }
    ).catch((err) => {
      console.warn("[getStagedAutoReviewCheckpointState] Auto-advance warning:", err);
    });
  }

  const base = record(run.metadataJson);
  const anchors = record(base.referenceAnchors);
  const reviewTone =
    typeof anchors.reviewTone === "string"
      ? anchors.reviewTone
      : typeof base.reviewTone === "string"
      ? base.reviewTone
      : null;
  const storytellingStructure =
    typeof anchors.storytellingStructure === "string"
      ? anchors.storytellingStructure
      : typeof base.storytellingStructure === "string"
      ? base.storytellingStructure
      : null;
  const languagePlan = record(
    record((metadata as Record<string, any>).sequentialStoryboard).languagePlan
  );
  const stagedPipeline =
    run.metadataJson && typeof run.metadataJson === "object"
      ? (run.metadataJson as Record<string, any>).stagedPipeline
      : null;
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
    return {
      shotId: shot.shotId,
      state: shot.state,
      storySummary: shot.storySummary,
      dialogue: shot.dialogue,
      title: detail.title ?? null,
      visualSummary: detail.visualSummary ?? null,
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
    };
  });
  const customManifest = Array.isArray(base.customReferenceManifest)
    ? base.customReferenceManifest
    : Array.isArray(metadata.stagedSequentialStoryboard?.referenceManifest)
    ? metadata.stagedSequentialStoryboard.referenceManifest
    : [];

  const rawProductImages = Array.isArray(stagedPipeline?.plan?.product?.imageUrls)
    ? stagedPipeline.plan.product.imageUrls
    : Array.isArray(base.productImageUrls)
    ? base.productImageUrls
    : [];

  const referenceManifest = customManifest.length > 0
    ? customManifest.map((entry: any, i: number) => ({
        index: entry.index ?? i + 1,
        url: String(entry.url || "").trim(),
        role: String(entry.role || "product").trim(),
        label: entry.label ? String(entry.label).trim() : undefined,
        active: entry.active !== false,
        // Gap fix (flexible-shots/creation-casting audit 2026-07-30): these
        // per-character fields were persisted (both by creation-time seeding
        // and by updateStagedAutoReviewReferenceManifest) but STRIPPED here
        // on read — so the panel lost the VD read-only name lock and, worse,
        // any panel manifest edit round-tripped the stripped entries back
        // through the update mutation, silently destroying characterRole /
        // vdCharacterId metadata on the persisted manifest.
        characterName: entry.characterName
          ? String(entry.characterName).trim()
          : undefined,
        characterRole:
          entry.characterRole === "host" || entry.characterRole === "guest"
            ? entry.characterRole
            : undefined,
        vdCharacterId: entry.vdCharacterId
          ? String(entry.vdCharacterId).trim()
          : undefined,
        vdSeriesId: entry.vdSeriesId
          ? String(entry.vdSeriesId).trim()
          : undefined,
        portraitAssetId: entry.portraitAssetId
          ? String(entry.portraitAssetId).trim()
          : undefined,
        ageRange:
          entry.ageRange === null
            ? null
            : entry.ageRange
            ? String(entry.ageRange).trim()
            : undefined,
      })).filter((entry: any) => entry.url)
    : rawProductImages.map((url: string, i: number) => ({
        index: i + 1,
        url: String(url).trim(),
        role: i === 0 ? "primary_product" : "product_angle",
        label: i === 0 ? "ภาพสินค้าหลัก" : `มุมมองสินค้าที่ ${i + 1}`,
        // Default to only the hero image so a fresh, uncustomized run
        // doesn't send every product angle shot to the image model —
        // the user opts additional angles in (or opts the hero out)
        // explicitly via the checkboxes.
        active: i === 0,
      })).filter((entry: any) => entry.url);

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
    languagePlan: {
      summaryLanguage: languagePlan.summaryLanguage === "en" ? "en" : "th",
      dialogueLanguage: languagePlan.dialogueLanguage === "en" ? "en" : "th",
      promptLanguage: languagePlan.promptLanguage === "th" ? "th" : "en",
    },
    planRevision: metadata.stagedSequentialStoryboard.planRevision,
    stateDigest: stagedMetadataStateDigest(metadata),
    planReview: metadata.planReview,
    audioPlan:
      stagedPipeline?.audioPlan && typeof stagedPipeline.audioPlan === "object"
        ? {
            text:
              typeof stagedPipeline.audioPlan.text === "string"
                ? stagedPipeline.audioPlan.text.slice(0, 4000)
                : "",
            language:
              typeof stagedPipeline.audioPlan.language === "string"
                ? stagedPipeline.audioPlan.language
                : "th",
            model:
              typeof stagedPipeline.audioPlan.model === "string"
                ? stagedPipeline.audioPlan.model
                : null,
            provider:
              typeof stagedPipeline.audioPlan.provider === "string"
                ? stagedPipeline.audioPlan.provider
                : null,
            estimatedCredits: Number.isFinite(
              Number(stagedPipeline.audioPlan.estimatedCredits)
            )
              ? Number(stagedPipeline.audioPlan.estimatedCredits)
              : 0,
          }
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
        stagedTextOrEmpty((metadata as Record<string, any>).renderEngine) || null,
      jobId:
        stagedTextOrEmpty((metadata as Record<string, any>).renderJobId) || null,
      submittedAt:
        Number((metadata as Record<string, any>).renderSubmittedAt) || null,
      // `renderUrl` is what `buildRenderFinalizationMetadata` writes when a
      // render completes (both the Remotion queue path and the legacy one);
      // the other two are older/alternate spellings kept as fallbacks so a
      // run finalized by an earlier build still shows its video.
      outputUrl:
        stagedTextOrEmpty((metadata as Record<string, any>).renderUrl) ||
        stagedTextOrEmpty((metadata as Record<string, any>).renderOutputUrl) ||
        stagedTextOrEmpty((metadata as Record<string, any>).finalVideoUrl) ||
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
        typeof (metadata as Record<string, any>).renderArtifactProbe === "object"
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
                  (metadata as Record<string, any>).renderArtifactProbe.sizeBytes
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
    shots: stagedShots,
    checkpoints: projectStagedCheckpoints(
      metadata.stagedSequentialStoryboard.reviewCheckpoints
    ),
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
    const metadata = parseStagedMetadata(run);
    const [existingJob] = await tx
      .select()
      .from(marketplaceAutoReviewOutboxJobs)
      .where(
        eq(marketplaceAutoReviewOutboxJobs.idempotencyKey, input.idempotencyKey)
      )
      .limit(1);
    if (existingJob) {
      return {
        runId: run.id,
        operation: operationFromPayload(existingJob.payloadJson, run),
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
    await tx.insert(marketplaceAutoReviewOutboxJobs).values({
      id: operationId,
      runId: run.id,
      tenantId: input.auth.tenantId ?? run.tenantId ?? null,
      userId: input.auth.userId,
      jobType: input.jobType,
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      priority: 40,
      attempts: 0,
      maxAttempts: 3,
      payloadJson: {
        operation,
        checkpointId: input.checkpointId,
        planningArchitecture: "staged_two_skill_v2",
      },
      updatedAt: now,
    } as any);
    const res = { runId: run.id, operation, status: "queued" as const };
    try {
      const { queueMarketplaceAutoReviewAdvance } = await import(
        "./marketplaceAutoReviewService"
      );
      queueMarketplaceAutoReviewAdvance(
        run.id,
        { userId: input.auth.userId, tenantId: input.auth.tenantId ?? undefined },
        { userToken: "internal" },
        100
      );
    } catch {
      // Background advance queueing fallback
    }
    return res;
  });
}

async function mutateOwnedStagedMetadata(input: {
  runId: string;
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
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
    assertStagedRunMutable(run);
    const existingMetadata = parseStagedMetadata(run);
    const [existingJob] = await tx
      .select()
      .from(marketplaceAutoReviewOutboxJobs)
      .where(
        eq(marketplaceAutoReviewOutboxJobs.idempotencyKey, input.idempotencyKey)
      )
      .limit(1);
    if (existingJob) {
      return {
        runId: run.id,
        operation: operationFromPayload(existingJob.payloadJson, run),
        status: existingJob.status,
      };
    }
    if (
      stagedMetadataStateDigest(existingMetadata) !== input.expectedStateDigest
    ) {
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    }
    const operationId = `staged-op-${nanoid(12)}`;
    const changed = await input.mutate(existingMetadata, operationId);
    const metadata = {
      ...changed.metadata,
      stagedPipeline: {
        ...((changed.metadata as any).stagedPipeline ?? {}),
        correctionRequired: null,
      },
      planReview: {
        ...changed.metadata.planReview,
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
    const [updated] = await tx
      .update(marketplaceAutoReviewRuns)
      .set({ metadataJson: metadata as Record<string, any>, updatedAt: now })
      .where(
        and(
          eq(marketplaceAutoReviewRuns.id, run.id),
          eq(marketplaceAutoReviewRuns.updatedAt, run.updatedAt)
        )
      )
      .returning({ id: marketplaceAutoReviewRuns.id });
    if (!updated)
      throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
    await tx.insert(marketplaceAutoReviewOutboxJobs).values({
      id: operationId,
      runId: run.id,
      tenantId: input.auth.tenantId ?? run.tenantId ?? null,
      userId: input.auth.userId,
      jobType: "advance_run",
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      priority: 40,
      attempts: 0,
      maxAttempts: 3,
      payloadJson: { operation, planningArchitecture: "staged_two_skill_v2" },
      updatedAt: now,
    } as any);
    return { runId: run.id, operation, status: "queued" as const };
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
  dialogue?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  auth: StagedCheckpointAuth;
}) {
  if (
    ![
      input.storySummary,
      input.dialogue,
      input.imagePrompt,
      input.videoPrompt,
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
    mutate(metadata, operationId) {
      const storyEdit =
        input.storySummary !== undefined || input.dialogue !== undefined;
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
          model: "story-arc",
          provider: "internal-bounded",
          estimatedCredits: 0,
          referenceManifestHash:
            metadata.stagedSequentialStoryboard.referenceManifestHash,
        });
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
              ...((metadata as any).stagedPipeline ?? {}),
              plan: nextPlan,
              planView: buildStagedPlanView(nextPlan),
              tasks: {},
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
                revision,
                state: "story_awaiting" as const,
                imagePrompt: null,
                imagePromptHash: null,
                imageArtifactHash: null,
                imageArtifactUrl: null,
                videoPrompt: null,
                videoPromptHash: null,
                videoArtifactHash: null,
                videoArtifactUrl: null,
              })),
              reviewCheckpoints: [replacement],
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

      if (storyEdit) {
        const revision = metadata.planReview.planRevision + 1;
        const nextShot = {
          ...shot,
          revision,
          storySummary: input.storySummary ?? shot.storySummary,
          dialogue: input.dialogue ?? shot.dialogue,
          state: "story_awaiting",
          imagePrompt: null,
          imagePromptHash: null,
          imageArtifactHash: null,
          imageArtifactUrl: null,
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
          shots: plan.shots.map((item: any) =>
            item.shotId === input.shotId
              ? {
                  ...item,
                  storySummary: nextShot.storySummary,
                  dialogue: nextShot.dialogue,
                }
              : item
          ),
        };
        nextPlan.storyPlanHash = buildProductionStableHash(nextPlan);
        const replacement = buildStagedCheckpoint({
          checkpointId: `story-plan:${input.runId}:r${revision}:shot-${input.shotId}:op-${operationId}`,
          kind: "story_plan",
          revision,
          contentHash: nextPlan.storyPlanHash,
          model: "story-arc",
          provider: "internal-bounded",
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
              if (checkpoint.shotId === input.shotId) return false;
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
              shots: nextShots,
              reviewCheckpoints: checkpoints,
            },
          },
          planRevision: revision,
        };
      }

      const kind =
        input.imagePrompt !== undefined ? "image_prompt" : "video_prompt";
      const currentPromptCheckpoint =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.shotId === input.shotId &&
            checkpoint.kind === kind &&
            checkpoint.state !== "superseded"
        );
      if (
        !currentPromptCheckpoint ||
        !isStagedCheckpointEditable(currentPromptCheckpoint)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "checkpoint_not_editable",
        });
      }
      const revision = shot.revision + 1;
      const content = (input.imagePrompt ?? input.videoPrompt ?? "").trim();
      const imagePrompt = input.imagePrompt !== undefined;
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
              referenceManifestHash:
                metadata.stagedSequentialStoryboard.referenceManifestHash ??
                "none",
            })
          : buildStagedVideoPromptContentHash({
              revision,
              shotId: input.shotId,
              prompt: content,
              imageArtifactHash: shot.imageArtifactHash ?? "",
            }),
        model: currentPromptCheckpoint.approvedModel ?? "internal",
        provider: currentPromptCheckpoint.approvedProvider ?? "internal",
        estimatedCredits: currentPromptCheckpoint.estimatedCredits ?? 0,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
      });
      const checkpoints =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
          checkpoint => {
            const invalidatedByEdit = imagePrompt
              ? checkpoint.shotId === input.shotId
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
              imageArtifactHash: null,
              imageArtifactUrl: null,
              videoPrompt: null,
              videoPromptHash: null,
              videoArtifactHash: null,
              videoArtifactUrl: null,
              state: "image_prompt_awaiting",
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
            ? key !== `image:${input.shotId}` && key !== `video:${input.shotId}`
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
  const base = publicUrl?.trim() || process.env.NODE_BASE_URL?.trim();
  if (!base) return "";
  try {
    return new URL(value, `${base.replace(/\/+$/, "")}/`).toString();
  } catch {
    return "";
  }
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
    | StagedStoryArcPlan
    | undefined;
  const planShot = plan?.shots.find(item => item.shotId === input.shotId);
  if (!shot || !plan || !planShot) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_invalid_shot_contract",
    });
  }
  const productImages = Array.isArray(plan.product?.imageUrls)
    ? plan.product.imageUrls.map(value => String(value).trim()).filter(Boolean)
    : [];
  const customManifest = Array.isArray((input.metadata as any).customReferenceManifest)
    ? (input.metadata as any).customReferenceManifest
    : Array.isArray((input.metadata as any).stagedSequentialStoryboard?.referenceManifest)
    ? (input.metadata as any).stagedSequentialStoryboard.referenceManifest
    : [];

  // Per-shot cast + look overrides, resolved by the SAME helper the dispatch
  // path uses so the `@ImageN` tags the skill authors always address the
  // images that shot actually receives
  // (`planning/marketplace-four-character-cast/plan.md` §5).
  const shotCastSelection = resolveShotCastSelectionFromMetadata({
    metadata: input.metadata as Record<string, any>,
    plan,
    shotId: input.shotId,
  });
  const activeManifestItems = customManifest.filter(
    (item: any) =>
      item && typeof item.url === "string" && item.url.trim() && item.active !== false
  );
  const shotOrderedManifestItems =
    activeManifestItems.length > 0
      ? buildShotOrderedReferenceItems({
          productItems: activeManifestItems.filter((item: any) => item.role !== "character"),
          characterItems: activeManifestItems.filter((item: any) => item.role === "character"),
          castInShot: shotCastSelection.castInShot,
          castLooks: shotCastSelection.castLooks,
        }).ordered
      : [];

  const baseReferenceManifest: SequentialReferenceManifestEntry[] =
    shotOrderedManifestItems.length > 0
      ? shotOrderedManifestItems.map((item: any, idx: number) => ({
          index: idx + 1,
          role: item.role || "product",
          url: String(item.url).trim(),
          angleLabel: item.label || undefined,
          evidenceOnly: false,
          // Cast identity — the skill previously received `role`/`angleLabel`
          // only, so with more than one character it had no way to know WHO
          // `@Image2..@Image5` were. These are FACTS (who is in the frame),
          // never creative direction.
          characterName: item.characterName || undefined,
          characterRole: item.characterRole || undefined,
          variantLabel: item.variantLabel || undefined,
          depictsMinor:
            typeof item.depictsMinor === "boolean" ? item.depictsMinor : undefined,
        }))
      : productImages.slice(0, 1).map((url, index) => ({
          index: index + 1,
          role: index === 0 ? "product" : "product_angle",
          url,
          evidenceOnly: false,
        }));
  // Video-prompt generation must SEE the shot's own already-approved image
  // (the actual rendered start frame), not just the pre-generation reference
  // manifest — see doc comment on `stage` above. Appended as its own manifest
  // entry (never merged into `baseReferenceManifest`) so its role is
  // unambiguous to the skill and its index never displaces the product/
  // character reference indices the skill already relies on.
  const approvedShotImageUrl =
    input.stage === "video" ? (safeArtifactUrl(shot.imageArtifactUrl) ?? "") : "";
  const referenceManifest: SequentialReferenceManifestEntry[] = approvedShotImageUrl
    ? [
        ...baseReferenceManifest,
        {
          index: baseReferenceManifest.length + 1,
          role: "approved_shot_image",
          url: approvedShotImageUrl,
          evidenceOnly: false,
        },
      ]
    : baseReferenceManifest;
  const skillVisionUrls = referenceManifest
    .map(entry => stagedAbsoluteReferenceUrl(entry.url, input.publicUrl))
    .filter(Boolean);
  const productTruth = record((input.metadata as any).productTruth);
  const languagePlan = record(
    record((input.metadata as Record<string, any>).sequentialStoryboard)
      .languagePlan
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
  const guardianReferenceIndex =
    (
      characterManifestEntries.find(
        entry => (entry as any).depictsMinor !== true
      ) ?? characterManifestEntries[0]
    )?.index ?? null;
  const assemblyDocumented = deriveAssemblyDocumentationFromProductTruth({
    productName: plan.product.productName,
    description: plan.product.description || "",
    specs: {},
  }).documented;
  const guardianPresenceDirective = buildStagedGuardianPresenceDirective({
    productChildRelated: false,
    guardianReferenceIndex,
  });
  const demonstrationEvidenceDirective =
    buildStagedDemonstrationEvidenceDirective({ assemblyDocumented });
  const userInstruction = (input.instruction ?? "").trim() || null;
  return {
    tenantId: input.tenantId || input.run.tenantId || "",
    userId: input.run.userId,
    runId: input.run.id,
    publicUrl: input.publicUrl,
    originSurface: "marketplace_capture" as const,
    targetShotId: input.shotId,
    imageBudget: PRODUCT_REVIEW_SEQUENTIAL_STORYBOARD_IMAGE_PROMPT_MAX_CHARS,
    referenceManifest,
    skillVisionUrls,
    globalContinuity: {},
    shotContract: {
      purpose: planShot.title,
      story_summary: planShot.storySummary,
      dialogue: planShot.dialogue,
      duration_seconds: planShot.durationSeconds,
      demonstration_type: classifyStagedDemonstrationType(planShot.dialogue),
      depicts_minor: false,
      guardian_required: false,
      visual_summary: planShot.visualSummary,
    },
    previousShotVisualSummary: previousShot?.visualSummary ?? null,
    nextShotVisualSummary: nextShot?.visualSummary ?? null,
    childSubjectPolicy: {
      productChildRelated: false,
      childDepictionPlanned: false,
      guardianReferenceIndex: null,
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
    summaryLanguage: (languagePlan.summaryLanguage === "en" ? "en" : "th") as SequentialStoryboardLanguage,
    dialogueLanguage: (languagePlan.dialogueLanguage === "en" ? "en" : "th") as SequentialStoryboardLanguage,
    promptLanguage: (languagePlan.promptLanguage === "th" ? "th" : "en") as SequentialStoryboardLanguage,
  };
}

/** Test-only wrapper (repo `...ForTest` convention). */
export function buildStagedSingleShotRefreshInputForTest(input: {
  run: StagedCheckpointRun;
  metadata: ReturnType<typeof parseStagedMetadata>;
  shotId: number;
  publicUrl?: string | null;
  tenantId?: string;
  instruction?: string | null;
  stage?: "image" | "video";
}) {
  return buildStagedSingleShotRefreshInput(input);
}

/**
 * Generates one shot prompt through the existing single-shot skill seam.
 * This operation never submits an image/video task or queues provider spend;
 * only the later checkpoint approval can unlock media generation.
 */
export async function generateStagedAutoReviewShotPrompt(input: {
  runId: string;
  shotId: number;
  stage: "image" | "video";
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
  runtime?: StagedCheckpointRuntime;
  /** New capability — optional free-text per-shot instruction for
   *  AI-assisted prompt adjustment (e.g. "there's an 8-month-old baby in
   *  the scene"). Threaded through to the skill call as a distinct,
   *  clearly-delimited section; never merged into the base story/dialogue
   *  content. */
  instruction?: string;
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
  const metadata = parseStagedMetadata(run);
  if (stagedMetadataStateDigest(metadata) !== input.expectedStateDigest) {
    throw new TRPCError({ code: "CONFLICT", message: "staged_state_drift" });
  }
  const shot = metadata.stagedSequentialStoryboard.shots.find(
    item => item.shotId === input.shotId
  );
  const checkpoint = metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
    item =>
      item.shotId === input.shotId &&
      item.kind ===
        (input.stage === "image" ? "image_prompt" : "video_prompt") &&
      item.state !== "superseded"
  );
  if (!shot || !checkpoint || !isStagedCheckpointEditable(checkpoint)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "checkpoint_not_editable",
    });
  }
  const taskKeys =
    input.stage === "image"
      ? [`image:${input.shotId}`, `video:${input.shotId}`]
      : [`video:${input.shotId}`];
  const stagedPipeline = record((metadata as any).stagedPipeline);
  const mediaTaskInFlight = taskKeys.some(taskKey =>
    ["pending", "processing", "submitted"].includes(
      stagedTaskStatus(stagedPipeline, taskKey) ?? ""
    )
  );
  if (mediaTaskInFlight) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "staged_media_task_in_flight",
    });
  }
  if (input.stage === "video" && !shot.imageArtifactHash) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_image_artifact_missing",
    });
  }
  if (input.stage === "video") {
    const imageResultCheckpoint =
      metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
        item =>
          item.shotId === input.shotId &&
          item.kind === "image_result" &&
          item.state !== "superseded"
      );
    if (imageResultCheckpoint?.state !== "approved") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "staged_image_result_not_approved",
      });
    }
  }

  const [existingJob] = await db
    .select()
    .from(marketplaceAutoReviewOutboxJobs)
    .where(
      eq(marketplaceAutoReviewOutboxJobs.idempotencyKey, input.idempotencyKey)
    )
    .limit(1);
  if (existingJob) {
    return {
      runId: run.id,
      operation: operationFromPayload(existingJob.payloadJson, run),
      status: existingJob.status,
    };
  }

  const refresh = await refreshSequentialShotPromptWithSkill(
    buildStagedSingleShotRefreshInput({
      run,
      metadata,
      shotId: input.shotId,
      publicUrl: input.runtime?.publicUrl,
      tenantId: input.auth.tenantId,
      instruction: input.instruction,
      stage: input.stage,
    })
  );
  const generatedPrompt =
    input.stage === "image"
      ? refresh.startFrameImagePrompt.trim()
      : String(refresh.videoPrompt ?? "").trim();
  if (!generatedPrompt) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_prompt_generation_empty",
    });
  }

  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    mutate(current, operationId) {
      const currentShot = current.stagedSequentialStoryboard.shots.find(
        item => item.shotId === input.shotId
      );
      const currentCheckpoint =
        current.stagedSequentialStoryboard.reviewCheckpoints.find(
          item =>
            item.shotId === input.shotId &&
            item.kind ===
              (input.stage === "image" ? "image_prompt" : "video_prompt") &&
            item.state !== "superseded"
        );
      if (
        !currentShot ||
        !currentCheckpoint ||
        !isStagedCheckpointEditable(currentCheckpoint)
      ) {
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
            prompt: generatedPrompt,
            referenceManifestHash:
              current.stagedSequentialStoryboard.referenceManifestHash ??
              "none",
          })
        : buildStagedVideoPromptContentHash({
            revision,
            shotId: input.shotId,
            prompt: generatedPrompt,
            imageArtifactHash: currentShot.imageArtifactHash ?? "",
          });
      const replacement = buildStagedCheckpoint({
        checkpointId: `${imagePrompt ? "image_prompt" : "video_prompt"}:${input.runId}:shot-${input.shotId}:r${revision}:generate-${operationId}`,
        kind: imagePrompt ? "image_prompt" : "video_prompt",
        shotId: input.shotId,
        revision,
        contentHash,
        model: currentCheckpoint.approvedModel ?? "internal",
        provider: currentCheckpoint.approvedProvider ?? "internal",
        estimatedCredits: currentCheckpoint.estimatedCredits ?? 0,
        referenceManifestHash:
          current.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
      });
      const invalidated =
        current.stagedSequentialStoryboard.reviewCheckpoints.map(item => {
          const invalidatedByImage =
            imagePrompt &&
            item.shotId === input.shotId &&
            [
              "image_prompt",
              "image_result",
              "video_prompt",
              "video_result",
            ].includes(item.kind);
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
      const tasks = Object.fromEntries(
        Object.entries(
          ((current as any).stagedPipeline?.tasks ?? {}) as Record<
            string,
            unknown
          >
        ).filter(([key]) =>
          imagePrompt
            ? key !== `image:${input.shotId}` && key !== `video:${input.shotId}`
            : key !== `video:${input.shotId}`
        )
      );
      const nextShot = {
        ...currentShot,
        revision,
        ...(imagePrompt
          ? {
              imagePrompt: generatedPrompt,
              imagePromptHash: contentHash,
              imageArtifactHash: null,
              imageArtifactUrl: null,
              videoPrompt: null,
              videoPromptHash: null,
              videoArtifactHash: null,
              videoArtifactUrl: null,
              state: "image_prompt_awaiting",
            }
          : {
              videoPrompt: generatedPrompt,
              videoPromptHash: contentHash,
              videoArtifactHash: null,
              videoArtifactUrl: null,
              state: "video_prompt_awaiting",
            }),
      };
      return {
        metadata: {
          ...current,
          stagedPipeline: {
            ...((current as any).stagedPipeline ?? {}),
            tasks,
            finalAssembly: null,
            promptGeneration: {
              ...record((current as any).stagedPipeline?.promptGeneration),
              [`${input.stage}:${input.shotId}`]: {
                generatedAt: new Date().toISOString(),
                operationId,
                source: "product-review-sequential-storyboard-skill",
              },
            },
          },
          stagedSequentialStoryboard: {
            ...current.stagedSequentialStoryboard,
            shots: current.stagedSequentialStoryboard.shots.map(item =>
              item.shotId === input.shotId ? nextShot : item
            ),
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
      const nextPlan = buildStagedAudioPlan({
        text: input.text.trim().slice(0, 4000),
        language: (input.language ?? currentPlan.language ?? "th")
          .trim()
          .slice(0, 12),
        model: String(
          currentPlan.model ?? current.approvedModel ?? "elevenlabs-tts"
        ),
        provider: String(
          currentPlan.provider ?? current.approvedProvider ?? "media-provider"
        ),
        estimatedCredits: Number(
          currentPlan.estimatedCredits ?? current.estimatedCredits ?? 0
        ),
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
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    async mutate(metadata) {
      const current = ((metadata as any).stagedPipeline?.plan ??
        null) as Record<string, any> | null;
      if (!current || current.state === "superseded") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "checkpoint_not_awaiting",
        });
      }
      const redraftCount = Number(metadata.planReview.redraftCount) || 0;
      if (redraftCount >= 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_redraft_limit_reached",
        });
      }
      const anchors = record((metadata as Record<string, any>).referenceAnchors);
      const reviewTone =
        typeof anchors.reviewTone === "string"
          ? anchors.reviewTone
          : typeof (metadata as Record<string, any>).reviewTone === "string"
          ? (metadata as Record<string, any>).reviewTone
          : undefined;
      const storytellingStructure =
        typeof anchors.storytellingStructure === "string"
          ? anchors.storytellingStructure
          : typeof (metadata as Record<string, any>).storytellingStructure === "string"
          ? (metadata as Record<string, any>).storytellingStructure
          : undefined;
      const nextPlan = await generateStagedStoryArcPlanWithLLM({
        runId: input.runId,
        userId: input.auth.userId,
        tenantId: input.auth.tenantId ?? "system",
        product: current.product,
        referenceManifestHash: current.referenceManifestHash,
        revision: metadata.planReview.planRevision + 1,
        reviewTone,
        storytellingStructure,
        model: input.model,
        languagePlan: {
          summaryLanguage:
            record(
              record((metadata as Record<string, any>).sequentialStoryboard)
                .languagePlan
            ).summaryLanguage === "en"
              ? "en"
              : "th",
          dialogueLanguage:
            record(
              record((metadata as Record<string, any>).sequentialStoryboard)
                .languagePlan
            ).dialogueLanguage === "en"
              ? "en"
              : "th",
          promptLanguage:
            record(
              record((metadata as Record<string, any>).sequentialStoryboard)
                .languagePlan
            ).promptLanguage === "th"
              ? "th"
              : "en",
        },
        previousStorySummary: input.notes?.trim()
          ? input.notes.trim().slice(0, 500)
          : null,
      });
      const storyCheckpoint = buildStagedCheckpoint({
        checkpointId: `story-plan:${input.runId}:r${nextPlan.planRevision}:redraft`,
        kind: "story_plan",
        revision: nextPlan.planRevision,
        contentHash: nextPlan.storyPlanHash,
        model: "story-arc",
        provider: "internal-bounded",
        estimatedCredits: 0,
        referenceManifestHash: nextPlan.referenceManifestHash,
      });
      return {
        metadata: {
          ...metadata,
          planReview: {
            ...metadata.planReview,
            status: "awaiting" as const,
            planRevision: nextPlan.planRevision,
            approvedRevision: null,
            redraftCount: redraftCount + 1,
          },
          stagedPipeline: {
            ...((metadata as any).stagedPipeline ?? {}),
            plan: nextPlan,
            planView: buildStagedPlanView(nextPlan),
            tasks: {},
            audioPlan: null,
            audioUrl: null,
            finalAssembly: null,
          },
          stagedSequentialStoryboard: {
            ...metadata.stagedSequentialStoryboard,
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
        subtitlePresetId:
          typeof input.subtitlePresetId === "string" && input.subtitlePresetId
            ? input.subtitlePresetId
            : (assembly.subtitlePresetId ?? "classic_box"),
      };
      const revision = current.revision + 1;
      const replacement = buildStagedCheckpoint({
        checkpointId: `final-assembly:${input.runId}:r${revision}:edit-${operationId}`,
        kind: "final_assembly",
        revision,
        contentHash: buildStagedFinalAssemblyHash(nextAssembly),
        model: current.approvedModel ?? "assembly",
        provider: current.approvedProvider ?? "internal",
        estimatedCredits: current.estimatedCredits ?? 0,
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
        reviewCheckpoints: metadata.stagedSequentialStoryboard.reviewCheckpoints.map(
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
    } as typeof metadata,
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
            isStagedCheckpointRetryable(currentImageResult)
          : isStagedCheckpointRetryable(currentVideoPrompt) &&
            (!currentVideoResult ||
              currentVideoResult.state === "approved" ||
              isStagedCheckpointRetryable(currentVideoResult));
      if (!retryableCheckpointAvailable && !providerCorrectionMatches) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "checkpoint_not_retryable",
        });
      }
      const revision = shot.revision + 1;
      const kind = input.stage === "image" ? "image_prompt" : "video_prompt";
      const source =
        input.stage === "image"
          ? String((shot as any).imagePrompt ?? shot.storySummary)
          : String((shot as any).videoPrompt ?? shot.storySummary);
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
      const previous =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          item => item.shotId === input.shotId && item.kind === kind
        );
      // Prefer whatever model the user has selected in the UI right now.
      // Falling back to the PREVIOUS checkpoint's approved model (as this
      // used to do unconditionally) silently re-locks in a stale, possibly
      // long-outdated model choice with no way for the caller to see or
      // override it before generation is submitted.
      const resolvedModel = selectedModel || previous?.approvedModel || "internal";
      const resolvedProvider = selectedModel
        ? modelProvider(resolvedModel)
        : (previous?.approvedProvider ?? "internal");
      const resolvedEstimatedCredits = selectedModel
        ? modelCost(resolvedModel)
        : (previous?.estimatedCredits ?? 0);
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
                referenceManifestHash:
                  metadata.stagedSequentialStoryboard.referenceManifestHash ??
                  "none",
              })
            : buildStagedVideoPromptContentHash({
                revision,
                shotId: input.shotId,
                prompt: source,
                imageArtifactHash: shot.imageArtifactHash ?? "",
              }),
        model: resolvedModel,
        provider: resolvedProvider,
        estimatedCredits: resolvedEstimatedCredits,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
        autoApprove: { userId: input.auth.userId },
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
  try {
    const { advanceMarketplaceAutoReviewRun } = await import(
      "./marketplaceAutoReviewService"
    );
    void advanceMarketplaceAutoReviewRun(
      input.runId,
      { userId: input.auth.userId, tenantId: input.auth.tenantId ?? undefined },
      { userToken: "internal" }
    ).catch((err) => {
      console.error("[retryStagedAutoReviewShot] background advance error:", err);
    });
  } catch (err) {
    console.warn(
      "[retryStagedAutoReviewShot] Sync advance warning:",
      err instanceof Error ? err.message : String(err)
    );
  }

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
  const { metadata, runId, shotId, stage, url, contentHash, userId, operationId } =
    input;
  const shot = metadata.stagedSequentialStoryboard.shots.find(
    item => item.shotId === shotId
  );
  if (!shot)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "staged_invalid_shot_contract",
    });

  // A video needs SOME image to belong to.
  if (stage === "video" && !shot.imageArtifactHash) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "staged_image_artifact_missing",
    });
  }

  const revision = shot.revision + 1;

  // Supersede prior non-superseded checkpoints for this shot. Mirrors
  // retryStagedAutoReviewShot's supersede set exactly: an image-stage
  // replacement supersedes ALL 4 shot-scoped kinds (a new image invalidates
  // any video prompt/result built against the old one); a video-stage
  // replacement supersedes only the video-kind checkpoints, leaving the
  // shot's approved image_prompt/image_result checkpoints untouched.
  let next = metadata;
  for (const checkpoint of metadata.stagedSequentialStoryboard
    .reviewCheckpoints) {
    if (
      checkpoint.shotId === shotId &&
      (stage === "image" ||
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
          Object.entries(existingTasks).filter(
            ([key]) => !tasksToDrop.has(key)
          )
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
                      state: "image_result_awaiting",
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
  try {
    const { advanceMarketplaceAutoReviewRun } = await import(
      "./marketplaceAutoReviewService"
    );
    void advanceMarketplaceAutoReviewRun(
      input.runId,
      { userId: input.auth.userId, tenantId: input.auth.tenantId ?? undefined },
      { userToken: "internal" }
    ).catch(err => {
      console.error(
        "[uploadStagedAutoReviewShotMedia] background advance error:",
        err
      );
    });
  } catch (err) {
    console.warn(
      "[uploadStagedAutoReviewShotMedia] Sync advance warning:",
      err instanceof Error ? err.message : String(err)
    );
  }

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

  try {
    const { advanceMarketplaceAutoReviewRun } = await import(
      "./marketplaceAutoReviewService"
    );
    void advanceMarketplaceAutoReviewRun(
      input.runId,
      { userId: input.auth.userId, tenantId: input.auth.tenantId ?? undefined },
      { userToken: "internal" }
    ).catch((err) => {
      console.error("[approveStagedAutoReviewCheckpoint] background advance error:", err);
    });
  } catch (err) {
    console.warn(
      "[approveStagedAutoReviewCheckpoint] Sync advance warning:",
      err instanceof Error ? err.message : String(err)
    );
  }

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
  const { run } = await ensureStagedRunMetadata(db, initialRun);
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

export async function updateStagedAutoReviewReferenceManifest(input: {
  runId: string;
  auth: StagedCheckpointAuth;
  referenceManifest: Array<{
    index?: number;
    url: string;
    role?: string;
    label?: string;
    active?: boolean;
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
  const { run, metadata } = await ensureStagedRunMetadata(db, initialRun);

  const baseRecord = record(run.metadataJson);
  const updatedManifest = input.referenceManifest
    .map((item, idx) => ({
      index: item.index || idx + 1,
      url: String(item.url || "").trim(),
      role: String(item.role || "product").trim(),
      label: item.label ? String(item.label).trim() : undefined,
      active: item.active !== false,
      characterName: item.characterName ? String(item.characterName).trim() : undefined,
      characterRole: item.characterRole,
      vdCharacterId: item.vdCharacterId ? String(item.vdCharacterId).trim() : undefined,
      // Look identity — the family root and the look's own label. Dropping
      // these is what made per-shot look switching impossible before
      // `planning/marketplace-four-character-cast/plan.md` §4.
      vdBaseCharacterId: item.vdBaseCharacterId
        ? String(item.vdBaseCharacterId).trim()
        : undefined,
      variantLabel: item.variantLabel ? String(item.variantLabel).trim() : undefined,
      vdSeriesId: item.vdSeriesId ? String(item.vdSeriesId).trim() : undefined,
      portraitAssetId: item.portraitAssetId ? String(item.portraitAssetId).trim() : undefined,
      ageRange: item.ageRange === null ? null : (item.ageRange ? String(item.ageRange).trim() : undefined),
      // Never coerced to a boolean: `undefined` means "not stated", which the
      // guardian/minor-safety resolver must keep treating conservatively.
      depictsMinor:
        typeof item.depictsMinor === "boolean" ? item.depictsMinor : undefined,
      descriptor: item.descriptor ? String(item.descriptor).trim() : undefined,
    }))
    .filter(item => item.url);

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

  const withResetShotCast = (staged: Record<string, any>) => {
    if (!rosterChanged || !Array.isArray(staged.shots)) return staged;
    return {
      ...staged,
      shots: staged.shots.map((shot: any) => {
        const next = { ...shot };
        delete next.castInShot;
        delete next.castLooks;
        return next;
      }),
    };
  };

  const nextMetadata = {
    ...metadata,
    customReferenceManifest: updatedManifest,
    stagedSequentialStoryboard: withResetShotCast({
      ...metadata.stagedSequentialStoryboard,
      referenceManifest: updatedManifest,
    }),
  };

  const nextRunMetadataJson = {
    ...baseRecord,
    customReferenceManifest: updatedManifest,
    stagedSequentialStoryboard: withResetShotCast({
      ...record(baseRecord.stagedSequentialStoryboard),
      referenceManifest: updatedManifest,
    }),
  };

  await db
    .update(marketplaceAutoReviewRuns)
    .set({
      metadataJson: nextRunMetadataJson,
      updatedAt: new Date(),
    })
    .where(eq(marketplaceAutoReviewRuns.id, run.id));

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
