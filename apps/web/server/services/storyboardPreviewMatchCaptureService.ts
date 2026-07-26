import { randomUUID } from "node:crypto";

import { TRPCError } from "@trpc/server";
import { assertStagedFinalAssemblyApproved } from "./hyperframesRuntimeApiService";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
  MANUAL_STORYBOARD_MOCKUP_PRODUCT_ID,
  computePreviewMatchFinalCompositeConfigHash,
  computePreviewMatchCompositionHash,
  computePreviewMatchTimelineHash,
  normalizeManualStoryboardProductId,
  previewMatchCompositionPayloadSchema,
  type CancelPreviewMatchCaptureJobInput,
  type CreatePreviewMatchFinalCompositeCaptureInput,
  type GetPreviewMatchCaptureJobInput,
  type PreviewMatchCompositionPayload,
  type StoryboardPreviewMatchCaptureFailureCode,
  type StoryboardPreviewMatchCaptureProjection,
  type StoryboardPreviewMatchCaptureStage,
  type StoryboardPreviewMatchCaptureStatus,
} from "../../shared/storyboardPreviewMatchCapture";
import {
  marketplaceAutoReviewRuns,
  marketplaceProducts,
  storyboardPreviewMatchCaptureAttempts,
  storyboardPreviewMatchCaptureJobs,
  type StoryboardPreviewMatchCaptureAttempt,
  type StoryboardPreviewMatchCaptureJob,
} from "../../drizzle/schema";
import { stableHash } from "../../shared/hyperframes/contracts";
import { getHyperframesPlatformPreset } from "../../shared/hyperframes/templates";
import { getDb } from "../db";
import {
  buildHyperframesCreditEstimate,
  type HyperframesAuthContext,
} from "./hyperframesFeatureAccessService";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import {
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../../shared/featureFlags";
import {
  billingEnvelopeFromMetadata,
  reconcileWorkerJobCredits,
  reserveWorkerJobCredits,
  type WorkerJobBillingEnvelope,
} from "./workerBillingService";

const INVALIDATES = ["marketplaceCapture.getPreviewMatchCaptureJob"] as const;
const ACTIVE_CAPTURE_STATUSES = new Set<StoryboardPreviewMatchCaptureStatus>([
  "queued",
  "preparing_assets",
  "browser_ready",
  "capturing",
  "encoding",
  "verifying",
  "publishing",
]);
const TERMINAL_CAPTURE_STATUSES = new Set<StoryboardPreviewMatchCaptureStatus>([
  "completed",
  "saved_to_library",
  "cancelled",
  "failed_transient",
  "failed_permanent",
  "verification_failed",
  "compliance_blocked",
]);

export type StoryboardPreviewMatchCaptureRuntimeConfig = {
  captureEnabled: boolean;
  highQualityEnabled: boolean;
  serverWorkerEnabled: boolean;
  clientExperimentEnabled: boolean;
  globalConcurrency: number;
  perTenantConcurrency: number;
  perUserConcurrency: number;
  maxCaptureDurationSeconds: number;
  routeTokenTtlSeconds: number;
  attemptTimeoutSeconds: number;
  queueTimeoutSeconds: number;
  maxRetries: number;
  workspaceCleanupTtlHours: number;
  evidenceRetentionDays: number;
};

type JobInsert = typeof storyboardPreviewMatchCaptureJobs.$inferInsert;
type AttemptInsert = typeof storyboardPreviewMatchCaptureAttempts.$inferInsert;

export interface StoryboardPreviewMatchCaptureRepository {
  findRun: (input: {
    tenantId: string;
    userId: number;
    productId: string;
    runId: string;
  }) => Promise<{ id: string; tenantId: string | null; userId: number; productId: string; storyboardReviewId: string | null } | null>;
  ensureManualStoryboardParents?: (input: {
    tenantId: string;
    userId: number;
    productId: string;
    runId: string;
    storyboardReviewId: string;
    now: Date;
  }) => Promise<void>;
  findJobByIdempotencyKey: (tenantId: string, idempotencyKey: string) => Promise<StoryboardPreviewMatchCaptureJob | null>;
  findJobById: (input: {
    tenantId: string;
    userId: number;
    captureJobId: string;
    productId?: string;
    runId?: string;
  }) => Promise<StoryboardPreviewMatchCaptureJob | null>;
  findJobForInternalRoute: (input: {
    tenantId: string;
    captureJobId: string;
  }) => Promise<StoryboardPreviewMatchCaptureJob | null>;
  findLatestJob: (input: {
    tenantId: string;
    userId: number;
    productId?: string;
    runId?: string;
    storyboardReviewId?: string;
  }) => Promise<StoryboardPreviewMatchCaptureJob | null>;
  insertJob: (values: JobInsert) => Promise<StoryboardPreviewMatchCaptureJob>;
  updateJob: (id: string, values: Partial<JobInsert>) => Promise<StoryboardPreviewMatchCaptureJob | null>;
  markActiveAttemptStale: (captureJobId: string, reason: string) => Promise<void>;
  insertAttempt: (values: AttemptInsert) => Promise<StoryboardPreviewMatchCaptureAttempt>;
  findAttempt: (captureJobId: string, attemptId: string) => Promise<StoryboardPreviewMatchCaptureAttempt | null>;
}

export interface StoryboardPreviewMatchCaptureDeps {
  repo?: StoryboardPreviewMatchCaptureRepository;
  reserveCredits?: typeof reserveWorkerJobCredits;
  reconcileCredits?: typeof reconcileWorkerJobCredits;
  dispatchCaptureJob?: (input: { captureJobId: string; tenantId: string }) => Promise<void>;
  runtimeConfig?: Partial<StoryboardPreviewMatchCaptureRuntimeConfig>;
  now?: () => Date;
}

function readBooleanFlag(
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: boolean,
): boolean {
  const raw = env[key]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  if (["1", "true", "yes", "on", "enabled"].includes(raw)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(raw)) return false;
  return defaultValue;
}

function readPositiveInt(
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: number,
): number {
  const value = Number(env[key]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : defaultValue;
}

export function readStoryboardPreviewMatchCaptureRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): StoryboardPreviewMatchCaptureRuntimeConfig {
  return {
    captureEnabled: readBooleanFlag(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_ENABLED", true),
    highQualityEnabled: readBooleanFlag(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_HIGH_ENABLED", true),
    serverWorkerEnabled: readBooleanFlag(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_SERVER_WORKER_ENABLED", false),
    clientExperimentEnabled: readBooleanFlag(env, "STORYBOARD_CLIENT_CAPTURE_EXPERIMENT_ENABLED", false),
    globalConcurrency: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_GLOBAL_CONCURRENCY", 4),
    perTenantConcurrency: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_TENANT_CONCURRENCY", 2),
    perUserConcurrency: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_USER_CONCURRENCY", 1),
    maxCaptureDurationSeconds: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_MAX_DURATION_SECONDS", 600),
    routeTokenTtlSeconds: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_ROUTE_TOKEN_TTL_SECONDS", 300),
    attemptTimeoutSeconds: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_ATTEMPT_TIMEOUT_SECONDS", 720),
    queueTimeoutSeconds: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_QUEUE_TIMEOUT_SECONDS", 900),
    maxRetries: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_MAX_RETRIES", 2),
    workspaceCleanupTtlHours: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_WORKSPACE_CLEANUP_TTL_HOURS", 24),
    evidenceRetentionDays: readPositiveInt(env, "STORYBOARD_PREVIEW_MATCH_CAPTURE_EVIDENCE_RETENTION_DAYS", 30),
  };
}

export function readStoryboardPreviewMatchCaptureRuntimeConfigFromTenantConfig(
  tenantFlags: Pick<
    TenantFeatureFlags,
    | "storyboardPreviewMatchCaptureEnabled"
    | "storyboardPreviewMatchCaptureServerWorkerEnabled"
    | "storyboardPreviewMatchCaptureHighEnabled"
    | "storyboardClientCaptureExperimentEnabled"
  >,
  env: Record<string, string | undefined> = process.env,
): StoryboardPreviewMatchCaptureRuntimeConfig {
  const operational = readStoryboardPreviewMatchCaptureRuntimeConfig(env);
  const captureEnabled = tenantFlags.storyboardPreviewMatchCaptureEnabled === true;
  return {
    ...operational,
    captureEnabled,
    serverWorkerEnabled:
      captureEnabled &&
      tenantFlags.storyboardPreviewMatchCaptureServerWorkerEnabled === true,
    highQualityEnabled:
      captureEnabled &&
      (operational.highQualityEnabled || tenantFlags.storyboardPreviewMatchCaptureHighEnabled === true),
    clientExperimentEnabled:
      captureEnabled &&
      tenantFlags.storyboardClientCaptureExperimentEnabled === true,
  };
}

async function runtimeConfigFromDeps(
  auth: HyperframesAuthContext,
  deps: StoryboardPreviewMatchCaptureDeps,
): Promise<StoryboardPreviewMatchCaptureRuntimeConfig> {
  if (deps.runtimeConfig) {
    return {
      ...readStoryboardPreviewMatchCaptureRuntimeConfig(),
      ...deps.runtimeConfig,
    };
  }
  let tenantFlags: TenantFeatureFlags;
  try {
    tenantFlags = await getTenantFeatureFlags(tenantIdFromAuth(auth));
  } catch (error) {
    console.warn("[PreviewMatchCapture] Failed to read tenant feature flags; fail closed.", {
      tenantId: tenantIdFromAuth(auth),
      error: error instanceof Error ? error.message : String(error),
    });
    tenantFlags = FEATURE_FLAG_DEFAULTS;
  }
  return {
    ...readStoryboardPreviewMatchCaptureRuntimeConfigFromTenantConfig(tenantFlags),
  };
}

async function dispatchPreviewMatchCaptureJob(input: {
  captureJobId: string;
  tenantId: string;
}): Promise<void> {
  let dispatchedToCloudTasks = false;
  try {
    const { enqueueTask, getCloudTasksConfigStatus } = await import("./cloudTasks");
    const config = getCloudTasksConfigStatus("node");
    if (config.configured) {
      await enqueueTask({
        queueName: "media-jobs",
        handlerPath: "/_internal/tasks/storyboard-preview-match-capture",
        targetService: "node",
        payload: {
          captureJobId: input.captureJobId,
          tenantId: input.tenantId,
        },
        taskId: `storyboard-preview-match-capture-${input.captureJobId}`,
      });
      dispatchedToCloudTasks = true;
    } else {
      console.warn(
        `[PreviewMatchCapture] Node Cloud Tasks config is incomplete; starting detached capture worker. Missing: ${config.missingKeys.join(", ")}`
      );
    }
  } catch (error) {
    console.warn("[PreviewMatchCapture] Failed to enqueue Cloud Task; starting detached worker.", error);
  }

  if (!dispatchedToCloudTasks) {
    const { startDetachedStoryboardPreviewMatchCaptureWorker } = await import("./backgroundWorkerProcess");
    const worker = startDetachedStoryboardPreviewMatchCaptureWorker({
      captureJobId: input.captureJobId,
    });
    console.info("[PreviewMatchCapture] Started detached capture worker.", {
      captureJobId: input.captureJobId,
      pid: worker.pid,
    });
  }
}

const defaultRepo: StoryboardPreviewMatchCaptureRepository = {
  async findRun(input) {
    const db = await getDb();
    const filters = [
      eq(marketplaceAutoReviewRuns.id, input.runId),
      eq(marketplaceAutoReviewRuns.productId, input.productId),
      eq(marketplaceAutoReviewRuns.userId, input.userId),
    ];
    if (input.tenantId && input.tenantId !== "default") {
      filters.push(eq(marketplaceAutoReviewRuns.tenantId, input.tenantId));
    }
    const [row] = await db
      .select({
        id: marketplaceAutoReviewRuns.id,
        tenantId: marketplaceAutoReviewRuns.tenantId,
        userId: marketplaceAutoReviewRuns.userId,
        productId: marketplaceAutoReviewRuns.productId,
        storyboardReviewId: marketplaceAutoReviewRuns.storyboardReviewId,
      })
      .from(marketplaceAutoReviewRuns)
      .where(and(...filters))
      .limit(1);
    return row ?? null;
  },
  async ensureManualStoryboardParents(input) {
    if (!isManualStoryboardCaptureIdentity(input)) return;
    const db = await getDb();
    const tenantId = input.tenantId === "default" ? null : input.tenantId;
    const productId = normalizeManualStoryboardProductId(input.productId);
    const sourceUrl = `manual-storyboard://${input.runId}`;

    await db
      .insert(marketplaceProducts)
      .values({
        id: productId,
        captureId: null,
        userId: input.userId,
        tenantId,
        platform: "shopee",
        sourceUrl,
        externalProductId: null,
        externalShopId: null,
        productName: "Manual Storyboard Mockup",
        descriptionText: "User-managed Storyboard Review project.",
        descriptionJson: {
          manualStoryboardReview: true,
          syntheticProduct: true,
          runId: input.runId,
          storyboardReviewId: input.storyboardReviewId,
          source: "storyboard_preview_match_capture",
        },
        specsJson: {},
        platformRawJson: {
          manualStoryboardReview: true,
          syntheticProduct: true,
          sourceSurface: "storyboard_review",
          runId: input.runId,
          storyboardReviewId: input.storyboardReviewId,
          previewMatchCaptureOnly: true,
        },
        status: "active",
        createdAt: input.now,
        updatedAt: input.now,
      })
      .onConflictDoNothing();

    await db
      .insert(marketplaceAutoReviewRuns)
      .values({
        id: input.runId,
        tenantId,
        userId: input.userId,
        productId,
        productionRunId: input.runId,
        outputMode: "storyboard_video",
        frameStrategy: "manual_storyboard",
        status: "completed",
        currentStage: "storyboard_review",
        stageIndex: 1,
        stageCount: 1,
        selectedConceptId: null,
        storyboardReviewId: input.storyboardReviewId,
        videoEditorProjectId: null,
        renderJobId: null,
        resultLibraryItemId: null,
        resultJson: {
          storyboardReviewId: input.storyboardReviewId,
          manualStoryboardReview: true,
        },
        metadataJson: {
          manualStoryboardReview: true,
          source: "storyboard_preview_match_capture",
        },
        errorMessage: null,
        idempotencyKey: `manual-storyboard-capture:${input.runId}`,
        createdAt: input.now,
        updatedAt: input.now,
        completedAt: input.now,
      })
      .onConflictDoNothing();
  },
  async findJobByIdempotencyKey(tenantId, idempotencyKey) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(storyboardPreviewMatchCaptureJobs)
      .where(and(
        eq(storyboardPreviewMatchCaptureJobs.tenantId, tenantId),
        eq(storyboardPreviewMatchCaptureJobs.idempotencyKey, idempotencyKey),
      ))
      .limit(1);
    return row ?? null;
  },
  async findJobById(input) {
    const db = await getDb();
    const filters = [
      eq(storyboardPreviewMatchCaptureJobs.id, input.captureJobId),
      eq(storyboardPreviewMatchCaptureJobs.tenantId, input.tenantId),
      eq(storyboardPreviewMatchCaptureJobs.userId, input.userId),
    ];
    if (input.productId) filters.push(eq(storyboardPreviewMatchCaptureJobs.productId, input.productId));
    if (input.runId) filters.push(eq(storyboardPreviewMatchCaptureJobs.runId, input.runId));
    const [row] = await db
      .select()
      .from(storyboardPreviewMatchCaptureJobs)
      .where(and(...filters))
      .limit(1);
    return row ?? null;
  },
  async findLatestJob(input) {
    const db = await getDb();
    const filters = [
      eq(storyboardPreviewMatchCaptureJobs.tenantId, input.tenantId),
      eq(storyboardPreviewMatchCaptureJobs.userId, input.userId),
    ];
    if (input.productId) filters.push(eq(storyboardPreviewMatchCaptureJobs.productId, input.productId));
    if (input.runId) filters.push(eq(storyboardPreviewMatchCaptureJobs.runId, input.runId));
    if (input.storyboardReviewId) {
      filters.push(eq(storyboardPreviewMatchCaptureJobs.storyboardReviewId, input.storyboardReviewId));
    }
    const [row] = await db
      .select()
      .from(storyboardPreviewMatchCaptureJobs)
      .where(and(...filters))
      .orderBy(
        desc(storyboardPreviewMatchCaptureJobs.updatedAt),
        desc(storyboardPreviewMatchCaptureJobs.createdAt),
      )
      .limit(1);
    return row ?? null;
  },
  async findJobForInternalRoute(input) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(storyboardPreviewMatchCaptureJobs)
      .where(and(
        eq(storyboardPreviewMatchCaptureJobs.id, input.captureJobId),
        eq(storyboardPreviewMatchCaptureJobs.tenantId, input.tenantId),
      ))
      .limit(1);
    return row ?? null;
  },
  async insertJob(values) {
    const db = await getDb();
    const [row] = await db.insert(storyboardPreviewMatchCaptureJobs).values(values).returning();
    return row;
  },
  async updateJob(id, values) {
    const db = await getDb();
    const [row] = await db
      .update(storyboardPreviewMatchCaptureJobs)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(storyboardPreviewMatchCaptureJobs.id, id))
      .returning();
    return row ?? null;
  },
  async markActiveAttemptStale(captureJobId, reason) {
    const db = await getDb();
    await db
      .update(storyboardPreviewMatchCaptureAttempts)
      .set({
        status: "stale",
        failureCode: reason,
        staleAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(storyboardPreviewMatchCaptureAttempts.captureJobId, captureJobId),
        inArray(storyboardPreviewMatchCaptureAttempts.status, ["active", "running"]),
      ));
  },
  async insertAttempt(values) {
    const db = await getDb();
    const [row] = await db.insert(storyboardPreviewMatchCaptureAttempts).values(values).returning();
    return row;
  },
  async findAttempt(captureJobId, attemptId) {
    const db = await getDb();
    const [row] = await db
      .select()
      .from(storyboardPreviewMatchCaptureAttempts)
      .where(and(
        eq(storyboardPreviewMatchCaptureAttempts.captureJobId, captureJobId),
        eq(storyboardPreviewMatchCaptureAttempts.id, attemptId),
      ))
      .limit(1);
    return row ?? null;
  },
};

function tenantIdFromAuth(auth: HyperframesAuthContext): string {
  return auth.tenantId?.trim() || "default";
}

function isNumericStoryboardReviewId(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return false;
  const parsed = Number(text);
  return Number.isInteger(parsed) && parsed > 0 && String(parsed) === text;
}

function storyboardReviewIdentityMatchesRun(input: {
  run: { id: string; storyboardReviewId: string | null };
  requestedStoryboardReviewId: string;
}): boolean {
  const linkedStoryboardReviewId = String(input.run.storyboardReviewId ?? "").trim();
  const requestedStoryboardReviewId = String(input.requestedStoryboardReviewId ?? "").trim();
  if (!linkedStoryboardReviewId) return true;
  if (linkedStoryboardReviewId === requestedStoryboardReviewId) return true;

  // Manual Storyboard Review HyperFrames runs can use the run id as the stored
  // storyboard link while the page/API use the numeric media-studio review id.
  if (
    isNumericStoryboardReviewId(requestedStoryboardReviewId) &&
    (linkedStoryboardReviewId === input.run.id ||
      !isNumericStoryboardReviewId(linkedStoryboardReviewId))
  ) {
    return true;
  }
  return false;
}

function isManualStoryboardCaptureIdentity(input: {
  productId: string;
  runId: string;
  storyboardReviewId: string;
}): boolean {
  return (
    (input.productId === MANUAL_STORYBOARD_MOCKUP_PRODUCT_ID ||
      /^manual_storyboard_product_[A-Za-z0-9_-]+$/.test(input.productId)) &&
    /^manual_storyboard_run_[A-Za-z0-9_-]+$/.test(input.runId) &&
    isNumericStoryboardReviewId(input.storyboardReviewId)
  );
}

function buildSyntheticManualStoryboardRun(input: {
  tenantId: string;
  userId: number;
  productId: string;
  runId: string;
  storyboardReviewId: string;
}) {
  if (!isManualStoryboardCaptureIdentity(input)) return null;
  return {
    id: input.runId,
    tenantId: input.tenantId === "default" ? null : input.tenantId,
    userId: input.userId,
    productId: input.productId,
    storyboardReviewId: input.storyboardReviewId,
  };
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    if (/payloadJson|billingJson|subtitleCues|sourceVideoRef|\[\{|\{"shots"/i.test(error.message)) {
      return `${error.name || "Error"}: database operation failed; raw payload redacted`;
    }
    return error.message.slice(0, 240);
  }
  return String(error).slice(0, 240);
}

function ensurePayloadMatchesInput(
  input: CreatePreviewMatchFinalCompositeCaptureInput,
  auth: HyperframesAuthContext,
): PreviewMatchCompositionPayload {
  const rawPayload = previewMatchCompositionPayloadSchema.parse(input.payload);
  const tenantId = tenantIdFromAuth(auth);
  const payload = {
    ...rawPayload,
    tenantId,
    productId: input.productId,
    runId: input.runId,
    storyboardReviewId: input.storyboardReviewId,
    requestedByUserId: auth.userId,
  } as PreviewMatchCompositionPayload;
  if (
    (rawPayload.tenantId !== tenantId && rawPayload.tenantId !== "default") ||
    (rawPayload.productId !== input.productId && rawPayload.productId !== "unknown_product") ||
    (rawPayload.runId !== input.runId && rawPayload.runId !== "unknown_run") ||
    (rawPayload.storyboardReviewId !== input.storyboardReviewId && rawPayload.storyboardReviewId !== "unknown_storyboard")
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Preview-match payload identity does not match the capture request.",
    });
  }
  if (
    payload.previewCompositionHash !== input.expectedPreviewCompositionHash ||
    payload.timelineHash !== input.expectedTimelineHash ||
    payload.finalCompositeConfigHash !== input.finalCompositeConfigHash
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Preview-match payload hashes are stale. Refresh the preview and try again.",
    });
  }
  const pendingPayload: PreviewMatchCompositionPayload = {
    ...payload,
    finalCompositeConfigHash: "pending_config_hash",
    previewCompositionHash: "pending_preview_hash",
    timelineHash: "pending_timeline_hash",
  };
  const recomputedConfigHash = computePreviewMatchFinalCompositeConfigHash(pendingPayload);
  const recomputedPreviewHash = computePreviewMatchCompositionHash(pendingPayload);
  const recomputedTimelineHash = computePreviewMatchTimelineHash(pendingPayload);
  if (
    recomputedConfigHash !== input.finalCompositeConfigHash ||
    recomputedPreviewHash !== input.expectedPreviewCompositionHash ||
    recomputedTimelineHash !== input.expectedTimelineHash
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Preview-match payload no longer matches the expected preview hashes.",
    });
  }
  if (payload.shots.some(shot => !shot.sourceVideoRef)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Capture Final Composite requires every selected shot to have a final source video.",
    });
  }
  return payload;
}

