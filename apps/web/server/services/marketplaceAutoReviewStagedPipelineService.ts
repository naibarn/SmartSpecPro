import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "../db";

import {
  marketplaceAutoReviewRuns,
  marketplaceAutoReviewStages,
  type MarketplaceAutoReviewRun,
} from "../../drizzle/schema";
import { buildProductionStableHash } from "../../shared/mediaProduction";
import {
  StagedSequentialStoryboardMetadataV1Schema,
  type HumanApprovalCheckpointV1,
  type StagedCheckpointApprovalExpectationV1,
  type StagedSequentialStoryboardMetadataV1,
} from "@shared/marketplaceAutoReview/stagedContracts";
import {
  buildStagedCheckpoint,
  buildStagedPlanView,
  buildStagedStoryArcPlan,
  type StagedStoryArcPlan,
} from "./marketplaceAutoReviewStoryArcPlanner";
import {
  buildStagedImagePromptContentHash,
  buildStagedVideoPromptContentHash,
  compileStagedImagePrompt,
  compileStagedVideoPrompt,
} from "./marketplaceAutoReviewStagedPromptCompiler";
import {
  buildStagedAudioPlan,
  buildStagedFinalAssemblyHash,
} from "./marketplaceAutoReviewStagedAudioAssembly";
import { buildStagedSafeEvidenceEvent } from "./marketplaceAutoReviewStagedObservability";
import {
  assertStagedProviderSpendAllowed,
  transitionStagedCheckpoint,
} from "./marketplaceAutoReviewStagedCheckpointService";
import { mediaGenerationService } from "./mediaGenerationService";
import {
  deductCredits,
  hasEnoughCredits,
  refundCredits,
} from "./creditService";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Auth = { userId: number; tenantId?: string };
type Runtime = { userToken?: string | null; publicUrl?: string | null };

const STAGED_IMAGE_MODEL = "google-banana-2";
const STAGED_VIDEO_MODEL = "veo3/generate-veo-3-video-lite";
const STAGED_AUDIO_MODEL = "elevenlabs-tts";

function record(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function modelProvider(modelId: string): string {
  return (
    text(mediaGenerationService.getModel(modelId)?.provider) || "media-provider"
  );
}

function modelCost(modelId: string): number {
  const value = Number(mediaGenerationService.getModel(modelId)?.creditCost);
  return Number.isFinite(value) && value >= 0 ? value : 1;
}

function stagedPlanFromMetadata(
  metadata: Record<string, any>
): StagedStoryArcPlan | null {
  const plan = record(metadata.stagedPipeline).plan;
  if (!plan || !Array.isArray(plan.shots)) return null;
  return plan as StagedStoryArcPlan;
}

function buildProductFromMetadata(
  run: MarketplaceAutoReviewRun,
  metadata: Record<string, any>
) {
  const truth = record(metadata.productTruth);
  const urls = Array.isArray(metadata.productImageUrls)
    ? metadata.productImageUrls.map(text).filter(Boolean)
    : [];
  return {
    productId: run.productId,
    productName: text(truth.productName) || run.productId,
    description: text(truth.description) || null,
    imageUrls: urls.slice(0, 5),
  };
}

function buildLegacyConcept(plan: StagedStoryArcPlan) {
  const truth = {
    productId: plan.product.productId,
    productName: plan.product.productName,
    brand: null,
    platform: "marketplace",
    externalProductId: null,
    externalShopId: null,
    productCategory: null,
    categoryText: null,
    categoryPath: [],
    sourceUrl: "",
    affiliateUrl: null,
    shopName: null,
    price: null,
    rating: null,
    sold: null,
    reviews: null,
    description: plan.product.description || "",
    specs: {},
    imageUrls: plan.product.imageUrls,
  };
  return {
    conceptId: `staged-${plan.product.productId}-${plan.planRevision}`,
    title: plan.title,
    productTruth: truth,
    storyboardGuide: plan.storySummary,
    voiceoverScript: plan.shots.map(shot => shot.dialogue).join("\n"),
    productDetail: plan.product.description || plan.product.productName,
    shots: plan.shots.map(shot => ({
      id: `shot-${shot.shotId}`,
      order: shot.shotId,
      title: shot.title,
      startSeconds: (shot.shotId - 1) * 10,
      endSeconds: shot.shotId * 10,
      durationSeconds: 10,
      storyboardGuide: shot.storySummary,
      voiceover: shot.dialogue,
      camera: "stable vertical product-review framing",
      visual: shot.visualSummary,
      movement: "restrained continuity-preserving motion",
      productRole: "evidence-grounded product presentation",
    })),
  };
}

function checkpointFor(
  state: StagedSequentialStoryboardMetadataV1,
  kind: HumanApprovalCheckpointV1["kind"],
  shotId?: number
) {
  return state.stagedSequentialStoryboard.reviewCheckpoints.find(
    checkpoint =>
      checkpoint.kind === kind &&
      checkpoint.shotId === (shotId ?? null) &&
      checkpoint.state !== "superseded"
  );
}

function finalAssemblyFor(
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>,
  plan: StagedStoryArcPlan
) {
  const configured = record(metadata).stagedPipeline?.finalAssembly;
  if (
    configured &&
    Array.isArray(configured.shots) &&
    configured.shots.length === plan.shots.length
  ) {
    const { contentHash: _contentHash, ...assembly } = configured;
    return assembly;
  }
  return {
    planRevision: plan.planRevision,
    shots: metadata.stagedSequentialStoryboard.shots.map(shot => ({
      shotId: shot.shotId,
      imageArtifactHash: shot.imageArtifactHash,
      videoArtifactHash: shot.videoArtifactHash,
      dialogue: shot.dialogue,
    })),
    audio: {
      plan: record(metadata).stagedPipeline?.audioPlan ?? null,
      artifactHash: text(record(metadata).stagedPipeline?.audioUrl)
        ? buildProductionStableHash({
            audioUrl: text(record(metadata).stagedPipeline?.audioUrl),
          })
        : null,
    },
    includeAudio: true,
  };
}

function withCheckpoint(
  metadata: StagedSequentialStoryboardMetadataV1,
  checkpoint: HumanApprovalCheckpointV1
): StagedSequentialStoryboardMetadataV1 {
  const existing = metadata.stagedSequentialStoryboard.reviewCheckpoints;
  const index = existing.findIndex(
    item => item.checkpointId === checkpoint.checkpointId
  );
  const next = existing.slice();
  if (index >= 0) next[index] = checkpoint;
  else next.push(checkpoint);
  return {
    ...metadata,
    stagedSequentialStoryboard: {
      ...metadata.stagedSequentialStoryboard,
      reviewCheckpoints: next,
    },
  };
}

function replaceCheckpoint(
  metadata: StagedSequentialStoryboardMetadataV1,
  checkpoint: HumanApprovalCheckpointV1
) {
  return withCheckpoint(metadata, checkpoint);
}

function updateShot(
  metadata: StagedSequentialStoryboardMetadataV1,
  shotId: number,
  patch: Record<string, unknown>
): StagedSequentialStoryboardMetadataV1 {
  return {
    ...metadata,
    stagedSequentialStoryboard: {
      ...metadata.stagedSequentialStoryboard,
      shots: metadata.stagedSequentialStoryboard.shots.map(shot =>
        shot.shotId === shotId ? { ...shot, ...patch } : shot
      ),
    },
  };
}

async function persistRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: Record<string, any>;
  status?: string;
  currentStage?: string;
  stageIndex?: number;
  resultJson?: Record<string, unknown>;
  completedAt?: Date | null;
}) {
  const [next] = await params.db
    .update(marketplaceAutoReviewRuns)
    .set({
      metadataJson: params.metadata,
      ...(params.status ? { status: params.status } : {}),
      ...(params.currentStage ? { currentStage: params.currentStage } : {}),
      ...(params.stageIndex !== undefined
        ? { stageIndex: params.stageIndex }
        : {}),
      ...(params.resultJson ? { resultJson: params.resultJson } : {}),
      ...(params.completedAt !== undefined
        ? { completedAt: params.completedAt }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(marketplaceAutoReviewRuns.id, params.run.id))
    .returning();
  return (
    next ??
    ({
      ...params.run,
      metadataJson: params.metadata,
    } as MarketplaceAutoReviewRun)
  );
}

async function upsertStage(params: {
  db: Db;
  runId: string;
  stageKey: string;
  status: string;
  output?: Record<string, unknown>;
}) {
  const [existing] = await params.db
    .select({ id: marketplaceAutoReviewStages.id })
    .from(marketplaceAutoReviewStages)
    .where(
      and(
        eq(marketplaceAutoReviewStages.runId, params.runId),
        eq(marketplaceAutoReviewStages.stageKey, params.stageKey)
      )
    )
    .limit(1);
  const now = new Date();
  if (existing) {
    await params.db
      .update(marketplaceAutoReviewStages)
      .set({
        status: params.status,
        outputJson: params.output ?? {},
        updatedAt: now,
        ...(params.status === "waiting_provider" ? { startedAt: now } : {}),
        ...(params.status === "completed" ? { completedAt: now } : {}),
      })
      .where(eq(marketplaceAutoReviewStages.id, existing.id));
    return;
  }
  await params.db.insert(marketplaceAutoReviewStages).values({
    runId: params.runId,
    stageKey: params.stageKey,
    stageOrder: 0,
    status: params.status,
    outputJson: params.output ?? {},
    createdAt: now,
    updatedAt: now,
  });
}

function checkpointExpectation(
  checkpoint: HumanApprovalCheckpointV1
): StagedCheckpointApprovalExpectationV1 {
  return {
    revision: checkpoint.revision,
    contentHash: checkpoint.contentHash,
    model: checkpoint.approvedModel || "internal",
    provider: checkpoint.approvedProvider || "internal",
    safetyVerdict: checkpoint.approvedSafetyVerdict || "passed",
    referenceManifestHash: checkpoint.approvedReferenceManifestHash || "none",
    estimatedCredits: checkpoint.estimatedCredits ?? 0,
  };
}

async function consumeCheckpoint(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1;
  checkpoint: HumanApprovalCheckpointV1;
  operationId: string;
}) {
  const expected = checkpointExpectation(params.checkpoint);
  const guard = assertStagedProviderSpendAllowed(params.checkpoint, expected);
  if (!guard.ok) throw new Error(guard.reasonCode);
  const transitioned = transitionStagedCheckpoint(params.checkpoint, {
    type: "consume",
    operationId: params.operationId,
    consumedAt: new Date().toISOString(),
  });
  if (!transitioned.ok) throw new Error(transitioned.reasonCode);
  const next = appendSafeEvidence(
    replaceCheckpoint(params.metadata, transitioned.checkpoint),
    buildStagedSafeEvidenceEvent({
      runId: params.run.id,
      operation: "checkpoint_consumed",
      checkpointKind: transitioned.checkpoint.kind,
      shotId: transitioned.checkpoint.shotId,
      state: transitioned.checkpoint.state,
      model: transitioned.checkpoint.approvedModel,
      provider: transitioned.checkpoint.approvedProvider,
      estimatedCredits: transitioned.checkpoint.estimatedCredits,
      contentHash: transitioned.checkpoint.contentHash,
    })
  );
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as unknown as Record<string, any>,
  });
  return next;
}

