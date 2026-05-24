import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  mediaProductionApprovals,
  mediaProductionAssetPlans,
  mediaProductionGoalVersions,
  mediaProductionOutputProjections,
  mediaProductionPlanVerifications,
  mediaProductionPlanVersions,
  mediaProductionRuns,
  mediaProductionSpaces,
  mediaStudioStoryboardReviews,
  videoEditorProjects,
} from "../../drizzle/schema";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  buildProductionOutputProjectionIdentity,
  buildProductionStableHash,
  computeProductionSpaceReadiness,
  deriveProductionHandoffPayload,
  evaluateProductionAssetPlanReadiness,
  getProductionLayerVersions,
  getProductionNodeCatalogEntry,
  isProductionNodeKind,
  validateProductionSpace,
  validateProductionRunTransition,
  type ProductStoryboardAsset,
  type ProductionNodeConfigSnapshot,
  type ProductionNodeKind,
  type ProductionNodeOutputRef,
  type ProductionNodeStatus,
  type ProductionDownstreamResultImport,
  type ProductionShotProductUse,
  type ProductionShot,
  type ProductionSpace,
  type ProductionAssetPlan,
  type ProductionGoal,
  type ProductionRunStatus,
} from "../../shared/mediaProduction";
import {
  archiveProductionSpace,
  cancelProductionExecution,
  deleteProductionSpace,
  getProductionNodeConfig,
  getProductionSpace,
  importProductionDownstreamResult,
  isProductionSpaceStorageUnavailable,
  previewProductionExecutionPlan,
  redactProductionSpaceExport,
  reconcilePendingProductionExecutions,
  reconcileProductionExecution,
  reconcileProductionProviderCallback,
  repairProductionStaleOutputRefs,
  restoreProductionSpace,
  saveProductionBrief,
  saveProductionNodeConfig,
  saveProductionShot,
  saveProductionShotProductUse,
  saveProductionSpace,
  scheduleProductionExecution,
  updateProductionProductStoryboardAsset,
} from "../services/productionSpaceService";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const unknownRecordSchema = z.record(z.string(), z.unknown());
const productionPayloadSchema = unknownRecordSchema;
const productionNodeStatusSchema = z.enum([
  "draft",
  "needs_config",
  "ready",
  "queued",
  "reserving_credits",
  "warning",
  "blocked",
  "approved",
  "running",
  "completed",
  "qa_running",
  "qa_passed",
  "qa_warning",
  "needs_revision",
  "failed",
  "cancelled",
  "disabled",
] satisfies [ProductionNodeStatus, ...ProductionNodeStatus[]]);
const productionNodeKindSchema = z.custom<ProductionNodeKind>(
  (value) => isProductionNodeKind(value),
  { message: "Unsupported production node kind" },
);
const productionGoalSchema: z.ZodType<ProductionGoal> = z.object({
  title: z.string().max(256).optional(),
  summary: z.string().max(20_000),
  goalType: z.string().max(80).optional(),
  audience: z.string().max(256).optional(),
  platform: z.string().max(120).optional(),
  durationSeconds: z.number().finite().positive().max(86_400).optional(),
  aspectRatio: z.string().max(80).optional(),
  language: z.string().max(80).optional(),
  brandTruth: z.string().max(20_000).optional(),
  creativeDirection: z.string().max(20_000).optional(),
  constraintsText: z.string().max(20_000).optional(),
  productContext: unknownRecordSchema.optional(),
  characterContext: unknownRecordSchema.optional(),
  voiceAudioStrategy: unknownRecordSchema.optional(),
  visualStyle: unknownRecordSchema.optional(),
  constraints: unknownRecordSchema.optional(),
  tabSnapshots: unknownRecordSchema.optional(),
  contractVersion: z.string().max(64).optional(),
}).passthrough() as unknown as z.ZodType<ProductionGoal>;
const productionReferenceSchema = z.object({
  id: z.string().min(1).max(256),
  kind: z.string().min(1).max(64),
  title: z.string().min(1).max(512),
  url: z.string().max(4096).optional(),
  thumbnailUrl: z.string().max(4096).optional(),
  assetId: z.string().max(256).optional(),
  outputRefId: z.string().max(256).optional(),
  source: z.string().min(1).max(256),
  provenance: unknownRecordSchema.optional(),
  providerPayloadKey: z.string().max(256).optional(),
  referenceUnitWeight: z.number().finite().optional(),
  zone: z.enum(["cast", "products", "scene_mood", "audio", "generated", "targets"]).optional(),
  role: z.string().max(120).optional(),
  locked: z.boolean().optional(),
  warnings: z.array(z.string().max(1000)).optional(),
  approvalState: z.enum(["approved", "needs_review", "blocked"]).optional(),
  sku: z.string().max(256).optional(),
  variantId: z.string().max(256).optional(),
}).passthrough();
const productionNodeConfigSchema: z.ZodType<ProductionNodeConfigSnapshot> = z.object({
  snapshotId: z.string().min(1).max(256),
  version: z.number().int().nonnegative(),
  toolSurface: z.enum(["production", "image", "video", "audio", "storyboard_review", "video_edit"]),
  adapter: z.enum(["image", "video", "tts", "preview_only", "disabled"]),
  config: unknownRecordSchema,
  configHash: z.string().min(1).max(256),
  manuallyEdited: z.boolean().optional(),
  createdAt: z.string().max(128).optional(),
  updatedAt: z.string().max(128).optional(),
}).passthrough() as unknown as z.ZodType<ProductionNodeConfigSnapshot>;
const productionNodeToolBindingSchema = z.object({
  bindingId: z.string().min(1).max(256),
  nodeKind: productionNodeKindSchema,
  toolSurface: z.enum(["production", "image", "video", "audio", "storyboard_review", "video_edit"]),
  adapter: z.enum(["image", "video", "tts", "preview_only", "disabled"]),
  adapterStatus: z.enum(["mvp_enabled", "preview_only", "deferred"]),
  requiresConfirmation: z.boolean(),
  generationCreditRisk: z.enum(["none", "requires_explicit_confirmation"]),
  supportedInMvp: z.boolean(),
}).superRefine((binding, ctx) => {
  const catalogEntry = getProductionNodeCatalogEntry(binding.nodeKind);
  if (!catalogEntry) return;
  if (
    catalogEntry.adapterStatus !== binding.adapterStatus
    || catalogEntry.toolSurface !== binding.toolSurface
    || catalogEntry.adapter !== binding.adapter
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Production node tool binding does not match catalog metadata",
      path: ["adapterStatus"],
    });
  }
});
const productionOutputRefSchema: z.ZodType<ProductionNodeOutputRef> = z.object({
  outputRefId: z.string().min(1).max(256),
  nodeId: z.string().min(1).max(256),
  kind: z.enum(["image", "video", "audio", "caption", "manifest", "project"]),
  url: z.string().max(4096).optional(),
  thumbnailUrl: z.string().max(4096).optional(),
  storageKey: z.string().max(1024).optional(),
  libraryItemId: z.string().max(256).optional(),
  mediaTaskId: z.string().max(256).optional(),
  mediaId: z.string().max(256).optional(),
  providerTaskId: z.string().max(256).optional(),
  configHash: z.string().max(256).optional(),
  generatedAt: z.string().max(128).optional(),
  metadata: unknownRecordSchema.optional(),
}).passthrough() as unknown as z.ZodType<ProductionNodeOutputRef>;
const productionNodeSchema = z.object({
  id: z.string().min(1).max(256),
  kind: productionNodeKindSchema,
  title: z.string().min(1).max(512),
	  status: productionNodeStatusSchema,
	  shotId: z.string().max(256).optional(),
	  toolBindingId: z.string().max(256).optional(),
	  toolBinding: productionNodeToolBindingSchema.optional(),
	  configSnapshot: productionNodeConfigSchema.optional(),
  referenceInputs: z.array(productionReferenceSchema).optional(),
  outputRefs: z.array(productionOutputRefSchema).optional(),
  readinessIssues: z.array(z.string().max(1000)).optional(),
  estimatedCredits: z.number().finite().nonnegative().optional(),
  position: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
  locked: z.boolean().optional(),
  approvedAt: z.string().max(128).optional(),
  metadata: unknownRecordSchema.optional(),
  collapsed: z.boolean().optional(),
});
const productionShotSchema: z.ZodType<ProductionShot> = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(512),
  order: z.number().int().nonnegative(),
  durationSeconds: z.number().finite().positive().max(86_400).optional(),
  version: z.number().int().nonnegative().optional(),
  storyBeat: z.string().max(10_000).optional(),
  shotType: z.enum(["hook", "problem", "proof", "demo", "transition", "cta", "broll", "interview", "custom"]).optional(),
  cameraIntent: z.string().max(10_000).optional(),
  sourceVideoControl: unknownRecordSchema.optional(),
  characterAssetIds: z.array(z.string().min(1).max(256)).optional(),
  customerJourneyStage: z.string().max(256).optional(),
  mustShow: z.array(z.string().max(1000)).optional(),
  mustAvoid: z.array(z.string().max(1000)).optional(),
  script: z.string().max(100_000).optional(),
  visualIntent: z.string().max(20_000).optional(),
  audioIntent: z.string().max(20_000).optional(),
  productAssetIds: z.array(z.string().min(1).max(256)).optional(),
  nodeIds: z.array(z.string().min(1).max(256)),
  locked: z.boolean().optional(),
  status: z.enum(["draft", "ready", "blocked", "approved", "completed"]).optional(),
}) as unknown as z.ZodType<ProductionShot>;
const productionEdgeSchema = z.object({
  id: z.string().min(1).max(256),
  source: z.string().min(1).max(256),
  target: z.string().min(1).max(256),
  label: z.string().max(512).optional(),
  kind: z.enum(["dependency", "reference", "handoff", "qa", "uses_asset", "requires_before", "generates_for", "qa_of", "approval_gate", "handoff_to", "fallback_to"]).optional(),
}).passthrough();
const productClaimEvidenceSchema = z.object({
  claimId: z.string().min(1).max(256),
  evidenceIds: z.array(z.string().min(1).max(256)),
  status: z.enum(["approved", "needs_review", "blocked"]),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
});
const productStoryboardAssetSchema = z.object({
  id: z.string().min(1).max(256),
  productId: z.string().min(1).max(256),
  title: z.string().min(1).max(512),
  imageUrl: z.string().max(4096).optional(),
  sku: z.string().max(256).optional(),
  variantId: z.string().max(256).optional(),
  approvalState: z.enum(["approved", "needs_review", "blocked"]).optional(),
  role: z.enum(["hero", "detail", "use_case", "review", "comparison", "background", "packshot", "label_close_up", "texture_detail", "before_after", "cta_end_card"]).optional(),
  frameStrategy: z.enum(["image_reference", "start_frame", "stop_frame", "start_and_stop", "packshot_insert"]).optional(),
  requiredVisualAccuracy: z.enum(["standard", "high", "strict"]).optional(),
  reviewNotes: z.array(z.string().max(1000)).optional(),
  claimEvidence: z.array(productClaimEvidenceSchema),
  provenance: unknownRecordSchema.optional(),
});
const productionProductEvidenceManifestSchema = z.object({
  manifestId: z.string().min(1).max(256),
  products: z.array(productStoryboardAssetSchema),
  requiredClaimIds: z.array(z.string().min(1).max(256)),
  status: z.enum(["ready", "warning", "blocked"]),
  warnings: z.array(z.string().max(1000)),
});
const productionSpaceSchema: z.ZodType<ProductionSpace> = z.object({
  schemaVersion: z.literal("1.0.0"),
  productionRunId: z.string().min(1).max(256),
  version: z.number().int().nonnegative(),
  status: z.enum(["goal_draft", "goal_ready", "plan_generating", "plan_ready_for_review", "plan_verifying", "plan_verification_failed", "plan_needs_revision", "plan_approved", "production_bible_ready", "asset_plan_ready", "asset_generation_running", "asset_qa_failed", "asset_qa_passed", "storyboard_ready", "quality_gate_running", "quality_gate_passed", "quality_gate_needs_revision", "human_review_required", "final_provider_selected", "final_preflight_passed", "final_generating", "final_qa_failed", "final_qa_passed", "revision_running", "completed", "cancelled", "failed"]),
  brief: productionGoalSchema,
  shots: z.array(productionShotSchema),
  flowNodes: z.array(productionNodeSchema),
  flowEdges: z.array(productionEdgeSchema),
  contextAssets: z.array(productionReferenceSchema),
  productEvidenceManifest: productionProductEvidenceManifestSchema.optional(),
  shotProductUsage: z.array(unknownRecordSchema).optional(),
  actionAttempts: z.array(unknownRecordSchema).optional(),
	  auditEvents: z.array(unknownRecordSchema).optional(),
	  metrics: unknownRecordSchema.optional(),
	  planningSelection: unknownRecordSchema.optional(),
	  layerVersions: unknownRecordSchema.optional(),
  approvalState: unknownRecordSchema.optional(),
  downstreamResultRecords: z.array(unknownRecordSchema).optional(),
  cues: z.array(unknownRecordSchema).optional(),
  warnings: z.array(z.string().max(1000)).optional(),
  featureFlags: z.record(z.string(), z.boolean()).optional(),
  accessPolicy: z.object({
    ownerUserId: z.number().int().positive().optional(),
    collaborators: z.array(z.object({
      userId: z.number().int().positive(),
      level: z.enum(["read", "write", "approve", "execute", "owner"]),
      canApprove: z.boolean().optional(),
      canExecute: z.boolean().optional(),
    })).optional(),
    approvalRequired: z.boolean().optional(),
    approvedByUserIds: z.array(z.number().int().positive()).optional(),
  }).optional(),
  updatedAt: z.string().max(128).optional(),
}) as unknown as z.ZodType<ProductionSpace>;
const productionShotProductUseSchema: z.ZodType<ProductionShotProductUse> = z.object({
  shotId: z.string().min(1).max(256),
  productStoryboardAssetIds: z.array(z.string().min(1).max(256)),
  claimIds: z.array(z.string().min(1).max(256)),
  evidenceIds: z.array(z.string().min(1).max(256)),
  customerJourneyStage: z.string().max(256).optional(),
  frameStrategy: z.enum(["image_reference", "start_frame", "stop_frame", "start_and_stop", "packshot_insert"]).optional(),
  requiredVisualAccuracy: z.enum(["standard", "high", "strict"]).optional(),
  mustShow: z.array(z.string().max(1000)).optional(),
  mustAvoid: z.array(z.string().max(1000)).optional(),
  qaStatus: z.enum(["pending", "pass", "warning", "blocked"]).optional(),
  warnings: z.array(z.string().max(1000)).optional(),
}).passthrough() as unknown as z.ZodType<ProductionShotProductUse>;
const productionProductPatchSchema: z.ZodType<Partial<ProductStoryboardAsset>> = z.object({
  role: z.enum(["hero", "detail", "use_case", "review", "comparison", "background", "packshot", "label_close_up", "texture_detail", "before_after", "cta_end_card"]).optional(),
  frameStrategy: z.enum(["image_reference", "start_frame", "stop_frame", "start_and_stop", "packshot_insert"]).optional(),
  requiredVisualAccuracy: z.enum(["standard", "high", "strict"]).optional(),
  claimEvidence: z.array(unknownRecordSchema).optional(),
  imageUrl: z.string().max(4096).optional(),
  provenance: unknownRecordSchema.optional(),
}).passthrough() as unknown as z.ZodType<Partial<ProductStoryboardAsset>>;
const productionSurfaceSchema = z.enum(["storyboard_review", "video_edit"]);
const productionExecutionScopeSchema = z.enum(["node", "shot", "batch"]);
const productionCueSchema = z.object({
  id: z.string().min(1).max(256),
  shotId: z.string().min(1).max(256),
  startSeconds: z.number().finite().nonnegative(),
  endSeconds: z.number().finite().nonnegative(),
  kind: z.enum(["shot", "caption", "audio", "transition", "product"]),
  label: z.string().min(1).max(1000),
  metadata: unknownRecordSchema.optional(),
}).passthrough();
const productionDownstreamResultImportSchema: z.ZodType<ProductionDownstreamResultImport> = z.object({
  recordId: z.string().min(1).max(256),
  sourceSpaceVersion: z.number().int().nonnegative(),
  target: productionSurfaceSchema,
  selectedTakeRefs: z.array(productionOutputRefSchema).optional(),
  timelineCueUpdates: z.array(productionCueSchema).optional(),
  captionUpdates: z.array(productionCueSchema).optional(),
  productWarningResolutions: z.array(z.object({
    productAssetId: z.string().min(1).max(256),
    claimId: z.string().min(1).max(256).optional(),
    status: z.enum(["approved", "needs_review", "blocked"]),
    warning: z.string().max(2000).optional(),
  }).passthrough()).optional(),
  manualApprovals: z.array(z.object({
    targetId: z.string().min(1).max(256),
    targetKind: z.enum(["shot", "node", "product", "cue"]),
    approved: z.boolean(),
    note: z.string().max(2000).optional(),
  }).passthrough()).optional(),
  warnings: z.array(z.string().max(1000)).optional(),
  allowLockedUpdates: z.boolean().optional(),
}).passthrough() as unknown as z.ZodType<ProductionDownstreamResultImport>;
const stringArraySchema = z.array(z.string().min(1).max(256)).default([]);
const mediaTaskStatusSchema = z.enum(["pending", "processing", "completed", "failed", "cancelled"]);
const productionMediaTaskSchema = z.object({
  id: z.string().min(1).max(256),
  taskId: z.string().max(256).optional(),
  celeryTaskId: z.string().max(256).optional(),
  userId: z.string().max(256),
  mediaType: z.enum(["image", "video", "audio"]),
  status: mediaTaskStatusSchema,
  model: z.string().max(256),
  prompt: z.string().max(20_000),
  parameters: unknownRecordSchema.optional(),
  resultUrl: z.string().max(4096).optional(),
  resultData: unknownRecordSchema.optional(),
  errorMessage: z.string().max(4096).optional(),
  creditsUsed: z.number().finite().nonnegative().optional(),
  creditsBalance: z.number().finite().optional(),
  createdAt: z.string().max(128),
  startedAt: z.string().max(128).optional(),
  completedAt: z.string().max(128).optional(),
});