function buildCaptureId(input: {
  tenantId: string;
  runId: string;
  previewCompositionHash: string;
  timelineHash: string;
  quality: string;
  idempotencyKey: string;
}): string {
  return `spmc_${stableHash(input).replace(/[^a-zA-Z0-9_]/g, "").slice(-40)}`;
}

export function buildPreviewMatchCaptureIdempotencyKey(input: {
  tenantId: string;
  userId: number;
  productId: string;
  runId: string;
  storyboardReviewId: string;
  finalCompositeConfigHash: string;
  previewCompositionHash: string;
  timelineHash: string;
  quality: string;
  submissionWindowKey?: number;
}): string {
  return stableHash({
    kind: "storyboard_preview_match_capture",
    ...input,
  }).replace(/^hf_/, "spmc_idem_");
}

function buildReservedCredits(input: {
  tenantId: string;
  userId: number;
  runId: string;
  quality: "standard" | "high";
  output: { width: number; height: number; fps: number; durationSeconds: number };
  previewCompositionHash: string;
  shotCount: number;
}): number {
  const platformPreset = {
    ...getHyperframesPlatformPreset("generic_vertical_9_16"),
    width: input.output.width,
    height: input.output.height,
    fps: input.output.fps,
    durationSeconds: input.output.durationSeconds,
    maxDurationSeconds: input.output.durationSeconds,
  };
  const estimate = buildHyperframesCreditEstimate({
    tenantId: input.tenantId,
    userId: input.userId,
    runId: input.runId,
    renderIntent: "final",
    compositionMode: "captioned_final_composite",
    costClass: "composition_render",
    compositionInputHash: input.previewCompositionHash,
    templateVersion: "preview_match_browser_capture_v1",
    platformPreset,
    workerComplexityMultiplier: Math.max(1, input.shotCount / 6),
  });
  return Math.max(1, Math.ceil(estimate.estimatedCredits * (input.quality === "standard" ? 0.75 : 1)));
}

