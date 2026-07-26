import { and, eq, isNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";

import { getDb } from "../db";
import {
  marketplaceAutoReviewOutboxJobs,
  marketplaceAutoReviewRuns,
} from "../../drizzle/schema";
import {
  StagedSequentialStoryboardMetadataV1Schema,
  type StagedCheckpointApprovalExpectationV1,
} from "@shared/marketplaceAutoReview/stagedContracts";
import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
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
  buildStagedAudioPlan,
  buildStagedFinalAssemblyHash,
} from "./marketplaceAutoReviewStagedAudioAssembly";
import { buildStagedOperationEnvelope } from "./marketplaceAutoReviewStagedCheckpointService";

export type StagedCheckpointAuth = { userId: number; tenantId?: string };

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
  return Boolean(
    checkpoint &&
    (checkpoint.state === "rejected" || isStagedCheckpointConsumed(checkpoint))
  );
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
  if (!parsed.success) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Staged checkpoint state is unavailable for this run",
    });
  }
  return parsed.data;
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
  const run = await requireOwnedRun(db, runId, auth);
  const metadata = parseStagedMetadata(run);
  const stagedPipeline =
    run.metadataJson && typeof run.metadataJson === "object"
      ? (run.metadataJson as Record<string, any>).stagedPipeline
      : null;
  const stagedShots = metadata.stagedSequentialStoryboard.shots.map(shot => {
    const detail = stagedPipeline?.plan?.shots?.[shot.shotId - 1] ?? {};
    return {
      shotId: shot.shotId,
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
    };
  });
  return {
    runId: run.id,
    runStatus: run.status,
    currentStage: run.currentStage,
    outputMode: run.outputMode,
    planningArchitecture: metadata.planningArchitecture,
    planningArchitectureVersion: metadata.planningArchitectureVersion,
    humanApprovalPolicy: metadata.humanApprovalPolicy,
    planRevision: metadata.stagedSequentialStoryboard.planRevision,
    stateDigest: stagedMetadataStateDigest(metadata),
    planReview: metadata.planReview,
    audioPlan:
      stagedPipeline && typeof stagedPipeline.audioPlan === "object"
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
      stagedPipeline && typeof stagedPipeline.finalAssembly === "object"
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
    return { runId: run.id, operation, status: "queued" as const };
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
  ) => {
    metadata: ReturnType<typeof parseStagedMetadata>;
    planRevision: number;
  };
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
    const changed = input.mutate(existingMetadata, operationId);
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
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
    runId: input.runId,
    expectedStateDigest: input.expectedStateDigest,
    idempotencyKey: input.idempotencyKey,
    auth: input.auth,
    mutate(metadata) {
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
      const nextPlan = buildStagedStoryArcPlan({
        runId: input.runId,
        product: current.product,
        referenceManifestHash: current.referenceManifestHash,
        revision: metadata.planReview.planRevision + 1,
        previousStorySummary: [
          current.storySummary,
          input.notes?.trim().slice(0, 1200),
        ]
          .filter(Boolean)
          .join(" ผู้ใช้ขอปรับ: ")
          .slice(0, 500),
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
    mutate(metadata) {
      const current =
        metadata.stagedSequentialStoryboard.reviewCheckpoints.find(
          checkpoint =>
            checkpoint.kind === "final_assembly" &&
            checkpoint.state !== "superseded"
        );
      if (!current)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "staged_final_assembly_unavailable",
        });
      return {
        metadata: {
          ...metadata,
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
        },
        planRevision: metadata.planReview.planRevision,
      };
    },
  });
}

export async function retryStagedAutoReviewShot(input: {
  runId: string;
  shotId: number;
  stage: "image" | "video";
  expectedStateDigest: string;
  idempotencyKey: string;
  auth: StagedCheckpointAuth;
}) {
  return mutateOwnedStagedMetadata({
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
        model: previous?.approvedModel ?? "internal",
        provider: previous?.approvedProvider ?? "internal",
        estimatedCredits: previous?.estimatedCredits ?? 0,
        referenceManifestHash:
          metadata.stagedSequentialStoryboard.referenceManifestHash,
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
  return mutateOwnedCheckpoint({
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