async function reserveAndSubmit(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
  mediaType: "image" | "video" | "audio";
  unitId: string;
  model: string;
  estimatedCredits: number;
  description: string;
  request: Record<string, unknown>;
}) {
  const token = text(params.runtime.userToken);
  if (!token) throw new Error("staged_provider_missing_user_token");
  const amount = Math.max(0, Math.ceil(params.estimatedCredits));
  if (amount > 0 && !(await hasEnoughCredits(params.auth.userId, amount))) {
    throw new Error("staged_insufficient_credits");
  }
  let credit: { transactionId?: number } | null = null;
  if (amount > 0) {
    credit = await deductCredits({
      userId: params.auth.userId,
      tenantId: params.auth.tenantId ?? params.run.tenantId ?? "default",
      amount,
      description: params.description,
      idempotencyKey: `staged:${params.run.id}:${params.mediaType}:${params.unitId}`,
      sourceType:
        params.mediaType === "image"
          ? "media_image"
          : params.mediaType === "video"
            ? "media_video"
            : "media_audio",
      metadata: {
        feature: "marketplace_auto_review",
        planningArchitecture: "staged_two_skill_v2",
        runId: params.run.id,
        unitId: params.unitId,
        mediaType: params.mediaType,
      },
    });
  }
  let task;
  try {
    task =
      params.mediaType === "image"
        ? await mediaGenerationService.generateImageAsync(
            params.request as any,
            token
          )
        : params.mediaType === "video"
          ? await mediaGenerationService.generateVideoAsync(
              params.request as any,
              token
            )
          : await mediaGenerationService.generateAudioAsync(
              params.request as any,
              token
            );
  } catch (error) {
    if (credit?.transactionId && amount > 0) {
      await refundCredits({
        userId: params.auth.userId,
        amount,
        originalTransactionId: credit.transactionId,
        idempotencyKey: `staged:${params.run.id}:${params.mediaType}:${params.unitId}:refund`,
        description: `Marketplace staged ${params.mediaType} provider submission failed`,
        sourceType:
          params.mediaType === "image"
            ? "media_image"
            : params.mediaType === "video"
              ? "media_video"
              : "media_audio",
        metadata: {
          runId: params.run.id,
          unitId: params.unitId,
          reason: "provider_submit_failed",
        },
      }).catch(() => undefined);
    }
    throw error;
  }
  return {
    task,
    amount,
    transactionId: credit?.transactionId,
    creditIdempotencyKey:
      amount > 0
        ? `staged:${params.run.id}:${params.mediaType}:${params.unitId}`
        : undefined,
  };
}

function taskRecord(
  metadata: Record<string, any>,
  shotId: number,
  mediaType: string
) {
  return record(record(metadata.stagedPipeline).tasks)[
    `${mediaType}:${shotId}`
  ];
}

function setTaskRecord(
  metadata: Record<string, any>,
  key: string,
  value: Record<string, any>
) {
  const pipeline = record(metadata.stagedPipeline);
  const taskRecord = { ...value, stagedTaskKey: key };
  const taskHistory = Array.isArray(pipeline.taskHistory)
    ? pipeline.taskHistory
    : [];
  return updateStagedTaskCreditSummary({
    ...metadata,
    stagedPipeline: {
      ...pipeline,
      tasks: { ...record(pipeline.tasks), [key]: taskRecord },
      taskHistory: [...taskHistory, taskRecord].slice(-200),
    },
  });
}

function updateTaskRecord<T extends Record<string, any>>(
  metadata: T,
  key: string,
  patch: Record<string, any>
): T {
  const pipeline = record(metadata.stagedPipeline);
  const tasks = record(pipeline.tasks);
  if (!tasks[key]) return metadata;
  const currentTask = record(tasks[key]);
  const taskId = text(currentTask.taskId);
  const taskHistory = Array.isArray(pipeline.taskHistory)
    ? pipeline.taskHistory.map((item: unknown) => {
        const historyTask = record(item);
        return taskId && text(historyTask.taskId) === taskId
          ? { ...historyTask, ...patch, stagedTaskKey: key }
          : item;
      })
    : pipeline.taskHistory;
  return {
    ...metadata,
    stagedPipeline: {
      ...pipeline,
      tasks: {
        ...tasks,
        [key]: { ...currentTask, ...patch, stagedTaskKey: key },
      },
      taskHistory,
    },
  } as T;
}