function billingMetadataFromJob(job: Pick<StoryboardPreviewMatchCaptureJob, "billingJson">): {
  billing: WorkerJobBillingEnvelope | null;
  status: string;
} {
  const record = job.billingJson && typeof job.billingJson === "object"
    ? job.billingJson as Record<string, unknown>
    : {};
  return {
    billing: billingEnvelopeFromMetadata(record.reservation),
    status: typeof record.status === "string" ? record.status : "none",
  };
}

function redactedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/token|signature|X-Amz-|Bearer\s+|Cookie:/i.test(trimmed)) return null;
  return trimmed;
}

function dateTimeMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function captureElapsedSecondsFromJob(job: StoryboardPreviewMatchCaptureJob): number | null {
  const start = dateTimeMs(job.createdAt);
  if (start === null) return null;
  const status = job.status as StoryboardPreviewMatchCaptureStatus;
  const terminalEnd =
    status === "cancelled"
      ? dateTimeMs(job.cancelledAt) ?? dateTimeMs(job.updatedAt)
      : TERMINAL_CAPTURE_STATUSES.has(status)
        ? dateTimeMs(job.completedAt) ?? dateTimeMs(job.updatedAt)
        : dateTimeMs(job.updatedAt);
  if (terminalEnd === null || terminalEnd < start) return null;
  return Math.max(0, Math.round((terminalEnd - start) / 1000));
}