async function getExistingRun(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tenantId: string,
  userId: number,
  productionRunId: string,
) {
  const [run] = await db
    .select({
      id: mediaProductionRuns.id,
      tenantId: mediaProductionRuns.tenantId,
      userId: mediaProductionRuns.userId,
      productionRunId: mediaProductionRuns.productionRunId,
      status: mediaProductionRuns.status,
      goal: mediaProductionRuns.goal,
      productionBible: mediaProductionRuns.productionBible,
      assetPlan: mediaProductionRuns.assetPlan,
      createdAt: mediaProductionRuns.createdAt,
      updatedAt: mediaProductionRuns.updatedAt,
    })
    .from(mediaProductionRuns)
    .where(and(
      eq(mediaProductionRuns.tenantId, tenantId),
      eq(mediaProductionRuns.userId, userId),
      eq(mediaProductionRuns.productionRunId, productionRunId),
    ))
    .limit(1);
  return run;
}

async function assertRunWritableByUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tenantId: string,
  userId: number,
  productionRunId: string,
) {
  const [run] = await db
    .select({ userId: mediaProductionRuns.userId })
    .from(mediaProductionRuns)
    .where(and(
      eq(mediaProductionRuns.tenantId, tenantId),
      eq(mediaProductionRuns.productionRunId, productionRunId),
    ))
    .limit(1);
  if (run && Number(run.userId) !== userId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Production run is owned by another user" });
  }
}