function appendSafeEvidence(
  metadata: Record<string, any>,
  event: ReturnType<typeof buildStagedSafeEvidenceEvent>
) {
  const pipeline = record(metadata.stagedPipeline);
  const events = Array.isArray(pipeline.safeEvidenceEvents)
    ? pipeline.safeEvidenceEvents
    : [];
  return {
    ...metadata,
    stagedPipeline: {
      ...pipeline,
      safeEvidenceEvents: [...events, event].slice(-100),
    },
  } as Record<string, any>;
}

function updateStagedTaskCreditSummary<T extends Record<string, any>>(
  metadata: T
): T {
  const pipeline = record(metadata.stagedPipeline);
  const history = Array.isArray(pipeline.taskHistory)
    ? pipeline.taskHistory
    : [];
  const activeTasks = Object.values(record(pipeline.tasks));
  const byTaskId = new Map<string, Record<string, any>>();
  for (const rawTask of [...history, ...activeTasks]) {
    const task = record(rawTask);
    const taskId = text(task.taskId);
    if (taskId) byTaskId.set(taskId, task);
  }
  const tasks = [...byTaskId.values()];
  const reservedCredits = tasks.reduce(
    (sum, task) => sum + Math.max(0, Number(task.creditAmount) || 0),
    0
  );
  const refundedCredits = tasks.reduce(
    (sum, task) =>
      sum +
      (task.refundTransactionId
        ? Math.max(0, Number(task.creditAmount) || 0)
        : 0),
    0
  );
  const previous = record(metadata.creditSummary);
  const stagedReservationRefs = tasks
    .map(task => {
      const key = text(task.creditIdempotencyKey);
      return key ? `credit:${key}` : "";
    })
    .filter(Boolean);
  const stagedTransactionRefs = tasks
    .map(task => {
      const transactionId = Number(task.creditTransactionId);
      return transactionId > 0 ? `credit-tx:${transactionId}` : "";
    })
    .filter(Boolean);
  return {
    ...metadata,
    creditSummary: {
      ...previous,
      status: "tracked_idempotently",
      reservedCredits,
      spentCredits: Math.max(0, reservedCredits - refundedCredits),
      refundedCredits,
      outstandingCredits: Math.max(0, reservedCredits - refundedCredits),
      mediaTaskCount: tasks.length,
      reservationRefs: [
        ...new Set([
          ...(Array.isArray(previous.reservationRefs)
            ? previous.reservationRefs
            : []),
          ...stagedReservationRefs,
        ]),
      ],
      transactionRefs: [
        ...new Set([
          ...(Array.isArray(previous.transactionRefs)
            ? previous.transactionRefs
            : []),
          ...stagedTransactionRefs,
        ]),
      ],
    },
  } as T;
}

function planAndMetadataFromRun(run: MarketplaceAutoReviewRun): {
  plan: StagedStoryArcPlan;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
} {
  const base = record(run.metadataJson);
  const existingPlan = stagedPlanFromMetadata(base);
  const plan =
    existingPlan ||
    buildStagedStoryArcPlan({
      runId: run.id,
      product: buildProductFromMetadata(run, base),
      referenceManifestHash: buildProductionStableHash({
        referenceAnchors: base.referenceAnchors ?? {},
        productImageUrls: base.productImageUrls ?? [],
      }),
    });
  const existing = StagedSequentialStoryboardMetadataV1Schema.safeParse(base);
  if (existing.success)
    return {
      plan,
      metadata: existing.data as typeof existing.data & Record<string, any>,
    };
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: `story-plan:${run.id}:r${plan.planRevision}`,
    kind: "story_plan",
    revision: plan.planRevision,
    contentHash: plan.storyPlanHash,
    model: "story-arc",
    provider: "internal-bounded",
    estimatedCredits: 0,
    referenceManifestHash: plan.referenceManifestHash,
  });
  const metadata = {
    ...base,
    planningArchitecture: "staged_two_skill_v2" as const,
    planningArchitectureVersion: 1 as const,
    humanApprovalPolicy: "all_checkpoints_required" as const,
    concept: buildLegacyConcept(plan),
    stagedPipeline: {
      plan,
      planView: buildStagedPlanView(plan),
      tasks: {},
      audioPlan: null,
      finalAssembly: null,
    },
    planReview: {
      required: true as const,
      status: "awaiting" as const,
      planRevision: plan.planRevision,
      approvedRevision: null,
      redraftCount: 0,
      lastOperationId: null,
    },
    stagedSequentialStoryboard: {
      storyPlanStatus: "awaiting" as const,
      planRevision: plan.planRevision,
      storyPlanHash: plan.storyPlanHash,
      referenceManifestHash: plan.referenceManifestHash,
      shots: plan.shots.map(shot => ({
        shotId: shot.shotId,
        revision: plan.planRevision,
        state: "story_awaiting",
        storySummary: shot.storySummary,
        dialogue: shot.dialogue,
        imagePromptHash: null,
        imageArtifactHash: null,
        videoPromptHash: null,
        videoArtifactHash: null,
        title: shot.title,
        visualSummary: shot.visualSummary,
        durationSeconds: shot.durationSeconds,
      })),
      reviewCheckpoints: [storyCheckpoint],
    },
  };
  return { plan, metadata: metadata as any };
}

function stagedMetadataForPlan(input: {
  run: MarketplaceAutoReviewRun;
  base: Record<string, any>;
  plan: StagedStoryArcPlan;
  redraftCount: number;
}) {
  const storyCheckpoint = buildStagedCheckpoint({
    checkpointId: `story-plan:${input.run.id}:r${input.plan.planRevision}`,
    kind: "story_plan",
    revision: input.plan.planRevision,
    contentHash: input.plan.storyPlanHash,
    model: "story-arc",
    provider: "internal-bounded",
    estimatedCredits: 0,
    referenceManifestHash: input.plan.referenceManifestHash,
  });
  return {
    ...input.base,
    planningArchitecture: "staged_two_skill_v2" as const,
    planningArchitectureVersion: 1 as const,
    humanApprovalPolicy: "all_checkpoints_required" as const,
    concept: buildLegacyConcept(input.plan),
    stagedPipeline: {
      ...record(input.base.stagedPipeline),
      plan: input.plan,
      planView: buildStagedPlanView(input.plan),
      tasks: {},
      audioPlan: null,
      finalAssembly: null,
    },
    planReview: {
      required: true as const,
      status: "awaiting" as const,
      planRevision: input.plan.planRevision,
      approvedRevision: null,
      redraftCount: input.redraftCount,
      lastOperationId: null,
    },
    stagedSequentialStoryboard: {
      storyPlanStatus: "awaiting" as const,
      planRevision: input.plan.planRevision,
      storyPlanHash: input.plan.storyPlanHash,
      referenceManifestHash: input.plan.referenceManifestHash,
      shots: input.plan.shots.map(shot => ({
        shotId: shot.shotId,
        revision: input.plan.planRevision,
        state: "story_awaiting",
        storySummary: shot.storySummary,
        dialogue: shot.dialogue,
        imagePromptHash: null,
        imageArtifactHash: null,
        videoPromptHash: null,
        videoArtifactHash: null,
        title: shot.title,
        visualSummary: shot.visualSummary,
        durationSeconds: shot.durationSeconds,
      })),
      reviewCheckpoints: [storyCheckpoint],
    },
  } as StagedSequentialStoryboardMetadataV1 & Record<string, any>;
}