export function projectionFromPreviewMatchCaptureJob(
  job: StoryboardPreviewMatchCaptureJob,
): StoryboardPreviewMatchCaptureProjection {
  const output = job.outputJson && typeof job.outputJson === "object"
    ? job.outputJson as Record<string, unknown>
    : {};
  const evidence = job.evidenceJson && typeof job.evidenceJson === "object"
    ? job.evidenceJson as Record<string, unknown>
    : {};
  const status = job.status as StoryboardPreviewMatchCaptureStatus;
  return {
    captureJobId: job.id,
    engine: "preview_match_browser_capture",
    quality: job.quality === "high" ? "high" : "standard",
    status,
    stage: (job.stage as StoryboardPreviewMatchCaptureStage | null) ?? null,
    progressPercent: Math.max(0, Math.min(100, Number(job.progressPercent ?? 0))),
    previewCompositionHash: job.previewCompositionHash,
    timelineHash: job.timelineHash,
    safeMessage: job.safeMessage || safeMessageForCaptureStatus(status),
    safeDiagnostics: Array.isArray(job.safeDiagnosticsJson)
      ? job.safeDiagnosticsJson.map(item => String(item).slice(0, 240))
      : [],
    failureCode: (job.failureCode as StoryboardPreviewMatchCaptureFailureCode | null) ?? null,
    canCancel: ACTIVE_CAPTURE_STATUSES.has(status),
    canRetry: TERMINAL_CAPTURE_STATUSES.has(status) && status !== "completed" && status !== "saved_to_library",
    outputUrl: status === "completed" || status === "saved_to_library"
      ? redactedString(output.url)
      : null,
    libraryItemId: status === "saved_to_library"
      ? output.libraryItemId as string | number | null | undefined
      : null,
    evidenceRef: redactedString(evidence.evidenceRef),
    captureElapsedSeconds: captureElapsedSecondsFromJob(job),
  };
}