async function getNextVersion(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  table: typeof mediaProductionGoalVersions | typeof mediaProductionPlanVersions,
  tenantId: string,
  productionRunId: string,
): Promise<number> {
  const [latest] = await db
    .select({ version: table.version })
    .from(table)
    .where(and(
      eq(table.tenantId, tenantId),
      eq(table.productionRunId, productionRunId),
    ))
    .orderBy(desc(table.version))
    .limit(1);
  return Number(latest?.version ?? 0) + 1;
}

function buildProductionName(payload: Record<string, unknown>, fallback: string): string {
  const title = String(payload.title ?? payload.name ?? payload.productionTitle ?? "").trim();
  if (title) return title.slice(0, 256);
  const summary = String(payload.summary ?? payload.goalSummary ?? "").trim();
  if (summary) return summary.slice(0, 80);
  return fallback;
}

function extractProductionClips(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = [
    payload.clips,
    payload.tasks,
    payload.prompt_sequence,
    payload.scene_timeline,
    payload.storyboard_outline,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item, index) => ({
        ...(item && typeof item === "object" ? item as Record<string, unknown> : { value: item }),
        id: String((item as any)?.id ?? (item as any)?.clip_id ?? (item as any)?.scene_id ?? `clip-${index + 1}`),
        index,
        order: Number((item as any)?.order ?? (item as any)?.index ?? index),
      }));
    }
  }
  return [];
}