export async function redraftStagedMarketplaceAutoReviewRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  notes?: string | null;
}) {
  const base = record(params.run.metadataJson);
  const current =
    stagedPlanFromMetadata(base) || planAndMetadataFromRun(params.run).plan;
  const notes = text(params.notes).slice(0, 1200);
  const storySummary = [
    current.storySummary,
    notes ? `ผู้ใช้ขอปรับ: ${notes}` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 500);
  const nextPlan = buildStagedStoryArcPlan({
    runId: params.run.id,
    product: current.product,
    referenceManifestHash: current.referenceManifestHash,
    revision: current.planRevision + 1,
    previousStorySummary: storySummary,
  });
  const currentRedraftCount = Number(record(base.planReview).redraftCount) || 0;
  const metadata = stagedMetadataForPlan({
    run: params.run,
    base,
    plan: nextPlan,
    redraftCount: currentRedraftCount + 1,
  });
  const next = await persistRun({
    db: params.db,
    run: params.run,
    metadata,
    status: "running",
    currentStage: "concept_story",
    stageIndex: 3,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "concept_story",
    status: "blocked_needs_user",
    output: {
      planningArchitecture: "staged_two_skill_v2",
      storyPlan: buildStagedPlanView(nextPlan),
      statusDetail: {
        state: "awaiting_story_plan_review",
        severity: "info",
        reasonCodes: ["story_plan_redraft_ready"],
        safeMessage:
          "ร่างเนื้อเรื่องใหม่พร้อมตรวจแล้ว ระบบยังไม่ใช้เครดิตสร้างภาพ",
        nextAction: "ตรวจและยืนยันเนื้อเรื่องใหม่",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

export async function initializeStagedMarketplaceAutoReviewRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
}) {
  const { plan, metadata } = planAndMetadataFromRun(params.run);
  const next = await persistRun({
    db: params.db,
    run: params.run,
    metadata,
    status: "running",
    currentStage: "concept_story",
    stageIndex: 3,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "concept_story",
    status: "blocked_needs_user",
    output: {
      planningArchitecture: "staged_two_skill_v2",
      storyPlan: buildStagedPlanView(plan),
      statusDetail: {
        state: "awaiting_story_plan_review",
        severity: "info",
        reasonCodes: ["story_plan_approval_required"],
        safeMessage: "ตรวจเนื้อเรื่องก่อน ระบบยังไม่ใช้เครดิตสร้างภาพ",
        nextAction: "ตรวจและยืนยันเนื้อเรื่อง",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

async function compileImagePromptCheckpoints(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
}) {
  let next = params.metadata;
  for (const shot of params.plan.shots) {
    const shotState = next.stagedSequentialStoryboard.shots.find(
      item => item.shotId === shot.shotId
    );
    const existingPrompt = checkpointFor(next, "image_prompt", shot.shotId);
    // A per-shot story/dialogue repair deliberately leaves other shots in
    // place. Preserve their existing prompt checkpoint instead of compiling
    // and re-spending the whole storyboard when the run-level story gate is
    // approved again.
    if (shotState?.state !== "story_awaiting" && existingPrompt) continue;
    const compiled = compileStagedImagePrompt({ plan: params.plan, shot });
    const prompt = compiled.prompt;
    const hash = compiled.contentHash;
    const checkpoint = buildStagedCheckpoint({
      checkpointId: `image-prompt:${params.run.id}:shot-${shot.shotId}:r${params.plan.planRevision}`,
      kind: "image_prompt",
      shotId: shot.shotId,
      revision: params.plan.planRevision,
      contentHash: hash,
      model: text(record(params.metadata).imageModel) || STAGED_IMAGE_MODEL,
      provider: modelProvider(
        text(record(params.metadata).imageModel) || STAGED_IMAGE_MODEL
      ),
      estimatedCredits: modelCost(
        text(record(params.metadata).imageModel) || STAGED_IMAGE_MODEL
      ),
      referenceManifestHash: params.plan.referenceManifestHash,
    });
    next = replaceCheckpoint(next, checkpoint);
    next = updateShot(next, shot.shotId, {
      state: "image_prompt_awaiting",
      imagePromptHash: hash,
      imagePrompt: prompt,
    });
  }
  next = {
    ...next,
    stagedSequentialStoryboard: {
      ...next.stagedSequentialStoryboard,
      storyPlanStatus: "approved",
    },
    planReview: {
      ...next.planReview,
      status: "approved",
      approvedRevision: params.plan.planRevision,
    },
  };
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "prompt_plan",
    stageIndex: 4,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "prompt_plan",
    status: "blocked_needs_user",
    output: {
      statusDetail: {
        state: "awaiting_image_prompt_review",
        severity: "info",
        reasonCodes: ["image_prompt_approval_required_per_shot"],
        safeMessage:
          "ตรวจ Prompt ของแต่ละช็อตก่อนยืนยันสร้างภาพ ระบบยังไม่ใช้เครดิตภาพ",
        nextAction: "ตรวจ Prompt ช็อตที่ต้องการ แล้วกดยืนยันสร้างภาพ",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

async function handleImageProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}) {
  const shot = params.plan.shots.find(item => item.shotId === params.shotId);
  if (!shot) throw new Error("staged_invalid_shot_contract");
  const metadata = params.metadata;
  const model = text(record(metadata).imageModel) || STAGED_IMAGE_MODEL;
  const provider = modelProvider(model);
  const checkpoint = checkpointFor(metadata, "image_prompt", params.shotId);
  if (!checkpoint) throw new Error("checkpoint_not_ready");
  const expected = checkpointExpectation(checkpoint);
  const guard = assertStagedProviderSpendAllowed(checkpoint, {
    ...expected,
    model,
    provider,
    estimatedCredits: modelCost(model),
  });
  if (!guard.ok) throw new Error(guard.reasonCode);
  const prompt = text(
    record(
      metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === params.shotId
      )
    ).imagePrompt
  );
  if (
    buildStagedImagePromptContentHash({
      revision: checkpoint.revision,
      shotId: params.shotId,
      prompt,
      referenceManifestHash:
        checkpoint.approvedReferenceManifestHash ||
        params.plan.referenceManifestHash,
    }) !== checkpoint.contentHash
  ) {
    throw new Error(`checkpoint_hash_mismatch:shot:${params.shotId}`);
  }
  const operationId = `staged-image-${params.run.id}-${params.shotId}-${nanoid(8)}`;
  const consumed = await consumeCheckpoint({
    db: params.db,
    run: params.run,
    metadata,
    checkpoint,
    operationId,
  });
  const referenceImageUrls = buildProductFromMetadata(
    params.run,
    record(consumed)
  ).imageUrls.slice(0, 1);
  if (referenceImageUrls.length === 0)
    throw new Error("staged_reference_missing");
  const submitted = await reserveAndSubmit({
    db: params.db,
    run: params.run,
    auth: params.auth,
    runtime: params.runtime,
    mediaType: "image",
    unitId: `shot-${params.shotId}`,
    model,
    estimatedCredits: modelCost(model),
    description: `Marketplace staged storyboard image shot ${params.shotId}`,
    request: {
      prompt,
      model,
      aspectRatio: "9:16",
      resolution: "2K",
      outputFormat: "png",
      numImages: 1,
      referenceImageUrls,
      publicUrl: params.runtime.publicUrl ?? undefined,
      extraParams: {
        __origin_surface: "marketplace_auto_review",
        __execution_path: "staged_two_skill_v2",
        __auto_review_run_id: params.run.id,
        __unit_id: `staged-shot-${params.shotId}`,
      },
      auditContext: {
        userId: params.auth.userId,
        traceId: operationId,
        source: "marketplace_auto_review_staged",
        stage: "image_generation",
      },
    },
  });
  const nextMetadata = setTaskRecord(
    consumed as any,
    `image:${params.shotId}`,
    {
      taskId: submitted.task.id,
      model,
      provider,
      operationId,
      submittedAt: new Date().toISOString(),
      creditAmount: submitted.amount,
      creditTransactionId: submitted.transactionId,
      creditIdempotencyKey: submitted.creditIdempotencyKey,
    }
  );
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: nextMetadata,
    status: "waiting_provider",
    currentStage: "image_generation",
    stageIndex: 5,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "image_generation",
    status: "waiting_provider",
    output: { shotId: params.shotId, taskPending: true },
  });
  return nextMetadata;
}

async function reconcileImageProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
  runtime: Runtime;
}) {
  const taskInfo = taskRecord(params.metadata, params.shotId, "image");
  if (!taskInfo?.taskId) return null;
  const token = text(params.runtime.userToken);
  if (!token) throw new Error("staged_provider_missing_user_token");
  const task = await mediaGenerationService.getTask(taskInfo.taskId, token, {
    userId: params.auth.userId,
    traceId: `staged-image-poll:${params.run.id}:${params.shotId}`,
    source: "marketplace_auto_review_staged",
    stage: "image_generation",
  });
  if (task.status === "pending" || task.status === "processing")
    return params.metadata;
  if (task.status === "failed" || task.status === "cancelled") {
    throw new Error(`staged_image_provider_failed:shot:${params.shotId}`);
  }
  const url = text(task.resultUrl);
  if (!url)
    throw new Error(`staged_image_artifact_missing:shot:${params.shotId}`);
  const artifactHash = buildProductionStableHash({ taskId: task.id, url });
  let next = updateShot(params.metadata, params.shotId, {
    state: "image_result_awaiting",
    imageArtifactHash: artifactHash,
    imageArtifactUrl: url,
  });
  next = updateTaskRecord(next, `image:${params.shotId}`, {
    status: "completed",
    resultUrl: url,
    completedAt: new Date().toISOString(),
  });
  const imagePrompt = checkpointFor(next, "image_prompt", params.shotId);
  const imageResultCheckpoint = buildStagedCheckpoint({
    checkpointId: `image-result:${params.run.id}:shot-${params.shotId}:r${params.plan.planRevision}`,
    kind: "image_result",
    shotId: params.shotId,
    revision: params.plan.planRevision,
    contentHash: artifactHash,
    model:
      imagePrompt?.approvedModel ||
      text(record(params.metadata).imageModel) ||
      STAGED_IMAGE_MODEL,
    provider:
      imagePrompt?.approvedProvider || modelProvider(STAGED_IMAGE_MODEL),
    estimatedCredits: 0,
    referenceManifestHash: params.plan.referenceManifestHash,
  });
  next = replaceCheckpoint(next, imageResultCheckpoint);
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "storyboard_review",
    stageIndex: 6,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "storyboard_review",
    status: "blocked_needs_user",
    output: {
      shotId: params.shotId,
      statusDetail: {
        state: "awaiting_image_result_review",
        severity: "info",
        reasonCodes: ["image_result_approval_required"],
        safeMessage: `ตรวจผลภาพช็อตที่ ${params.shotId} ก่อนเริ่มงานวิดีโอ ระบบยังไม่ใช้เครดิตวิดีโอ`,
        nextAction: `ตรวจผลภาพช็อตที่ ${params.shotId} แล้วกดยอมรับหรือปฏิเสธ`,
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

async function compileVideoPrompt(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}) {
  const shot = params.plan.shots.find(item => item.shotId === params.shotId);
  if (!shot) throw new Error("staged_invalid_shot_contract");
  const imageArtifactHash =
    params.metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === params.shotId
    )?.imageArtifactHash;
  if (!imageArtifactHash) throw new Error("staged_image_artifact_missing");
  const compiled = compileStagedVideoPrompt({
    plan: params.plan,
    shot,
    imageArtifactHash,
  });
  const prompt = compiled.prompt;
  const hash = compiled.contentHash;
  const model = text(record(params.metadata).videoModel) || STAGED_VIDEO_MODEL;
  const checkpoint = buildStagedCheckpoint({
    checkpointId: `video-prompt:${params.run.id}:shot-${params.shotId}:r${params.plan.planRevision}`,
    kind: "video_prompt",
    shotId: params.shotId,
    revision: params.plan.planRevision,
    contentHash: hash,
    model,
    provider: modelProvider(model),
    estimatedCredits: modelCost(model),
    referenceManifestHash: params.plan.referenceManifestHash,
  });
  let next = updateShot(params.metadata, params.shotId, {
    state: "video_prompt_awaiting",
    videoPromptHash: hash,
    videoPrompt: prompt,
  });
  next = replaceCheckpoint(next, checkpoint);
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "video_generation",
    stageIndex: 7,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "video_generation",
    status: "blocked_needs_user",
    output: {
      shotId: params.shotId,
      statusDetail: {
        state: "awaiting_video_prompt_review",
        severity: "info",
        reasonCodes: ["video_prompt_approval_required"],
        safeMessage: `ยืนยัน Prompt วิดีโอช็อตที่ ${params.shotId} ก่อนใช้เครดิตวิดีโอ`,
        nextAction: `ตรวจ Prompt วิดีโอช็อตที่ ${params.shotId} แล้วกดยืนยัน`,
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

async function handleVideoProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
}) {
  const shotState = params.metadata.stagedSequentialStoryboard.shots.find(
    item => item.shotId === params.shotId
  );
  const checkpoint = checkpointFor(
    params.metadata,
    "video_prompt",
    params.shotId
  );
  if (!shotState?.imageArtifactUrl || !checkpoint)
    throw new Error(`checkpoint_not_ready:shot:${params.shotId}`);
  const model = text(record(params.metadata).videoModel) || STAGED_VIDEO_MODEL;
  const provider = modelProvider(model);
  const guard = assertStagedProviderSpendAllowed(checkpoint, {
    ...checkpointExpectation(checkpoint),
    model,
    provider,
    estimatedCredits: modelCost(model),
  });
  if (!guard.ok) throw new Error(guard.reasonCode);
  const prompt = text(
    record(
      params.metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === params.shotId
      )
    ).videoPrompt
  );
  if (
    buildStagedVideoPromptContentHash({
      revision: checkpoint.revision,
      shotId: params.shotId,
      prompt,
      imageArtifactHash: shotState.imageArtifactHash || "",
    }) !== checkpoint.contentHash
  ) {
    throw new Error(`checkpoint_hash_mismatch:shot:${params.shotId}`);
  }
  const operationId = `staged-video-${params.run.id}-${params.shotId}-${nanoid(8)}`;
  const consumed = await consumeCheckpoint({
    db: params.db,
    run: params.run,
    metadata: params.metadata,
    checkpoint,
    operationId,
  });
  const submitted = await reserveAndSubmit({
    db: params.db,
    run: params.run,
    auth: params.auth,
    runtime: params.runtime,
    mediaType: "video",
    unitId: `shot-${params.shotId}`,
    model,
    estimatedCredits: modelCost(model),
    description: `Marketplace staged storyboard video shot ${params.shotId}`,
    request: {
      prompt,
      model,
      duration: 10,
      aspectRatio: "9:16",
      resolution: "1080p",
      referenceImageUrls: [shotState.imageArtifactUrl],
      publicUrl: params.runtime.publicUrl ?? undefined,
      extraParams: {
        __origin_surface: "marketplace_auto_review",
        __execution_path: "staged_two_skill_v2",
        __auto_review_run_id: params.run.id,
        __unit_id: `staged-shot-${params.shotId}`,
      },
      auditContext: {
        userId: params.auth.userId,
        traceId: operationId,
        source: "marketplace_auto_review_staged",
        stage: "video_generation",
      },
    },
  });
  const next = setTaskRecord(consumed as any, `video:${params.shotId}`, {
    taskId: submitted.task.id,
    model,
    provider,
    operationId,
    submittedAt: new Date().toISOString(),
    creditAmount: submitted.amount,
    creditTransactionId: submitted.transactionId,
    creditIdempotencyKey: submitted.creditIdempotencyKey,
  });
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next,
    status: "waiting_provider",
    currentStage: "video_generation",
    stageIndex: 7,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "video_generation",
    status: "waiting_provider",
    output: { shotId: params.shotId, taskPending: true },
  });
  return next;
}

async function reconcileVideoProvider(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
  shotId: number;
  runtime: Runtime;
}) {
  const taskInfo = taskRecord(params.metadata, params.shotId, "video");
  if (!taskInfo?.taskId) return null;
  const token = text(params.runtime.userToken);
  if (!token) throw new Error("staged_provider_missing_user_token");
  const task = await mediaGenerationService.getTask(taskInfo.taskId, token, {
    userId: params.auth.userId,
    traceId: `staged-video-poll:${params.run.id}:${params.shotId}`,
    source: "marketplace_auto_review_staged",
    stage: "video_generation",
  });
  if (task.status === "pending" || task.status === "processing")
    return params.metadata;
  if (task.status === "failed" || task.status === "cancelled")
    throw new Error(`staged_video_provider_failed:shot:${params.shotId}`);
  const url = text(task.resultUrl);
  if (!url)
    throw new Error(`staged_video_artifact_missing:shot:${params.shotId}`);
  const hash = buildProductionStableHash({ taskId: task.id, url });
  let next = {
    ...updateShot(params.metadata, params.shotId, {
      state: "video_completed",
      videoArtifactHash: hash,
      videoArtifactUrl: url,
    }),
    videoClipUrls: params.plan.shots.map(shot => {
      const current = params.metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === shot.shotId
      );
      return shot.shotId === params.shotId
        ? url
        : text(record(current).videoArtifactUrl);
    }),
  };
  next = updateTaskRecord(next, `video:${params.shotId}`, {
    status: "completed",
    resultUrl: url,
    completedAt: new Date().toISOString(),
  });
  const videoPromptCheckpoint = checkpointFor(
    next,
    "video_prompt",
    params.shotId
  );
  next = replaceCheckpoint(
    next as any,
    buildStagedCheckpoint({
      checkpointId: `video-result:${params.run.id}:shot-${params.shotId}:r${params.plan.planRevision}`,
      kind: "video_result",
      shotId: params.shotId,
      revision: params.plan.planRevision,
      contentHash: hash,
      model: videoPromptCheckpoint?.approvedModel ?? STAGED_VIDEO_MODEL,
      provider:
        videoPromptCheckpoint?.approvedProvider ??
        modelProvider(STAGED_VIDEO_MODEL),
      estimatedCredits: 0,
      referenceManifestHash: params.plan.referenceManifestHash,
    })
  ) as any;
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "video_generation",
    stageIndex: 7,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "video_generation",
    status: "blocked_needs_user",
    output: {
      shotId: params.shotId,
      statusDetail: {
        state: "awaiting_video_result_review",
        reasonCodes: ["video_result_approval_required"],
        safeMessage: `ตรวจผลวิดีโอช็อตที่ ${params.shotId} ก่อนทำงานเสียงหรือช็อตถัดไป`,
        nextAction: `ตรวจผลวิดีโอช็อตที่ ${params.shotId} แล้วกดยอมรับหรือปฏิเสธ`,
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

function allShotsHave(params: {
  metadata: StagedSequentialStoryboardMetadataV1;
  state: string;
}) {
  return params.metadata.stagedSequentialStoryboard.shots.every(
    shot => shot.state === params.state
  );
}

function allShotCheckpointsHave(
  metadata: StagedSequentialStoryboardMetadataV1,
  kind: HumanApprovalCheckpointV1["kind"],
  state: HumanApprovalCheckpointV1["state"]
) {
  const checkpoints =
    metadata.stagedSequentialStoryboard.reviewCheckpoints.filter(
      checkpoint =>
        checkpoint.kind === kind &&
        checkpoint.shotId !== null &&
        checkpoint.state !== "superseded"
    );
  return (
    checkpoints.length === 9 &&
    checkpoints.every(checkpoint => checkpoint.state === state)
  );
}

async function createFinalAssemblyCheckpoint(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  metadata: StagedSequentialStoryboardMetadataV1 & Record<string, any>;
  plan: StagedStoryArcPlan;
}) {
  const assembly = {
    planRevision: params.plan.planRevision,
    shots: params.metadata.stagedSequentialStoryboard.shots.map(shot => ({
      shotId: shot.shotId,
      imageArtifactHash: shot.imageArtifactHash,
      videoArtifactHash: shot.videoArtifactHash,
      dialogue: shot.dialogue,
    })),
    audio: {
      plan: record(params.metadata).stagedPipeline.audioPlan,
      artifactHash: text(record(params.metadata).stagedPipeline.audioUrl)
        ? buildProductionStableHash({
            audioUrl: text(record(params.metadata).stagedPipeline.audioUrl),
          })
        : null,
    },
    includeAudio: true,
  };
  const hash = buildStagedFinalAssemblyHash(assembly);
  let next = {
    ...params.metadata,
    stagedPipeline: {
      ...record(params.metadata).stagedPipeline,
      finalAssembly: { ...assembly, contentHash: hash },
    },
  };
  next = replaceCheckpoint(
    next,
    buildStagedCheckpoint({
      checkpointId: `final-assembly:${params.run.id}:r${params.plan.planRevision}`,
      kind: "final_assembly",
      revision: params.plan.planRevision,
      contentHash: hash,
      model: "assembly",
      provider: "internal",
      estimatedCredits:
        params.run.outputMode === "storyboard_images"
          ? 0
          : Number(process.env.MARKETPLACE_AUTO_REVIEW_RENDER_CREDITS ?? 10) ||
            10,
      referenceManifestHash: params.plan.referenceManifestHash,
    })
  ) as any;
  await persistRun({
    db: params.db,
    run: params.run,
    metadata: next as any,
    status: "running",
    currentStage: "render",
    stageIndex: 10,
  });
  await upsertStage({
    db: params.db,
    runId: params.run.id,
    stageKey: "render",
    status: "blocked_needs_user",
    output: {
      finalAssembly: record(next).stagedPipeline.finalAssembly,
      statusDetail: {
        state: "awaiting_final_assembly_review",
        severity: "info",
        reasonCodes: ["final_assembly_approval_required"],
        safeMessage:
          params.run.outputMode === "storyboard_images"
            ? "ตรวจและยืนยันลำดับภาพก่อนปิดงานภาพสตอรีบอร์ด"
            : "ตรวจและยืนยันการประกอบก่อนใช้เครดิตเรนเดอร์และบันทึก Library",
        nextAction:
          params.run.outputMode === "storyboard_images"
            ? "ตรวจลำดับภาพและคำเตือน แล้วกดยืนยันการประกอบ"
            : "ตรวจลำดับภาพ วิดีโอ เสียง และคำเตือน แล้วกดยืนยันการประกอบ",
        userActionRequired: true,
        retryable: true,
      },
    },
  });
  return next;
}

export async function advanceStagedMarketplaceAutoReviewRun(params: {
  db: Db;
  run: MarketplaceAutoReviewRun;
  auth: Auth;
  runtime: Runtime;
}): Promise<{ run: MarketplaceAutoReviewRun; finalAssemblyApproved: boolean }> {
  const { plan, metadata: initialMetadata } = planAndMetadataFromRun(
    params.run
  );
  let metadata = initialMetadata;
  if (!StagedSequentialStoryboardMetadataV1Schema.safeParse(metadata).success) {
    throw new Error("staged_state_drift");
  }
  const storyCheckpoint = checkpointFor(metadata, "story_plan");
  if (
    !storyCheckpoint ||
    storyCheckpoint.state === "awaiting" ||
    storyCheckpoint.state === "rejected" ||
    storyCheckpoint.state === "superseded"
  ) {
    await upsertStage({
      db: params.db,
      runId: params.run.id,
      stageKey: "concept_story",
      status: "blocked_needs_user",
      output: {
        statusDetail: {
          state: "awaiting_story_plan_review",
          safeMessage: "ตรวจเนื้อเรื่องก่อน ระบบยังไม่ใช้เครดิตสร้างภาพ",
          userActionRequired: true,
        },
      },
    });
    return { run: params.run, finalAssemblyApproved: false };
  }
  if (
    storyCheckpoint.state === "approved" &&
    !checkpointFor(metadata, "image_prompt", 1)
  ) {
    metadata = await compileImagePromptCheckpoints({
      db: params.db,
      run: params.run,
      metadata,
      plan,
    });
    return { run: params.run, finalAssemblyApproved: false };
  }

  for (const shot of plan.shots) {
    const imageTask = taskRecord(metadata, shot.shotId, "image");
    if (
      imageTask?.taskId &&
      !metadata.stagedSequentialStoryboard.shots.find(
        item => item.shotId === shot.shotId
      )?.imageArtifactHash
    ) {
      const reconciled = await reconcileImageProvider({
        db: params.db,
        run: params.run,
        auth: params.auth,
        metadata,
        plan,
        shotId: shot.shotId,
        runtime: params.runtime,
      });
      if (reconciled) metadata = reconciled as any;
      return { run: params.run, finalAssemblyApproved: false };
    }
    const shotState = metadata.stagedSequentialStoryboard.shots.find(
      item => item.shotId === shot.shotId
    );
    const imagePromptCheckpoint = checkpointFor(
      metadata,
      "image_prompt",
      shot.shotId
    );
    if (imagePromptCheckpoint?.state === "awaiting") {
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "prompt_plan",
        status: "blocked_needs_user",
        output: {
          shotId: shot.shotId,
          statusDetail: {
            state: "awaiting_image_prompt_review",
            safeMessage: `ตรวจ Prompt ช็อตที่ ${shot.shotId} ก่อนยืนยันสร้างภาพ`,
            userActionRequired: true,
          },
        },
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (imagePromptCheckpoint?.state === "approved" && !imageTask?.taskId) {
      try {
        metadata = (await handleImageProvider({
          ...params,
          metadata,
          plan,
          shotId: shot.shotId,
        })) as unknown as typeof metadata;
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : "staged_image_provider_failed"}:shot:${shot.shotId}`
        );
      }
      return { run: params.run, finalAssemblyApproved: false };
    }
    const imageResultCheckpoint = checkpointFor(
      metadata,
      "image_result",
      shot.shotId
    );
    if (imageResultCheckpoint?.state === "awaiting") {
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "storyboard_review",
        status: "blocked_needs_user",
        output: {
          shotId: shot.shotId,
          statusDetail: {
            state: "awaiting_image_result_review",
            safeMessage: `ตรวจผลภาพช็อตที่ ${shot.shotId} ก่อนทำวิดีโอ`,
            userActionRequired: true,
          },
        },
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (
      imageResultCheckpoint?.state === "approved" &&
      !checkpointFor(metadata, "video_prompt", shot.shotId)
    ) {
      metadata = await compileVideoPrompt({
        db: params.db,
        run: params.run,
        metadata,
        plan,
        shotId: shot.shotId,
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    const videoTask = taskRecord(metadata, shot.shotId, "video");
    if (videoTask?.taskId && !shotState?.videoArtifactHash) {
      const reconciled = await reconcileVideoProvider({
        db: params.db,
        run: params.run,
        auth: params.auth,
        metadata,
        plan,
        shotId: shot.shotId,
        runtime: params.runtime,
      });
      if (reconciled) metadata = reconciled as any;
      return { run: params.run, finalAssemblyApproved: false };
    }
    const videoPromptCheckpoint = checkpointFor(
      metadata,
      "video_prompt",
      shot.shotId
    );
    if (videoPromptCheckpoint?.state === "awaiting") {
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "video_generation",
        status: "blocked_needs_user",
        output: {
          shotId: shot.shotId,
          statusDetail: {
            state: "awaiting_video_prompt_review",
            safeMessage: `ยืนยัน Prompt วิดีโอช็อตที่ ${shot.shotId} ก่อนใช้เครดิต`,
            userActionRequired: true,
          },
        },
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (videoPromptCheckpoint?.state === "approved" && !videoTask?.taskId) {
      try {
        metadata = (await handleVideoProvider({
          ...params,
          metadata,
          plan,
          shotId: shot.shotId,
        })) as unknown as typeof metadata;
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : "staged_video_provider_failed"}:shot:${shot.shotId}`
        );
      }
      return { run: params.run, finalAssemblyApproved: false };
    }
    const videoResultCheckpoint = checkpointFor(
      metadata,
      "video_result",
      shot.shotId
    );
    if (!videoResultCheckpoint && shotState?.videoArtifactHash) {
      const replacement = buildStagedCheckpoint({
        checkpointId: `video-result:${params.run.id}:shot-${shot.shotId}:r${plan.planRevision}:recovered`,
        kind: "video_result",
        shotId: shot.shotId,
        revision: shotState.revision,
        contentHash: shotState.videoArtifactHash,
        model: videoPromptCheckpoint?.approvedModel ?? STAGED_VIDEO_MODEL,
        provider:
          videoPromptCheckpoint?.approvedProvider ??
          modelProvider(STAGED_VIDEO_MODEL),
        estimatedCredits: 0,
        referenceManifestHash: plan.referenceManifestHash,
      });
      metadata = replaceCheckpoint(metadata, replacement) as any;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata: metadata as any,
        status: "running",
        currentStage: "video_generation",
        stageIndex: 7,
      });
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "video_generation",
        status: "blocked_needs_user",
        output: {
          shotId: shot.shotId,
          statusDetail: {
            state: "awaiting_video_result_review",
            safeMessage: `ตรวจผลวิดีโอช็อตที่ ${shot.shotId} ก่อนทำงานต่อ`,
            userActionRequired: true,
            retryable: true,
          },
        },
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (videoResultCheckpoint && videoResultCheckpoint.state !== "approved") {
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "video_generation",
        status: "blocked_needs_user",
        output: {
          shotId: shot.shotId,
          statusDetail: {
            state: "awaiting_video_result_review",
            safeMessage: `ตรวจผลวิดีโอช็อตที่ ${shot.shotId} ก่อนทำงานต่อ`,
            userActionRequired: true,
            retryable: true,
          },
        },
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
  }

  if (params.run.outputMode === "storyboard_images") {
    if (!allShotCheckpointsHave(metadata, "image_result", "approved")) {
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (!checkpointFor(metadata, "final_assembly")) {
      metadata = await createFinalAssemblyCheckpoint({
        db: params.db,
        run: params.run,
        metadata,
        plan,
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    const finalImageAssemblyCheckpoint = checkpointFor(
      metadata,
      "final_assembly"
    );
    if (finalImageAssemblyCheckpoint?.state === "awaiting")
      return { run: params.run, finalAssemblyApproved: false };
    if (finalImageAssemblyCheckpoint?.state === "approved") {
      const imageAssembly = finalAssemblyFor(metadata, plan);
      if (
        buildStagedFinalAssemblyHash(imageAssembly) !==
        finalImageAssemblyCheckpoint.contentHash
      ) {
        throw new Error("staged_final_assembly_hash_mismatch:assembly");
      }
      metadata = (await consumeCheckpoint({
        db: params.db,
        run: params.run,
        metadata,
        checkpoint: finalImageAssemblyCheckpoint,
        operationId: `staged-final-image-assembly-${params.run.id}-${nanoid(8)}`,
      })) as typeof metadata;
      const imageUrls = imageAssembly.shots
        .map(
          (assemblyShot: any) =>
            metadata.stagedSequentialStoryboard.shots.find(
              shot => shot.shotId === assemblyShot.shotId
            )?.imageArtifactUrl
        )
        .filter(Boolean);
      const completed = await persistRun({
        db: params.db,
        run: params.run,
        metadata,
        status: "completed",
        currentStage: "storyboard_review",
        stageIndex: 6,
        resultJson: {
          outputMode: "storyboard_images",
          imageUrls,
          mediaHistorySource: "staged_provider_media_tasks",
          finalAssemblyCheckpointId: finalImageAssemblyCheckpoint.checkpointId,
        },
        completedAt: new Date(),
      });
      return { run: completed, finalAssemblyApproved: true };
    }
    return { run: params.run, finalAssemblyApproved: false };
  }

  if (
    !allShotsHave({ metadata, state: "video_completed" }) ||
    !allShotCheckpointsHave(metadata, "video_result", "approved")
  )
    return { run: params.run, finalAssemblyApproved: false };
  const resolvedAudioStrategy =
    text(record(metadata).resolvedAudioStrategy) || "silent";
  if (resolvedAudioStrategy === "separate_tts_voiceover") {
    const audioCheckpoint = checkpointFor(metadata, "audio_plan");
    if (!audioCheckpoint) {
      const textContent = plan.shots.map(shot => shot.dialogue).join(" ");
      const audioPlan = buildStagedAudioPlan({
        text: textContent,
        language: "th",
        model: STAGED_AUDIO_MODEL,
        provider: modelProvider(STAGED_AUDIO_MODEL),
        estimatedCredits: modelCost(STAGED_AUDIO_MODEL),
      });
      metadata = {
        ...metadata,
        stagedPipeline: { ...record(metadata).stagedPipeline, audioPlan },
      } as any;
      metadata = replaceCheckpoint(
        metadata,
        buildStagedCheckpoint({
          checkpointId: `audio-plan:${params.run.id}:r${plan.planRevision}`,
          kind: "audio_plan",
          revision: plan.planRevision,
          contentHash: buildProductionStableHash(audioPlan),
          model: STAGED_AUDIO_MODEL,
          provider: modelProvider(STAGED_AUDIO_MODEL),
          estimatedCredits: modelCost(STAGED_AUDIO_MODEL),
          referenceManifestHash: plan.referenceManifestHash,
        })
      ) as any;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata: metadata as any,
        status: "running",
        currentStage: "audio_generation",
        stageIndex: 8,
      });
      await upsertStage({
        db: params.db,
        runId: params.run.id,
        stageKey: "audio_generation",
        status: "blocked_needs_user",
        output: {
          statusDetail: {
            state: "awaiting_audio_plan_review",
            safeMessage: "ตรวจสอบและยืนยันเสียงก่อนใช้เครดิตเสียง",
            userActionRequired: true,
          },
        },
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    const audioTask = taskRecord(metadata, 0, "audio");
    if (audioTask?.taskId && !record(metadata).stagedPipeline.audioUrl) {
      const token = text(params.runtime.userToken);
      if (!token) throw new Error("staged_provider_missing_user_token");
      const task = await mediaGenerationService.getTask(
        audioTask.taskId,
        token,
        {
          userId: params.auth.userId,
          traceId: `staged-audio-poll:${params.run.id}`,
          source: "marketplace_auto_review_staged",
          stage: "audio_generation",
        }
      );
      if (task.status === "pending" || task.status === "processing")
        return { run: params.run, finalAssemblyApproved: false };
      if (task.status !== "completed" || !text(task.resultUrl))
        throw new Error("staged_audio_provider_failed:audio");
      metadata = {
        ...metadata,
        audioUrl: text(task.resultUrl),
        stagedPipeline: {
          ...record(metadata).stagedPipeline,
          audioUrl: text(task.resultUrl),
        },
      } as any;
      metadata = updateTaskRecord(metadata as any, "audio:0", {
        status: "completed",
        resultUrl: text(task.resultUrl),
        completedAt: new Date().toISOString(),
      }) as unknown as typeof metadata;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata: metadata as any,
        status: "running",
        currentStage: "audio_generation",
        stageIndex: 8,
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
    if (audioCheckpoint.state === "awaiting")
      return { run: params.run, finalAssemblyApproved: false };
    if (audioCheckpoint.state === "approved" && !audioTask?.taskId) {
      const currentAudioPlan = record(metadata).stagedPipeline.audioPlan;
      if (
        buildStagedFinalAssemblyHash(currentAudioPlan) !==
        audioCheckpoint.contentHash
      ) {
        throw new Error("staged_audio_plan_hash_mismatch:audio");
      }
      const operationId = `staged-audio-${params.run.id}-${nanoid(8)}`;
      metadata = (await consumeCheckpoint({
        db: params.db,
        run: params.run,
        metadata,
        checkpoint: audioCheckpoint,
        operationId,
      })) as typeof metadata;
      const audioPlan = record(metadata).stagedPipeline.audioPlan;
      let submitted;
      try {
        submitted = await reserveAndSubmit({
          db: params.db,
          run: params.run,
          auth: params.auth,
          runtime: params.runtime,
          mediaType: "audio",
          unitId: "full-voiceover",
          model: STAGED_AUDIO_MODEL,
          estimatedCredits: modelCost(STAGED_AUDIO_MODEL),
          description: "Marketplace staged storyboard voiceover",
          request: {
            text: audioPlan.text,
            model: STAGED_AUDIO_MODEL,
            voice: "alloy",
            speed: 1,
            auditContext: {
              userId: params.auth.userId,
              traceId: operationId,
              source: "marketplace_auto_review_staged",
              stage: "audio_generation",
            },
          },
        });
      } catch (error) {
        throw new Error(
          `${error instanceof Error ? error.message : "staged_audio_provider_failed"}:audio`
        );
      }
      metadata = setTaskRecord(metadata as any, "audio:0", {
        taskId: submitted.task.id,
        operationId,
        submittedAt: new Date().toISOString(),
        creditAmount: submitted.amount,
        creditTransactionId: submitted.transactionId,
        creditIdempotencyKey: submitted.creditIdempotencyKey,
      }) as unknown as typeof metadata;
      await persistRun({
        db: params.db,
        run: params.run,
        metadata,
        status: "waiting_provider",
        currentStage: "audio_generation",
        stageIndex: 8,
      });
      return { run: params.run, finalAssemblyApproved: false };
    }
  }
  if (!checkpointFor(metadata, "final_assembly")) {
    metadata = await createFinalAssemblyCheckpoint({
      db: params.db,
      run: params.run,
      metadata,
      plan,
    });
    return { run: params.run, finalAssemblyApproved: false };
  }
  const finalCheckpoint = checkpointFor(metadata, "final_assembly");
  if (finalCheckpoint?.state === "awaiting")
    return { run: params.run, finalAssemblyApproved: false };
  if (finalCheckpoint?.state === "approved") {
    const currentAssembly = finalAssemblyFor(metadata, plan);
    if (
      buildStagedFinalAssemblyHash(currentAssembly) !==
      finalCheckpoint.contentHash
    ) {
      throw new Error("staged_final_assembly_hash_mismatch:assembly");
    }
    metadata = (await consumeCheckpoint({
      db: params.db,
      run: params.run,
      metadata,
      checkpoint: finalCheckpoint,
      operationId: `staged-final-assembly-${params.run.id}-${nanoid(8)}`,
    })) as typeof metadata;
    metadata = {
      ...metadata,
      videoClipUrls: currentAssembly.shots
        .map(
          (assemblyShot: any) =>
            metadata.stagedSequentialStoryboard.shots.find(
              shot => shot.shotId === assemblyShot.shotId
            )?.videoArtifactUrl
        )
        .filter(Boolean),
    } as typeof metadata;
    await persistRun({
      db: params.db,
      run: params.run,
      metadata,
      status: "running",
      currentStage: "render",
      stageIndex: 10,
    });
    return { run: params.run, finalAssemblyApproved: true };
  }
  return { run: params.run, finalAssemblyApproved: false };
}

export function stagedCheckpointExpectationForTest(
  checkpoint: HumanApprovalCheckpointV1
) {
  return checkpointExpectation(checkpoint);
}