function safeMessageForCaptureStatus(status: StoryboardPreviewMatchCaptureStatus): string {
  switch (status) {
    case "queued":
      return "รอเริ่ม Capture ตาม Preview";
    case "preparing_assets":
      return "กำลังเตรียม asset สำหรับ Capture ตาม Preview";
    case "browser_ready":
      return "Preview runtime พร้อมสำหรับการบันทึก";
    case "capturing":
      return "กำลังบันทึกวิดีโอจาก preview runtime";
    case "encoding":
      return "กำลังแปลงวิดีโอเป็น MP4";
    case "verifying":
      return "กำลังตรวจสอบไฟล์ Capture ก่อนเปิดใช้งาน";
    case "publishing":
      return "กำลังบันทึกไฟล์ที่ตรวจสอบแล้วเข้า Library";
    case "completed":
      return "Capture ตาม Preview เสร็จและผ่านการตรวจสอบแล้ว";
    case "saved_to_library":
      return "Capture ตาม Preview ถูกบันทึกเข้า Library แล้ว";
    case "cancelled":
      return "ยกเลิก Capture ตาม Preview แล้ว";
    case "verification_failed":
      return "ไฟล์ Capture ไม่ผ่านการตรวจสอบ กรุณาลองใหม่";
    case "blocked":
      return "Capture ตาม Preview ยังไม่พร้อมใช้งาน";
    default:
      return "Capture ตาม Preview ไม่สำเร็จ กรุณาลองใหม่";
  }
}