export const mediaProductionRouter = router({
  getSpace: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const result = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
      if (!result) return null;
      return {
        ...result,
        validation: validateProductionSpace(result.space),
        readiness: computeProductionSpaceReadiness(result.space),
      };
    }),

  saveSpace: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      space: productionSpaceSchema,
      changedFields: stringArraySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return saveProductionSpace({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        space: input.space,
        changedFields: input.changedFields,
      });
    }),

  saveBrief: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      expectedBriefVersion: z.number().int().nonnegative().optional(),
      brief: productionGoalSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return saveProductionBrief({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        expectedBriefVersion: input.expectedBriefVersion,
        brief: input.brief as any,
      });
    }),

  saveShot: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      expectedShotVersion: z.number().int().nonnegative().optional(),
      shot: productionShotSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return saveProductionShot({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        expectedShotVersion: input.expectedShotVersion,
        shot: input.shot,
      });
    }),

  saveNodeConfig: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      nodeId: z.string().min(1).max(128),
      configSnapshot: productionNodeConfigSchema,
      expectedNodeVersion: z.number().int().nonnegative().optional(),
      previousConfigSnapshotId: z.string().min(1).max(128).optional(),
      outputRefs: z.array(productionOutputRefSchema).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return saveProductionNodeConfig({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        nodeId: input.nodeId,
        configSnapshot: input.configSnapshot,
        expectedNodeVersion: input.expectedNodeVersion,
        previousConfigSnapshotId: input.previousConfigSnapshotId,
        outputRefs: input.outputRefs as any,
      });
    }),

  getNodeConfig: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      nodeId: z.string().min(1).max(128),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return getProductionNodeConfig({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        nodeId: input.nodeId,
      });
    }),

  archiveSpace: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return archiveProductionSpace({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
      });
    }),

  restoreSpace: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return restoreProductionSpace({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
      });
    }),

  deleteSpace: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return deleteProductionSpace({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
      });
    }),

  saveCanvasLayout: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      expectedLayoutVersion: z.number().int().nonnegative().optional(),
      layout: z.record(z.object({ x: z.number(), y: z.number() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const current = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
      if (current.archivedAt || current.deletedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: current.deletedAt ? "production_space_deleted" : "production_space_archived_read_only",
        });
      }
      const currentLayoutVersion = getProductionLayerVersions(current.space).canvasLayoutVersion;
      if (input.expectedLayoutVersion !== undefined && input.expectedLayoutVersion !== currentLayoutVersion) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "layout_version_stale",
          cause: {
            schemaVersion: "production_conflict_v1",
            reason: "layout_version_stale",
            productionRunId: input.productionRunId,
            expected: { layoutVersion: input.expectedLayoutVersion },
            current: { layoutVersion: currentLayoutVersion, spaceVersion: current.version },
            changedFields: ["flowNodes.position"],
            safePreview: {
              status: current.space.status,
              title: current.space.brief.title,
              updatedAt: current.space.updatedAt,
              source: current.source,
              archived: Boolean(current.archivedAt),
              deleted: Boolean(current.deletedAt),
              canReloadLatest: true,
              canSaveAsNewVersion: !current.deletedAt,
              canAutoMergeLayout: true,
            },
          },
        });
      }
      return saveProductionSpace({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        space: {
          ...current.space,
          flowNodes: current.space.flowNodes.map((node) => ({
            ...node,
            position: input.layout[node.id] ?? node.position,
          })),
        },
        changeKind: "layout",
        changedFields: ["flowNodes.position"],
      });
    }),

  validateSpace: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      space: productionSpaceSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const space = input.space ?? (await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId }))?.space;
      if (!space) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
      return {
        validation: validateProductionSpace(space),
        readiness: computeProductionSpaceReadiness(space),
      };
    }),

  previewHandoff: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      target: productionSurfaceSchema,
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const current = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
      if (current.archivedAt || current.deletedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: current.deletedAt ? "production_space_deleted" : "production_space_archived_read_only",
        });
      }
      return deriveProductionHandoffPayload(current.space, input.target, { tenantId });
    }),

  previewExecutionPlan: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      target: productionSurfaceSchema.optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const preview = await previewProductionExecutionPlan({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        target: input.target,
      });
      if (!preview) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
      return preview;
    }),

  importDownstreamResult: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      result: productionDownstreamResultImportSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return importProductionDownstreamResult({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        result: input.result,
      });
    }),

  runExecution: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      scope: productionExecutionScopeSchema,
      targetId: z.string().min(1).max(128).optional(),
      confirmed: z.boolean().default(false),
      retryOfAttemptId: z.string().min(1).max(256).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return scheduleProductionExecution({
        db,
        tenantId,
        userId: ctx.user.id,
        userToken: (ctx as any).userToken,
        publicUrl: (ctx as any).publicUrl,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        scope: input.scope,
        targetId: input.targetId,
        confirmed: input.confirmed,
        retryOfAttemptId: input.retryOfAttemptId,
      });
    }),

  cancelExecution: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      attemptId: z.string().min(1).max(256),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return cancelProductionExecution({
        db,
        tenantId,
        userId: ctx.user.id,
        userToken: (ctx as any).userToken,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        attemptId: input.attemptId,
      });
    }),

  reconcileExecution: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      attemptId: z.string().min(1).max(256),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return reconcileProductionExecution({
        db,
        tenantId,
        userId: ctx.user.id,
        userToken: (ctx as any).userToken,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        attemptId: input.attemptId,
      });
    }),

  reconcileProviderCallback: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative().optional(),
      attemptId: z.string().min(1).max(256).optional(),
      task: productionMediaTaskSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return reconcileProductionProviderCallback({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        attemptId: input.attemptId,
        task: input.task,
      });
    }),

  reconcilePendingExecutions: protectedProcedure
    .input(z.object({
      limit: z.number().int().positive().max(100).default(25),
    }).default({ limit: 25 }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return reconcilePendingProductionExecutions({
        db,
        tenantId,
        userId: ctx.user.id,
        userToken: (ctx as any).userToken,
        limit: input.limit,
      });
    }),

  retryExecution: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      retryOfAttemptId: z.string().min(1).max(256),
      scope: productionExecutionScopeSchema,
      targetId: z.string().min(1).max(128).optional(),
      confirmed: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return scheduleProductionExecution({
        db,
        tenantId,
        userId: ctx.user.id,
        userToken: (ctx as any).userToken,
        publicUrl: (ctx as any).publicUrl,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        scope: input.scope,
        targetId: input.targetId,
        confirmed: input.confirmed,
        retryOfAttemptId: input.retryOfAttemptId,
      });
    }),

  saveShotProductUse: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      shotProductUse: productionShotProductUseSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return saveProductionShotProductUse({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        shotProductUse: input.shotProductUse,
      });
    }),

  updateProductStoryboardAsset: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
      productAssetId: z.string().min(1).max(128),
      action: z.enum(["update_role", "link_claim", "link_evidence", "relink_image", "request_more_evidence"]),
      patch: productionProductPatchSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return updateProductionProductStoryboardAsset({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
        productAssetId: input.productAssetId,
        action: input.action,
        patch: input.patch as any,
      });
    }),

  repairStaleOutputRefs: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      return repairProductionStaleOutputRefs({
        db,
        tenantId,
        userId: ctx.user.id,
        productionRunId: input.productionRunId,
        expectedVersion: input.expectedVersion,
      });
    }),

  exportSpace: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const current = await getProductionSpace({ db, tenantId, userId: ctx.user.id, productionRunId: input.productionRunId });
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Production space not found" });
      if (current.deletedAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "production_space_deleted" });
      return {
        exportedAt: new Date().toISOString(),
        productionRunId: input.productionRunId,
        version: current.version,
        space: redactProductionSpaceExport(current.space),
      };
    }),

  listRuns: protectedProcedure
    .input(z.object({
      query: z.string().max(120).optional(),
      includeArchived: z.boolean().default(false),
      includeDeleted: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(30),
    }).default({ limit: 30 }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });

      const rows = await db
        .select({
          id: mediaProductionRuns.id,
          tenantId: mediaProductionRuns.tenantId,
          userId: mediaProductionRuns.userId,
          productionRunId: mediaProductionRuns.productionRunId,
          status: mediaProductionRuns.status,
          goal: mediaProductionRuns.goal,
          productionBible: mediaProductionRuns.productionBible,
          assetPlan: mediaProductionRuns.assetPlan,
          createdAt: mediaProductionRuns.createdAt,
          updatedAt: mediaProductionRuns.updatedAt,
        })
        .from(mediaProductionRuns)
        .where(and(
          eq(mediaProductionRuns.tenantId, tenantId),
          eq(mediaProductionRuns.userId, ctx.user.id),
        ))
        .orderBy(desc(mediaProductionRuns.updatedAt))
        .limit(Math.min(Math.max(input.limit * 3, input.limit), 100));

      const query = String(input.query ?? "").trim().toLowerCase();
      let spaceRows: any[] = [];
      try {
        spaceRows = await db
          .select()
          .from(mediaProductionSpaces)
          .where(and(
            eq(mediaProductionSpaces.tenantId, tenantId),
            eq(mediaProductionSpaces.userId, ctx.user.id),
          ))
          .orderBy(desc(mediaProductionSpaces.updatedAt))
          .limit(300);
      } catch (error) {
        if (!isProductionSpaceStorageUnavailable(error)) throw error;
      }
      const latestSpaceByRun = new Map<string, any>();
      for (const row of spaceRows as any[]) {
        if (!latestSpaceByRun.has(row.productionRunId)) latestSpaceByRun.set(row.productionRunId, row);
      }
      const mapped = rows.map((run) => {
        const latestSpace = latestSpaceByRun.get(run.productionRunId);
        const space = latestSpace?.space as ProductionSpace | undefined;
        const goal = (run.goal && typeof run.goal === "object") ? run.goal as Record<string, any> : {};
        const brief = space?.brief ?? (goal.productionSpaceBrief && typeof goal.productionSpaceBrief === "object" ? goal.productionSpaceBrief as Record<string, any> : {});
        const tabSnapshots = (goal.tabSnapshots && typeof goal.tabSnapshots === "object")
          ? goal.tabSnapshots as Record<string, any>
          : {};
        const generatedMedia = Array.isArray(tabSnapshots.generatedMedia) ? tabSnapshots.generatedMedia : [];
        const mediaPreview = generatedMedia.find((item: any) =>
          item?.url && (item?.type === "image" || item?.type === "video")
        );
        const planClips = extractProductionClips(run.productionBible ?? {});
        const planPreview = planClips.find((clip: any) => clip?.thumbnailUrl || clip?.url);
        const title = String(
          brief.title
          ?? goal.title
          ?? goal.projectTitle
          ?? brief.summary
          ?? goal.summary
          ?? run.productionRunId,
        ).trim();
        const summary = String(brief.summary ?? goal.summary ?? goal.goalSummary ?? "").trim();
        return {
          productionRunId: run.productionRunId,
          title,
          summary,
          status: space?.status ?? run.status,
          version: Number(latestSpace?.version ?? space?.version ?? (run as any).planVersion ?? (run as any).goalVersion ?? 0),
          goalVersion: (run as any).goalVersion ?? null,
          planVersion: (run as any).planVersion ?? null,
          thumbnailUrl: String(mediaPreview?.thumbnailUrl ?? mediaPreview?.url ?? (planPreview as any)?.thumbnailUrl ?? (planPreview as any)?.url ?? "").trim() || null,
          updatedAt: latestSpace?.updatedAt ?? space?.updatedAt ?? run.updatedAt,
          createdAt: run.createdAt,
          platform: String(brief.platform ?? goal.platform ?? "").trim() || null,
          audience: String(brief.audience ?? goal.audience ?? "").trim() || null,
          archivedAt: latestSpace?.archivedAt ?? null,
          deletedAt: latestSpace?.deletedAt ?? null,
          lifecycle: latestSpace?.deletedAt ? "deleted" : latestSpace?.archivedAt ? "archived" : "active",
        };
      });

      return {
        runs: mapped
          .filter((run) => input.includeArchived || !run.archivedAt)
          .filter((run) => input.includeDeleted || !run.deletedAt)
          .filter((run) => !query || [
            run.productionRunId,
            run.title,
            run.summary,
            run.status,
            run.platform ?? "",
            run.audience ?? "",
          ].join(" ").toLowerCase().includes(query))
          .slice(0, input.limit),
      };
    }),

  getRun: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });

      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) return null;

      const [latestPlan] = await db
        .select()
        .from(mediaProductionPlanVersions)
        .where(and(
          eq(mediaProductionPlanVersions.tenantId, tenantId),
          eq(mediaProductionPlanVersions.productionRunId, input.productionRunId),
        ))
        .orderBy(desc(mediaProductionPlanVersions.version))
        .limit(1);
      const [latestVerification] = latestPlan
        ? await db
          .select()
          .from(mediaProductionPlanVerifications)
          .where(and(
            eq(mediaProductionPlanVerifications.tenantId, tenantId),
            eq(mediaProductionPlanVerifications.productionRunId, input.productionRunId),
            eq(mediaProductionPlanVerifications.planVersion, latestPlan.version),
          ))
          .orderBy(desc(mediaProductionPlanVerifications.createdAt))
          .limit(1)
        : [];
      const [latestApproval] = latestPlan
        ? await db
          .select()
          .from(mediaProductionApprovals)
          .where(and(
            eq(mediaProductionApprovals.tenantId, tenantId),
            eq(mediaProductionApprovals.productionRunId, input.productionRunId),
            eq(mediaProductionApprovals.planVersion, latestPlan.version),
          ))
          .orderBy(desc(mediaProductionApprovals.createdAt))
          .limit(1)
        : [];

      return { run, latestPlan, latestVerification, latestApproval };
    }),

  saveRun: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      status: z.string().min(1).max(40).default("goal_ready"),
      goal: productionGoalSchema,
      productionBible: productionPayloadSchema.default({}),
      assetPlan: productionPayloadSchema.default({}),
      qualityGateSummary: productionPayloadSchema.default({}),
      budgetSummary: productionPayloadSchema.default({}),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const now = new Date();
      await assertRunWritableByUser(db, tenantId, ctx.user.id, input.productionRunId);
      const existing = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (existing) {
        const transition = validateProductionRunTransition(
          existing.status as ProductionRunStatus,
          input.status as ProductionRunStatus,
        );
        if (!transition.ok) {
          throw new TRPCError({
            code: "CONFLICT",
            message: transition.reasonCode ?? "Invalid production state transition",
          });
        }
      }

      const [saved] = await db
        .insert(mediaProductionRuns)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          status: input.status,
          goal: input.goal,
          productionBible: input.productionBible,
          assetPlan: input.assetPlan,
          qualityGateSummary: input.qualityGateSummary,
          budgetSummary: input.budgetSummary,
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mediaProductionRuns.tenantId, mediaProductionRuns.productionRunId],
          set: {
            status: input.status,
            goal: input.goal,
            productionBible: input.productionBible,
            assetPlan: input.assetPlan,
            qualityGateSummary: input.qualityGateSummary,
            budgetSummary: input.budgetSummary,
            contractVersion: input.contractVersion,
            updatedAt: now,
          },
        })
        .returning();

      return saved;
    }),

  saveGoalVersion: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      goal: productionGoalSchema,
      changedFields: stringArraySchema,
      status: z.string().min(1).max(40).default("goal_ready"),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const now = new Date();
      await assertRunWritableByUser(db, tenantId, ctx.user.id, input.productionRunId);
      const existing = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      let nextRunStatus = input.status as ProductionRunStatus;
      if (existing) {
        const transition = validateProductionRunTransition(
          existing.status as ProductionRunStatus,
          nextRunStatus,
        );
        if (!transition.ok) {
          const isGoalOnlySave = nextRunStatus === "goal_draft" || nextRunStatus === "goal_ready";
          if (isGoalOnlySave) {
            nextRunStatus = existing.status as ProductionRunStatus;
          } else {
            throw new TRPCError({ code: "CONFLICT", message: transition.reasonCode ?? "Invalid production state transition" });
          }
        }
      }
      const version = await getNextVersion(db, mediaProductionGoalVersions, tenantId, input.productionRunId);
      const inputHash = buildProductionStableHash(input.goal);
      const [goalVersion] = await db
        .insert(mediaProductionGoalVersions)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          version,
          goal: input.goal,
          changedFields: input.changedFields,
          inputHash,
          status: "active",
          contractVersion: input.contractVersion,
          createdAt: now,
        })
        .returning();

      await db
        .insert(mediaProductionRuns)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          status: nextRunStatus,
          goalVersion: version,
          planVersion: (existing as any)?.planVersion ?? 0,
          goal: input.goal,
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mediaProductionRuns.tenantId, mediaProductionRuns.productionRunId],
          set: {
            status: nextRunStatus,
            goalVersion: version,
            goal: input.goal,
            contractVersion: input.contractVersion,
            updatedAt: now,
          },
        });

      return goalVersion;
    }),

  savePlanVersion: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      goalVersion: z.number().int().positive().default(1),
      plan: productionPayloadSchema,
      plannerSkillId: z.string().min(1).max(128).default("media-production-storyboard-planner"),
      plannerSkillVersion: z.string().max(32).optional(),
      status: z.string().min(1).max(40).default("plan_ready_for_review"),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });
      const transition = validateProductionRunTransition(
        run.status as ProductionRunStatus,
        input.status as ProductionRunStatus,
      );
      const canUseImplicitPlanningStep =
        !transition.ok
        && validateProductionRunTransition(run.status as ProductionRunStatus, "plan_generating").ok
        && validateProductionRunTransition("plan_generating", input.status as ProductionRunStatus).ok;
      if (!transition.ok && !canUseImplicitPlanningStep) {
        throw new TRPCError({ code: "CONFLICT", message: transition.reasonCode ?? "Invalid production state transition" });
      }
      const now = new Date();
      const version = await getNextVersion(db, mediaProductionPlanVersions, tenantId, input.productionRunId);
      const [planVersion] = await db
        .insert(mediaProductionPlanVersions)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          goalVersion: input.goalVersion,
          version,
          plannerSkillId: input.plannerSkillId,
          plannerSkillVersion: input.plannerSkillVersion,
          plan: input.plan,
          inputHash: buildProductionStableHash({ goal: run.goal, goalVersion: input.goalVersion }),
          outputHash: buildProductionStableHash(input.plan),
          status: "ready_for_review",
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const assetRequirements = (input.plan.asset_requirements ?? input.plan.assetRequirements ?? {}) as Record<string, any>;
      const nodes = Array.isArray(assetRequirements.nodes)
        ? assetRequirements.nodes
        : Array.isArray(input.plan.asset_requirements)
          ? input.plan.asset_requirements
          : [];
      const assetPlan: ProductionAssetPlan = {
        assetPlanId: `${input.productionRunId}:plan:${version}`,
        productionRunId: input.productionRunId,
        nodes: nodes.map((node: any, index: number) => ({
          id: String(node.id ?? node.asset_id ?? `asset-${index + 1}`),
          kind: String(node.kind ?? node.type ?? "reference"),
          role: String(node.role ?? node.name ?? `Asset ${index + 1}`),
          required: node.required !== false,
          status: String(node.status ?? "planned") as ProductionAssetPlan["nodes"][number]["status"],
          providerCandidates: Array.isArray(node.providerCandidates) ? node.providerCandidates : undefined,
          estimatedCredits: Number(node.estimatedCredits ?? node.credits ?? 0),
          qualityIssues: Array.isArray(node.qualityIssues) ? node.qualityIssues : undefined,
        })),
        contractVersion: input.contractVersion,
      };
      const readiness = evaluateProductionAssetPlanReadiness(assetPlan);
      await db
        .insert(mediaProductionAssetPlans)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          planVersion: version,
          assetPlan: assetPlan as any,
          readiness: readiness as any,
          status: readiness.status,
          contractVersion: input.contractVersion,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [mediaProductionAssetPlans.tenantId, mediaProductionAssetPlans.productionRunId, mediaProductionAssetPlans.planVersion],
          set: {
            assetPlan: assetPlan as any,
            readiness: readiness as any,
            status: readiness.status,
            updatedAt: now,
          },
        });

      await db
        .update(mediaProductionRuns)
        .set({
          status: input.status,
          planVersion: version,
          productionBible: (input.plan.production_bible ?? input.plan.productionBible ?? {}) as any,
          assetPlan: assetPlan as any,
          budgetSummary: (input.plan.credit_and_time_estimate ?? input.plan.budgetSummary ?? {}) as any,
          updatedAt: now,
        })
        .where(and(
          eq(mediaProductionRuns.tenantId, tenantId),
          eq(mediaProductionRuns.userId, ctx.user.id),
          eq(mediaProductionRuns.productionRunId, input.productionRunId),
        ));

      return { planVersion, assetPlan, readiness };
    }),

  savePlanVerification: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      planVersion: z.number().int().positive(),
      verification: productionPayloadSchema,
      verifierSkillId: z.string().min(1).max(128).default("media-production-plan-verifier"),
      verifierSkillVersion: z.string().max(32).optional(),
      contractVersion: z.string().min(1).max(32).default("1.0.0"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });
      const verdict = String(input.verification.verdict ?? input.verification.status ?? "human_review").toLowerCase();
      const score = Math.max(0, Math.min(100, Number(input.verification.score ?? input.verification.approval_score ?? 0) || 0));
      const blockingIssues = Array.isArray(input.verification.blocking_issues)
        ? input.verification.blocking_issues
        : Array.isArray(input.verification.blockingIssues)
          ? input.verification.blockingIssues
          : [];
      const warnings = Array.isArray(input.verification.warnings) ? input.verification.warnings : [];
      const missingDecisions = Array.isArray(input.verification.missing_decisions)
        ? input.verification.missing_decisions
        : Array.isArray(input.verification.missingDecisions)
          ? input.verification.missingDecisions
          : [];
      const recommendedRevisions = Array.isArray(input.verification.recommended_revisions)
        ? input.verification.recommended_revisions
        : Array.isArray(input.verification.recommendedRevisions)
          ? input.verification.recommendedRevisions
          : [];
      const nextStatus: ProductionRunStatus =
        verdict === "pass" || verdict === "warning"
          ? "plan_ready_for_review"
          : verdict === "revise"
            ? "plan_needs_revision"
            : verdict === "block"
              ? "plan_verification_failed"
              : "human_review_required";
      const transition = validateProductionRunTransition(run.status as ProductionRunStatus, "plan_verifying");
      if (transition.ok && run.status !== "plan_verifying") {
        await db
          .update(mediaProductionRuns)
          .set({ status: "plan_verifying", updatedAt: new Date() })
          .where(and(
            eq(mediaProductionRuns.tenantId, tenantId),
            eq(mediaProductionRuns.userId, ctx.user.id),
            eq(mediaProductionRuns.productionRunId, input.productionRunId),
          ));
      }
      const now = new Date();
      const [verification] = await db
        .insert(mediaProductionPlanVerifications)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          planVersion: input.planVersion,
          verifierSkillId: input.verifierSkillId,
          verifierSkillVersion: input.verifierSkillVersion,
          verdict,
          score,
          verification: input.verification,
          blockingIssues,
          warnings,
          missingDecisions: missingDecisions.map(String),
          recommendedRevisions,
          status: "active",
          contractVersion: input.contractVersion,
          createdAt: now,
        })
        .returning();
      const latestRun = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      const finalTransition = validateProductionRunTransition(latestRun?.status as ProductionRunStatus, nextStatus);
      if (finalTransition.ok) {
        await db
          .update(mediaProductionRuns)
          .set({
            status: nextStatus,
            qualityGateSummary: input.verification,
            updatedAt: now,
          })
          .where(and(
            eq(mediaProductionRuns.tenantId, tenantId),
            eq(mediaProductionRuns.userId, ctx.user.id),
            eq(mediaProductionRuns.productionRunId, input.productionRunId),
          ));
      }
      return verification;
    }),

  approvePlan: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      planVersion: z.number().int().positive(),
      acceptedWarnings: stringArraySchema,
      lockedTargets: stringArraySchema,
      notes: z.string().max(2000).optional(),
      policySnapshot: productionPayloadSchema.default({}),
      budgetSnapshot: productionPayloadSchema.default({}),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });
      if (run.status !== "plan_approved") {
        const transition = validateProductionRunTransition(run.status as ProductionRunStatus, "plan_approved");
        if (!transition.ok) {
          throw new TRPCError({ code: "CONFLICT", message: transition.reasonCode ?? "Invalid production state transition" });
        }
      }
      const [approval] = await db
        .insert(mediaProductionApprovals)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          planVersion: input.planVersion,
          approvalType: "plan",
          status: "approved",
          acceptedWarnings: input.acceptedWarnings,
          lockedTargets: input.lockedTargets,
          notes: input.notes,
          policySnapshot: input.policySnapshot,
          budgetSnapshot: input.budgetSnapshot,
          createdAt: new Date(),
        })
        .returning();
      await db
        .update(mediaProductionRuns)
        .set({ status: "plan_approved", updatedAt: new Date() })
        .where(and(
          eq(mediaProductionRuns.tenantId, tenantId),
          eq(mediaProductionRuns.userId, ctx.user.id),
          eq(mediaProductionRuns.productionRunId, input.productionRunId),
        ));
      return approval;
    }),

  projectOutput: protectedProcedure
    .input(z.object({
      productionRunId: z.string().min(1).max(128),
      surface: productionSurfaceSchema,
      output: productionPayloadSchema,
      name: z.string().min(1).max(256).optional(),
      storyboardRunId: z.string().max(128).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });

      const run = await getExistingRun(db, tenantId, ctx.user.id, input.productionRunId);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Production run not found" });

      const clips = extractProductionClips(input.output);
      const name = input.name ?? buildProductionName(input.output, input.surface === "storyboard_review" ? "Production Storyboard Review" : "Production Video Edit");
      const now = new Date();
      const identity = buildProductionOutputProjectionIdentity({
        tenantId,
        productionRunId: input.productionRunId,
        surface: input.surface,
        sourceOutput: input.output,
      });
      const [existingProjection] = await db
        .select()
        .from(mediaProductionOutputProjections)
        .where(and(
          eq(mediaProductionOutputProjections.tenantId, tenantId),
          eq(mediaProductionOutputProjections.productionRunId, input.productionRunId),
          eq(mediaProductionOutputProjections.surface, input.surface),
          eq(mediaProductionOutputProjections.sourceOutputHash, identity.sourceOutputHash),
        ))
        .limit(1);
      if (existingProjection?.surfaceRecordId) {
        return {
          projection: existingProjection,
          surfaceRecordId: existingProjection.surfaceRecordId,
          surface: input.surface,
          reused: true,
        };
      }
      let surfaceRecordId: string;

      if (input.surface === "storyboard_review") {
        const reviewData = {
          productionRunId: input.productionRunId,
          sourceSurface: "media_production",
          storyBible: run.productionBible,
          qualityGateSummary: (run as any).qualityGateSummary ?? {},
          tasks: clips,
          output: input.output,
          updatedAt: Date.now(),
        };
        const [inserted] = await db
          .insert(mediaStudioStoryboardReviews)
          .values({
            userId: ctx.user.id,
            name,
            reviewData,
            clipCount: clips.length,
            completedClipCount: clips.filter((clip) => String(clip.status ?? "").toLowerCase() === "completed" || Boolean(clip.url)).length,
            thumbnailUrl: String((clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.thumbnailUrl ?? (clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.url ?? "") || undefined,
            status: "active",
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: mediaStudioStoryboardReviews.id });
        surfaceRecordId = String(inserted.id);
      } else {
        const projectData = {
          productionRunId: input.productionRunId,
          sourceSurface: "media_production",
          storyBible: run.productionBible,
          qualityGateSummary: (run as any).qualityGateSummary ?? {},
          clips,
          output: input.output,
          updatedAt: Date.now(),
        };
        const [inserted] = await db
          .insert(videoEditorProjects)
          .values({
            userId: ctx.user.id,
            name,
            projectData,
            thumbnailUrl: String((clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.thumbnailUrl ?? (clips.find((clip) => clip.thumbnailUrl || clip.url) as any)?.url ?? "") || undefined,
            duration: String(input.output.durationSeconds ?? input.output.duration ?? ""),
            resolution: String(input.output.resolution ?? ""),
            trackCount: 1,
            clipCount: clips.length,
            isAutoSave: false,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: videoEditorProjects.id });
        surfaceRecordId = String(inserted.id);
      }

      const [projection] = await db
        .insert(mediaProductionOutputProjections)
        .values({
          tenantId,
          userId: ctx.user.id,
          productionRunId: input.productionRunId,
          storyboardRunId: input.storyboardRunId,
          surface: input.surface,
          surfaceRecordId,
          sourceOutputHash: identity.sourceOutputHash,
          metadata: {
            idempotencyKey: identity.idempotencyKey,
            clipCount: clips.length,
          },
          status: "active",
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            mediaProductionOutputProjections.tenantId,
            mediaProductionOutputProjections.productionRunId,
            mediaProductionOutputProjections.surface,
            mediaProductionOutputProjections.sourceOutputHash,
          ],
          set: {
            surfaceRecordId,
            metadata: {
              idempotencyKey: identity.idempotencyKey,
              clipCount: clips.length,
            },
            status: "active",
            lastSyncedAt: now,
            updatedAt: now,
          },
        })
        .returning();

      return {
        projection,
        surfaceRecordId,
        surface: input.surface,
      };
    }),
});