export async function createPreviewMatchFinalCompositeCaptureForApi(
  input: CreatePreviewMatchFinalCompositeCaptureInput & { auth: HyperframesAuthContext },
  deps: StoryboardPreviewMatchCaptureDeps = {},
) {
  const repo = deps.repo ?? defaultRepo;
  const reserveCredits = deps.reserveCredits ?? reserveWorkerJobCredits;
  const reconcileCredits = deps.reconcileCredits ?? reconcileWorkerJobCredits;
  const tenantId = tenantIdFromAuth(input.auth);
  const runtimeConfig = await runtimeConfigFromDeps(input.auth, deps);
  if (!runtimeConfig.captureEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Preview-match capture is currently disabled. Render Final Composite remains available.",
    });
  }
  if (!runtimeConfig.serverWorkerEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Preview-match capture server worker is currently disabled. Render Final Composite remains available.",
    });
  }
  if (input.quality === "high" && !runtimeConfig.highQualityEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "High quality preview-match capture is not enabled for this rollout.",
    });
  }
  if (input.output.durationSeconds > runtimeConfig.maxCaptureDurationSeconds) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Preview-match capture exceeds the configured maximum duration.",
    });
  }
  const payload = ensurePayloadMatchesInput(input, input.auth);
  const run = await repo.findRun({
    tenantId,
    userId: input.auth.userId,
    productId: input.productId,
    runId: input.runId,
  }) ?? buildSyntheticManualStoryboardRun({
    tenantId,
    userId: input.auth.userId,
    productId: input.productId,
    runId: input.runId,
    storyboardReviewId: input.storyboardReviewId,
  });
  if (!run) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Storyboard Review run was not found for this product.",
    });
  }
  if (!storyboardReviewIdentityMatchesRun({
    run,
    requestedStoryboardReviewId: input.storyboardReviewId,
  })) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Storyboard Review identity does not match this run.",
    });
  }
  assertStagedFinalAssemblyApproved(run as Record<string, unknown>);

  const idempotencyKey = input.idempotencyKey ?? buildPreviewMatchCaptureIdempotencyKey({
    tenantId,
    userId: input.auth.userId,
    productId: input.productId,
    runId: input.runId,
    storyboardReviewId: input.storyboardReviewId,
    finalCompositeConfigHash: input.finalCompositeConfigHash,
    previewCompositionHash: input.expectedPreviewCompositionHash,
    timelineHash: input.expectedTimelineHash,
    quality: input.quality,
    submissionWindowKey: Math.floor(Date.now() / 15_000),
  });
  const existing = await repo.findJobByIdempotencyKey(tenantId, idempotencyKey);
  if (existing && ACTIVE_CAPTURE_STATUSES.has(existing.status as StoryboardPreviewMatchCaptureStatus)) {
    return {
      capture: projectionFromPreviewMatchCaptureJob(existing),
      invalidates: [...INVALIDATES],
    };
  }

  const now = deps.now?.() ?? new Date();
  if (isManualStoryboardCaptureIdentity({
    productId: input.productId,
    runId: input.runId,
    storyboardReviewId: input.storyboardReviewId,
  })) {
    await repo.ensureManualStoryboardParents?.({
      tenantId,
      userId: input.auth.userId,
      productId: input.productId,
      runId: input.runId,
      storyboardReviewId: input.storyboardReviewId,
      now,
    });
  }

  const reservedCredits = buildReservedCredits({
    tenantId,
    userId: input.auth.userId,
    runId: input.runId,
    quality: input.quality,
    output: input.output,
    previewCompositionHash: input.expectedPreviewCompositionHash,
    shotCount: payload.shots.length,
  });
  const billing = await reserveCredits({
    userId: input.auth.userId,
    tenantId,
    requestedCredits: reservedCredits,
    metadata: {
      jobType: "storyboard_preview_match_capture",
      productId: input.productId,
      runId: input.runId,
      storyboardReviewId: input.storyboardReviewId,
      quality: input.quality,
      previewCompositionHash: input.expectedPreviewCompositionHash,
      timelineHash: input.expectedTimelineHash,
      finalCompositeConfigHash: input.finalCompositeConfigHash,
    },
  });
  const captureJobId = buildCaptureId({
    tenantId,
    runId: input.runId,
    previewCompositionHash: input.expectedPreviewCompositionHash,
    timelineHash: input.expectedTimelineHash,
    quality: input.quality,
    idempotencyKey,
  });

  try {
    let job = await repo.insertJob({
      id: captureJobId,
      tenantId,
      userId: input.auth.userId,
      productId: input.productId,
      runId: input.runId,
      storyboardReviewId: input.storyboardReviewId,
      engine: "preview_match_browser_capture",
      quality: input.quality,
      status: "queued",
      stage: "queue",
      progressPercent: 0,
      failureCode: null,
      safeMessage: "รอเริ่ม Capture ตาม Preview",
      safeDiagnosticsJson: ["Queued as storyboard_preview_match_capture_jobs; server verification is required before output is published."],
      idempotencyKey,
      previewCompositionHash: input.expectedPreviewCompositionHash,
      timelineHash: input.expectedTimelineHash,
      finalCompositeConfigHash: input.finalCompositeConfigHash,
      payloadJson: payload as unknown as Record<string, unknown>,
      outputJson: {},
      evidenceJson: {},
      billingJson: {
        status: "reserved",
        reservation: billing,
        reservedCredits: billing.reservedCredits,
      },
      activeAttemptId: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null,
    });
    try {
      const dispatchCaptureJob = deps.dispatchCaptureJob ?? dispatchPreviewMatchCaptureJob;
      await dispatchCaptureJob({ captureJobId: job.id, tenantId });
      job = await repo.updateJob(job.id, {
        safeDiagnosticsJson: [
          "Queued as storyboard_preview_match_capture_jobs; server verification is required before output is published.",
          "Dispatched to storyboard_preview_match_capture worker.",
        ],
      }) ?? job;
    } catch (dispatchError) {
      job = await repo.updateJob(job.id, {
        status: "failed_transient",
        stage: null,
        progressPercent: 0,
        failureCode: "server_worker_disabled",
        safeMessage: "เริ่ม Capture ตาม Preview ไม่สำเร็จ เพราะ worker dispatch ไม่พร้อม",
        safeDiagnosticsJson: [
          "Failed to dispatch storyboard_preview_match_capture worker after job insert.",
          dispatchError instanceof Error ? dispatchError.message.slice(0, 240) : "Unknown dispatch error",
        ],
      }) ?? job;
    }
    return {
      capture: projectionFromPreviewMatchCaptureJob(job),
      invalidates: [...INVALIDATES],
    };
  } catch (error) {
    try {
      await reconcileCredits({
        userId: input.auth.userId,
        tenantId,
        jobId: captureJobId,
        billing,
        finalStatus: "failed",
        metadata: { reason: "insert_failed_after_reservation" },
      });
    } catch (reconcileError) {
      console.error("[PreviewMatchCapture] Failed to reconcile credits after job creation failure.", {
        tenantId,
        userId: input.auth.userId,
        captureJobId,
        error: safeErrorMessage(reconcileError),
      });
    }
    const raced = await repo.findJobByIdempotencyKey(tenantId, idempotencyKey);
    if (raced) {
      return {
        capture: projectionFromPreviewMatchCaptureJob(raced),
        invalidates: [...INVALIDATES],
      };
    }
    if (error instanceof TRPCError) throw error;
    console.error("[PreviewMatchCapture] Failed to create capture job after credit reservation.", {
      tenantId,
      userId: input.auth.userId,
      productId: input.productId,
      runId: input.runId,
      storyboardReviewId: input.storyboardReviewId,
      captureJobId,
      error: safeErrorMessage(error),
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "เริ่ม Capture ตาม Preview ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
    });
  }
}

export async function getPreviewMatchCaptureJobForApi(
  input: GetPreviewMatchCaptureJobInput & { auth: HyperframesAuthContext },
  deps: StoryboardPreviewMatchCaptureDeps = {},
) {
  const repo = deps.repo ?? defaultRepo;
  const tenantId = tenantIdFromAuth(input.auth);
  const foundJob = input.captureJobId
    ? await repo.findJobById({
        tenantId,
        userId: input.auth.userId,
        captureJobId: input.captureJobId,
        productId: input.productId,
        runId: input.runId,
      })
    : await repo.findLatestJob({
        tenantId,
        userId: input.auth.userId,
        productId: input.productId,
        runId: input.runId,
        storyboardReviewId: input.storyboardReviewId,
      });
  if (!foundJob) {
    return {
      capture: {
        captureJobId: null,
        engine: "preview_match_browser_capture" as const,
        quality: "standard" as const,
        status: "not_started" as const,
        stage: null,
        progressPercent: 0,
        previewCompositionHash: null,
        timelineHash: null,
        safeMessage: "ยังไม่มี Capture ตาม Preview",
        safeDiagnostics: [],
        failureCode: null,
        canCancel: false,
        canRetry: false,
        outputUrl: null,
        libraryItemId: null,
        evidenceRef: null,
      },
      invalidates: [],
    };
  }
  const runtimeConfig = await runtimeConfigFromDeps(input.auth, deps);
  const job = !runtimeConfig.serverWorkerEnabled &&
    ACTIVE_CAPTURE_STATUSES.has(foundJob.status as StoryboardPreviewMatchCaptureStatus)
      ? await repo.updateJob(foundJob.id, {
          status: "blocked",
          stage: null,
          progressPercent: Math.max(0, Number(foundJob.progressPercent ?? 0)),
          failureCode: "server_worker_disabled",
          safeMessage: "Preview-match capture worker ยังไม่ได้เปิดใช้งาน งานนี้จึงไม่สามารถดำเนินต่อได้",
          safeDiagnosticsJson: [
            "STORYBOARD_PREVIEW_MATCH_CAPTURE_SERVER_WORKER_ENABLED is not enabled; the job was blocked instead of waiting in queue.",
          ],
        }) ?? foundJob
      : foundJob;
  return {
    capture: projectionFromPreviewMatchCaptureJob(job),
    invalidates: [],
  };
}

export async function cancelPreviewMatchCaptureJobForApi(
  input: CancelPreviewMatchCaptureJobInput & { auth: HyperframesAuthContext },
  deps: StoryboardPreviewMatchCaptureDeps = {},
) {
  const repo = deps.repo ?? defaultRepo;
  const reconcileCredits = deps.reconcileCredits ?? reconcileWorkerJobCredits;
  const tenantId = tenantIdFromAuth(input.auth);
  const current = await repo.findJobById({
    tenantId,
    userId: input.auth.userId,
    captureJobId: input.captureJobId,
    productId: input.productId,
    runId: input.runId,
  });
  if (!current) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Preview-match capture job was not found.",
    });
  }
  if (!ACTIVE_CAPTURE_STATUSES.has(current.status as StoryboardPreviewMatchCaptureStatus)) {
    return {
      capture: projectionFromPreviewMatchCaptureJob(current),
      invalidates: [...INVALIDATES],
    };
  }
  const billing = billingMetadataFromJob(current).billing;
  await repo.markActiveAttemptStale(current.id, "capture_cancelled");
  if (billing) {
    await reconcileCredits({
      userId: input.auth.userId,
      tenantId,
      jobId: current.id,
      billing,
      finalStatus: "canceled",
      metadata: { reason: "user_cancelled_preview_match_capture" },
    });
  }
  const updated = await repo.updateJob(current.id, {
    status: "cancelled",
    stage: null,
    progressPercent: Math.max(0, Number(current.progressPercent ?? 0)),
    failureCode: "cancelled",
    safeMessage: "ยกเลิก Capture ตาม Preview แล้ว",
    billingJson: {
      ...current.billingJson,
      status: billing ? "refunded" : "none",
    },
    cancelledAt: deps.now?.() ?? new Date(),
  });
  return {
    capture: projectionFromPreviewMatchCaptureJob(updated ?? current),
    invalidates: [...INVALIDATES],
  };
}

export async function createPreviewMatchCaptureAttempt(input: {
  captureJobId: string;
  routeTokenHash?: string | null;
  deps?: StoryboardPreviewMatchCaptureDeps;
}) {
  const repo = input.deps?.repo ?? defaultRepo;
  const attemptId = `spmca_${randomUUID()}`;
  const attempt = await repo.insertAttempt({
    id: attemptId,
    captureJobId: input.captureJobId,
    attemptNumber: 1,
    status: "active",
    stage: "prepare_assets",
    failureCode: null,
    routeTokenHash: input.routeTokenHash ?? null,
    assetManifestJson: {},
    workspaceJson: {},
    outputJson: {},
    evidenceJson: {},
    startedAt: input.deps?.now?.() ?? new Date(),
    completedAt: null,
    staleAt: null,
    cancelledAt: null,
    updatedAt: input.deps?.now?.() ?? new Date(),
  });
  await repo.updateJob(input.captureJobId, {
    activeAttemptId: attempt.id,
    status: "preparing_assets",
    stage: "prepare_assets",
    progressPercent: 10,
  });
  return attempt;
}

export async function getPreviewMatchCaptureRoutePayload(input: {
  captureJobId: string;
  attemptId: string;
  tenantId: string;
  deps?: StoryboardPreviewMatchCaptureDeps;
}) {
  const repo = input.deps?.repo ?? defaultRepo;
  const job = await repo.findJobForInternalRoute({
    tenantId: input.tenantId,
    captureJobId: input.captureJobId,
  });
  const attempt = await repo.findAttempt(input.captureJobId, input.attemptId);
  if (!job || !attempt || attempt.staleAt || attempt.cancelledAt) {
    return null;
  }
  const payload = previewMatchCompositionPayloadSchema.parse(job.payloadJson);
  return {
    job,
    attempt,
    payload,
  };
}
