/**
 * Video Intelligence Platform — `videoProjects` tRPC router (Feature 133,
 * section-07 — the integrator). Ties together sections 01 (neutral schema +
 * compiler), 02 (motion template registry), 03 (worker contract), 04 (queue
 * + Lane-A worker), 05 (DB tables + repo), and 06 (claim validation + QA
 * loop) behind a single product-facing surface.
 *
 * All procedures are `protectedProcedure`, tenant+owner scoped, gated by
 * feature flag F133A (`videoIntelligencePlatformEnabled`). See
 * `specs/feature/133-content-video-intelligence-platform/sections/section-07-router-async-queue-harness.md`.
 *
 * The conductor wires this router into `server/routers.ts` — do NOT edit
 * that file here (only the registration diff belongs there).
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { auditLogger, type AuditEventType } from "../services/auditLogger";
import { debugError } from "../_core/logger";
import { db } from "../db";
import { mediaAssets } from "../../drizzle/schema";

import {
  VideoProjectDocumentSchema,
  type VideoProjectDocument,
  type Scene,
  type CaptionCue,
  type ClaimRecord,
} from "../../shared/videoIntelligence/projectSchemas";
import type { BrandKit } from "../../shared/videoIntelligence/brandKit";
import type { RemotionTemplateConfig } from "../../shared/remotion/layerTemplateSchemas";
import {
  compileVideoProject,
  VideoProjectCompileError,
  BrandLockViolationError,
  type TemplateBuildContext,
  type CompileResult,
} from "../services/videoProjectCompiler";
import { MOTION_TEMPLATE_REGISTRY } from "../remotion/templates";
import { selectTemplatesFor } from "../../shared/videoIntelligence/motionTemplates";
import {
  resolveProjectAssets,
  buildAssetManifest,
  fallbackAssetSourceHash,
  assertSceneLayerAssetUrlsAllowed,
  type AssetManifest,
} from "../services/videoProjectAssetResolver";
import {
  insertVideoProject,
  getVideoProject,
  listVideoProjects,
  saveVideoProjectDocument,
  listVideoProjectRevisions,
  restoreVideoProjectRevision,
  updateVideoProjectFields,
  deleteVideoProject,
  insertBrandKit,
  getBrandKit,
  listBrandKits,
  updateBrandKit,
  deleteBrandKit,
  VideoProjectRevisionConflictError,
  VideoProjectNotFoundError,
  type ProjectAuthScope,
} from "../services/videoProjectRepo";
import { queueRemotionRenderVideoJob } from "../services/workerSchedulerService";
import {
  REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
  REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
  type RemotionRenderVideoWorkerInput,
} from "../../shared/workerRuntime";
import {
  dispatchLaneARemotionRenderJob,
  enqueueVideoIntelligenceJob,
  getGenerationJobStatus as getVideoIntelligenceJobStatus,
  getActiveGenerationJob as getActiveVideoIntelligenceJob,
  type VideoIntelligenceJobExecutor,
  type VideoIntelligenceJobPayload,
  type VideoIntelligenceJobProgress,
} from "../services/videoIntelligenceJobs";
import { validateProjectClaims, type ResolvedCatalogFacts } from "../services/validateProjectClaims";
import { computeQualityMetrics } from "../services/videoProjectQualityMetrics";
import { synthesize, calculateTTSCredits } from "../services/ttsService";
import { hasEnoughCredits, deductCredits } from "../services/creditService";
import { storagePut } from "../storage";
import {
  renderTranscriptCuesAsSrt,
  renderTranscriptCuesAsVtt,
  type HyperframesTranscriptCue,
} from "../services/hyperframesTranscriptionService";
import { listMarketplaceInsightsByProduct } from "../services/marketplaceInsightService";

/* -------------------------------------------------------------------------- */
/* Zod input building blocks                                                  */
/* -------------------------------------------------------------------------- */

const STUDIO_TYPE_SCHEMA = z.enum(["catalog", "motion", "content", "review_remix", "imported"]);
const PROJECT_STATUS_SCHEMA = z.enum([
  "brief",
  "content",
  "narration",
  "scenes",
  "motion",
  "assets",
  "captions",
  "qa",
  "ready",
  "rendering",
  "completed",
  "failed",
]);
const RENDER_PROFILE_SCHEMA = z.enum(["preview", "final"]);
const STAGE_ORDER = [
  "brief",
  "content",
  "narration",
  "scenes",
  "motion",
  "assets",
  "captions",
  "qa",
  "ready",
] as const;

/* -------------------------------------------------------------------------- */
/* Base procedures — F133A flag gate + rate limits (spec §18.5)              */
/* -------------------------------------------------------------------------- */

/** CRUD-style procedures (create/get/list/update/delete/listRevisions/…): ≤60/min per user. */
const videoIntelligenceCrudProcedure = protectedProcedure
  .use(requireFeatureFlag("videoIntelligencePlatformEnabled"))
  .use(createRateLimitMiddleware({ namespace: "video-projects-crud", limit: 60, windowMs: 60_000 }));

/** Generation-stage runners (LLM/TTS work, render submission): ≤20/min per user
 *  (render submissions themselves are further capped to ≤6/min inside
 *  `queueRemotionRenderVideoJob`, section-04 — this router does not
 *  re-implement that cap). */
const videoIntelligenceGenProcedure = protectedProcedure
  .use(requireFeatureFlag("videoIntelligencePlatformEnabled"))
  .use(createRateLimitMiddleware({ namespace: "video-projects-gen", limit: 20, windowMs: 60_000 }));

type RouterCtx = { tenantId: string | null; user: { id: number; role?: string | null } | null };

/** Owner+tenant auth scope. Throws before any DB call when either is missing. */
function requireAuthScope(ctx: RouterCtx): ProjectAuthScope {
  if (!ctx.tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Video Intelligence Platform is not available (no tenant context)",
    });
  }
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return { tenantId: ctx.tenantId, userId: ctx.user.id };
}

/**
 * Manual, testable double of the `.use(requireFeatureFlag(...))` middleware
 * gate — called first inside EVERY handler body so the "flag off -> zero
 * extra db.select" contract (section-07 §2.1) is provable at the unit-test
 * level even when a test's mocked `_core/trpc` collapses `.use()` into a
 * no-op passthrough (the established router-test convention, see
 * `verticalDramaEpisodes.textOverlayPlan.test.ts`'s second-layer-flag
 * pattern). The real `requireFeatureFlag` middleware is still layered on
 * `videoIntelligence{Crud,Gen}Procedure` above as defense-in-depth for the
 * live server (never mocked away there).
 */
async function assertVideoIntelligenceEnabled(tenantId: string | null): Promise<void> {
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Video Intelligence Platform is not available (no tenant context)",
    });
  }
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.videoIntelligencePlatformEnabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Video Intelligence Platform (F133A) is not enabled for this tenant",
    });
  }
}

/**
 * F133-03/FE02 (MEDIUM, pre-merge security gate — both the backend and
 * frontend security audits independently found this gap): the per-studio
 * flags (`videoIntelligenceCatalogStudioEnabled` (F133C),
 * `videoIntelligenceMotionStudioEnabled`) were previously enforced ONLY
 * client-side (hiding the create button) — `create` never checked
 * `input.studioType` against its corresponding tenant flag, so a disabled
 * studio was still reachable via a direct API call even with the master
 * F133A flag on. Mirrors `assertVideoIntelligenceEnabled`'s exact
 * fail-closed pattern (never a parallel mechanism) for the sub-flag.
 */
const STUDIO_TYPE_REQUIRED_FLAG: Partial<
  Record<z.infer<typeof STUDIO_TYPE_SCHEMA>, keyof Awaited<ReturnType<typeof getTenantFeatureFlags>>>
> = {
  catalog: "videoIntelligenceCatalogStudioEnabled",
  motion: "videoIntelligenceMotionStudioEnabled",
};

async function assertStudioTypeEnabled(
  tenantId: string | null,
  studioType: z.infer<typeof STUDIO_TYPE_SCHEMA>,
): Promise<void> {
  const requiredFlag = STUDIO_TYPE_REQUIRED_FLAG[studioType];
  if (!requiredFlag) return; // No dedicated sub-flag for this studioType (e.g. content/review_remix/imported).
  if (!tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Video Intelligence Platform is not available (no tenant context)",
    });
  }
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags[requiredFlag]) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Video Intelligence "${studioType}" studio (${requiredFlag}) is not enabled for this tenant`,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Observability (spec §19 — reuse the existing audit logger, never invent)  */
/* -------------------------------------------------------------------------- */

function mintTraceId(): string {
  return auditLogger.createTrace();
}

function logStage(
  stage: string,
  projectId: number,
  traceId: string,
  phase: "start" | "finish",
  extra?: Record<string, unknown>,
): void {
  auditLogger.log({
    // "video_project_stage" is not (yet) a member of the shared
    // `AuditEventType` union — cast, mirroring the SAME established pattern
    // `hyperframesRenderWorker.ts`'s `auditLogRemotionRenderEvent` already
    // uses for its own new event names, so this file never has to modify
    // the shared `auditLogger.ts` enum (a prior-section/platform-owned
    // file outside this section's scope).
    eventType: "video_project_stage" as AuditEventType,
    traceId,
    userId: null,
    metadata: { stage, projectId, phase, ...extra },
  });
}

/* -------------------------------------------------------------------------- */
/* Compile error mapping (spec §20 — specific VI_* codes, never blanket)     */
/* -------------------------------------------------------------------------- */

function mapCompileError(error: unknown): never {
  if (error instanceof VideoProjectCompileError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `${error.code}: ${error.message}` });
  }
  if (error instanceof BrandLockViolationError) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `VI_BRAND_LOCK_VIOLATION: ${error.message}` });
  }
  throw error;
}

/* -------------------------------------------------------------------------- */
/* Shared compile pipeline (resolve assets -> brand kit -> compile)          */
/* -------------------------------------------------------------------------- */

async function resolveBrandKitForDocument(
  auth: ProjectAuthScope,
  document: VideoProjectDocument,
): Promise<BrandKit | null> {
  if (!document.brandKitId) return null;
  const brandKitId = Number(document.brandKitId);
  if (!Number.isInteger(brandKitId) || brandKitId <= 0) return null;
  const row = await getBrandKit(auth, brandKitId);
  if (!row) return null;
  return {
    colors: (row.colors as BrandKit["colors"] | null) ?? { primary: "#ffffff" },
    fonts: (row.fonts as BrandKit["fonts"] | null) ?? { heading: "Inter", body: "Inter" },
    captionPresetId: (row.captionPresetId as BrandKit["captionPresetId"] | null) ?? null,
    locks: (row.locks as BrandKit["locks"] | null) ?? {},
  };
}

async function loadDocumentOrThrow(
  auth: ProjectAuthScope,
  projectId: number,
): Promise<{ projectRow: Awaited<ReturnType<typeof getVideoProject>> & object; document: VideoProjectDocument }> {
  const projectRow = await getVideoProject(auth, projectId);
  if (!projectRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
  }
  const parsed = VideoProjectDocumentSchema.safeParse(projectRow.document);
  if (!parsed.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `VI_DOCUMENT_INVALID: ${parsed.error.message}`,
    });
  }
  return { projectRow, document: parsed.data };
}

async function compileProjectInternal(auth: ProjectAuthScope, projectId: number) {
  const { projectRow, document } = await loadDocumentOrThrow(auth, projectId);

  const resolver = await resolveProjectAssets(document, auth).catch(mapCompileError);
  const brandKit = await resolveBrandKitForDocument(auth, document);

  const buildCtx: TemplateBuildContext = {
    format: document.format,
    brandKit,
    assetResolver: resolver,
  };

  let compileResult: CompileResult;
  try {
    compileResult = compileVideoProject(document, buildCtx, {
      resolveTemplate: id => MOTION_TEMPLATE_REGISTRY[id as keyof typeof MOTION_TEMPLATE_REGISTRY],
    });
  } catch (error) {
    return mapCompileError(error);
  }

  return { projectRow, document, resolver, compileResult };
}

/* -------------------------------------------------------------------------- */
/* Preview downscale (spec §18.2 — ≤540×960 / fps≤15, on a config COPY)      */
/* -------------------------------------------------------------------------- */

const PREVIEW_MAX_WIDTH = 540;
const PREVIEW_MAX_HEIGHT = 960;
const PREVIEW_MAX_FPS = 15;

/**
 * Returns a downscaled COPY of the compiled config — spatial dims capped to
 * ≤540×960 (layer `x`/`y`/`width`/`height` are percent-of-canvas, so they
 * need no adjustment), fps capped to ≤15 with every layer's frame-based
 * `startFrame`/`durationFrames` (and the config's own `durationInFrames`)
 * rescaled proportionally so wall-clock timing is preserved.
 */
function downscaleConfigForPreview(config: RemotionTemplateConfig): RemotionTemplateConfig {
  const widthScale = config.width > PREVIEW_MAX_WIDTH ? PREVIEW_MAX_WIDTH / config.width : 1;
  const heightScale = config.height > PREVIEW_MAX_HEIGHT ? PREVIEW_MAX_HEIGHT / config.height : 1;
  const spatialScale = Math.min(widthScale, heightScale, 1);

  const width = Math.max(2, Math.round((config.width * spatialScale) / 2) * 2);
  const height = Math.max(2, Math.round((config.height * spatialScale) / 2) * 2);

  const fps = Math.min(config.fps, PREVIEW_MAX_FPS);
  const frameScale = config.fps > 0 ? fps / config.fps : 1;

  const layers = config.layers.map(layer => ({
    ...layer,
    startFrame: Math.round(layer.startFrame * frameScale),
    durationFrames: Math.max(1, Math.round(layer.durationFrames * frameScale)),
  })) as RemotionTemplateConfig["layers"];

  const durationInFrames = Math.max(1, Math.round(config.durationInFrames * frameScale));

  return { ...config, width, height, fps, layers, durationInFrames };
}

/* -------------------------------------------------------------------------- */
/* Catalog facts resolution for the final-render claim gate (§4.4 step 2,    */
/* cross-section consistency resolution #5)                                  */
/* -------------------------------------------------------------------------- */

async function resolveCatalogFactsForProject(
  productIds: string[],
  auth: ProjectAuthScope,
): Promise<ResolvedCatalogFacts> {
  const claimResolutions: ResolvedCatalogFacts["claimResolutions"] = [];

  for (const productId of productIds) {
    try {
      const insights = (await listMarketplaceInsightsByProduct(productId, {
        userId: auth.userId,
        tenantId: auth.tenantId,
      })) as Array<{ claimResolutionsJson?: unknown[] }>;

      for (const insight of insights) {
        const resolutions = Array.isArray(insight.claimResolutionsJson) ? insight.claimResolutionsJson : [];
        for (const raw of resolutions as Array<Record<string, unknown>>) {
          const claimText =
            typeof raw.editedText === "string" && raw.editedText.trim().length > 0
              ? raw.editedText
              : typeof raw.claimId === "string"
                ? raw.claimId
                : null;
          if (!claimText) continue;

          const decision = typeof raw.decision === "string" ? raw.decision : "";
          const status: ClaimRecord["status"] =
            decision === "approve" || decision === "approved"
              ? "approved"
              : decision === "reject" || decision === "rejected" || decision === "prohibited"
                ? "prohibited"
                : decision === "unsupported"
                  ? "unsupported"
                  : "needs_review";

          claimResolutions.push({ claim: claimText, source: `marketplace_insight:${productId}`, status });
        }
      }
    } catch (error) {
      // Best-effort per product — a single unreachable/foreign product must
      // not abort the whole claim-gate resolution for the others.
      debugError("videoProjects", `Failed to resolve catalog facts for product ${productId}`, error);
    }
  }

  // Phase-1 simplification (documented): price-snapshot facts are not
  // fetched here yet — `priceFacts` is optional on `ResolvedCatalogFacts`
  // and price/promotion staleness is a fact for the QA judge, never a hard
  // block (section-06 §5.1), so omitting it does not weaken the
  // `blocksFinalRender` gate this procedure enforces.
  return { productIds, claimResolutions };
}

/* -------------------------------------------------------------------------- */
/* Caption cue derivation (pure — unit-tested directly)                      */
/* -------------------------------------------------------------------------- */

const CAPTION_CHUNK_MAX_CHARS = 84; // ~2 short lines/screen (≈42 chars/line)

/**
 * Chunks narration text into caption-sized cues and times them
 * proportionally across `[sceneStartMs, sceneEndMs)` (scene-relative
 * `startMs`/`endMs`, matching `CaptionCueSchema`). Pure: same input always
 * produces the same output. Empty/whitespace-only narration or a
 * zero/negative-duration scene window returns `[]`.
 */
export function deriveCaptionCues(
  narration: string,
  sceneStartMs: number,
  sceneEndMs: number,
): CaptionCue[] {
  const trimmed = narration.trim();
  if (!trimmed) return [];

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > CAPTION_CHUNK_MAX_CHARS) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);

  const sceneDurationMs = Math.max(0, sceneEndMs - sceneStartMs);
  if (sceneDurationMs <= 0 || chunks.length === 0) return [];

  const perChunkMs = sceneDurationMs / chunks.length;
  return chunks.map((text, index) => {
    const startMs = Math.round(index * perChunkMs);
    const rawEndMs = index === chunks.length - 1 ? sceneDurationMs : Math.round((index + 1) * perChunkMs);
    return { startMs, endMs: Math.max(startMs + 1, rawEndMs), text };
  });
}

/**
 * implementation-progress.md gap #3 closure — flattens every scene's
 * (already-persisted, scene-relative-ms) `captionCues` into the render
 * worker contract's absolute-timeline-seconds `captionLines` shape:
 * `scene.startMs + cue.{start,end}Ms`, converted ms -> sec. Pure (same input
 * always produces the same output); scenes/cues with no text are skipped.
 * Mirrors `exportCaptions`'s own `(scene.startMs + cue.startMs) / 1000`
 * offset-and-convert math so the burned-in captions and the exported
 * SRT/VTT are always in agreement.
 */
export function buildCaptionLinesForRender(
  document: VideoProjectDocument,
): NonNullable<RemotionRenderVideoWorkerInput["captionLines"]> {
  const lines: NonNullable<RemotionRenderVideoWorkerInput["captionLines"]> = [];
  for (const scene of document.scenes) {
    for (const cue of scene.captionCues) {
      if (!cue.text.trim()) continue;
      lines.push({
        startSec: (scene.startMs + cue.startMs) / 1000,
        endSec: (scene.startMs + cue.endMs) / 1000,
        text: cue.text,
      });
    }
  }
  return lines;
}

/* -------------------------------------------------------------------------- */
/* Async job executor (kind-specific logic, dispatched by                    */
/* videoIntelligenceJobs.ts's BullMQ worker + this router's own queries)     */
/* -------------------------------------------------------------------------- */

/**
 * Phase 1 scope boundary (documented, not a bug): the scene-plan and
 * quality-review/-repair LLM stages enqueue real jobs with real
 * ownership/traceId/queue plumbing (fully wired and testable), but the
 * actual skill/LLM invocation inside each is intentionally NOT fabricated
 * here — per the platform's skill-first rule
 * (`memory/feedback_skill_first_authoring.md`: "TS only computes facts as
 * review input, never hardcode... a hard-gate that replaces LLM judgment"),
 * synthesizing a fake score or fake scene plan in TS would be worse than
 * leaving it unwired. Each stage below computes its real, deterministic
 * facts (metrics/claim validation) and then fails the job with a specific,
 * greppable `VI_*_NOT_WIRED` error rather than fabricating judgment.
 */
async function executeScenePlanStage(
  payload: VideoIntelligenceJobPayload,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "scene_plan_start" });
  throw new Error(
    "VI_SCENE_PLAN_NOT_WIRED: the scene-plan LLM stage is not yet wired to a skill in Phase 1",
  );
}

async function executeQualityReviewStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "quality_review_metrics" });
  const { document, compileResult } = await compileProjectInternal(auth, payload.projectId);
  const cost = compileResult.cost;

  const claimValidation = validateProjectClaims(document, null);
  const metrics = computeQualityMetrics({ document, claimValidation, renderCost: cost });
  onProgress({ stage: "quality_review_metrics_done" });

  throw new Error(
    `VI_QUALITY_REVIEW_NOT_WIRED: the video-project-quality-review skill invocation is not yet wired in Phase 1 (computed metrics: layers=${metrics.layerCounts.total}, claimCoverage=${metrics.claimCoverage.coverage})`,
  );
}

async function executeQualityRepairStage(
  payload: VideoIntelligenceJobPayload,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "quality_repair_start" });
  throw new Error(
    "VI_QUALITY_REPAIR_NOT_WIRED: automated quality-repair application is not yet wired in Phase 1",
  );
}

/** BullMQ worker entry point (`videoIntelligenceJobs.ts`'s `initVideoIntelligenceJobsQueue`
 *  dynamically imports this). Dispatches by `payload.kind`. */
export const runVideoIntelligenceJobExecutor: VideoIntelligenceJobExecutor = async (
  payload,
  onProgress,
) => {
  const auth: ProjectAuthScope = { tenantId: payload.tenantId, userId: payload.userId };
  switch (payload.kind) {
    case "scene_plan":
      return executeScenePlanStage(payload, onProgress);
    case "narration":
      // `runNarrationStage` (below) runs narration synchronously in the
      // mutation itself (documented deviation from the general "stage
      // runners enqueue and return a jobId" framing — TTS synthesis for a
      // handful of scenes is a bounded, sub-few-second operation, and the
      // explicit test contract (section-07 §2.4) asserts synchronous
      // side effects/return values). This queue kind is reserved for a
      // future async narration path and is a documented no-op today.
      onProgress({ stage: "narration_noop" });
      return { skipped: true, reason: "narration runs synchronously via runNarrationStage" };
    case "quality_review":
      return executeQualityReviewStage(payload, auth, onProgress);
    case "quality_repair":
      return executeQualityRepairStage(payload, onProgress);
    default:
      throw new Error(`Unknown video intelligence job kind: ${(payload as { kind: string }).kind}`);
  }
};

/* -------------------------------------------------------------------------- */
/* brandKits sub-router (§4.5)                                               */
/* -------------------------------------------------------------------------- */

const brandKitsRouter = router({
  create: videoIntelligenceCrudProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(200),
        logoAssetId: z.number().int().positive().nullable().optional(),
        colors: z
          .object({
            primary: z.string().min(1),
            secondary: z.string().optional(),
            accent: z.string().optional(),
          })
          .optional(),
        fonts: z.object({ heading: z.string().min(1), body: z.string().min(1) }).optional(),
        captionPresetId: z.string().min(1).nullable().optional(),
        locks: z
          .object({
            colors: z.boolean().optional(),
            fonts: z.boolean().optional(),
            iconStyle: z.boolean().optional(),
            motionIntensity: z.boolean().optional(),
            cta: z.boolean().optional(),
            productFidelity: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return insertBrandKit(auth, {
        name: input.name,
        logoAssetId: input.logoAssetId ?? null,
        colors: input.colors ?? null,
        fonts: input.fonts ?? null,
        captionPresetId: input.captionPresetId ?? null,
        locks: input.locks ?? null,
      } as never);
    }),

  list: videoIntelligenceCrudProcedure.query(async ({ ctx }) => {
    await assertVideoIntelligenceEnabled(ctx.tenantId);
    const auth = requireAuthScope(ctx);
    return listBrandKits(auth);
  }),

  get: videoIntelligenceCrudProcedure
    .input(z.object({ brandKitId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const row = await getBrandKit(auth, input.brandKitId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Brand kit not found" });
      return row;
    }),

  update: videoIntelligenceCrudProcedure
    .input(
      z.object({
        brandKitId: z.number().int().positive(),
        name: z.string().trim().min(1).max(200).optional(),
        logoAssetId: z.number().int().positive().nullable().optional(),
        colors: z.record(z.string(), z.unknown()).optional(),
        fonts: z.record(z.string(), z.unknown()).optional(),
        captionPresetId: z.string().min(1).nullable().optional(),
        locks: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { brandKitId, ...patch } = input;
      const row = await updateBrandKit(auth, brandKitId, patch as never);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Brand kit not found" });
      return row;
    }),

  delete: videoIntelligenceCrudProcedure
    .input(z.object({ brandKitId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const deleted = await deleteBrandKit(auth, input.brandKitId);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Brand kit not found" });
      return { success: true };
    }),
});

/* -------------------------------------------------------------------------- */
/* videoProjects router                                                       */
/* -------------------------------------------------------------------------- */

export const videoProjectsRouter = router({
  /* ---- 4.1 CRUD + optimistic concurrency ---------------------------------- */

  create: videoIntelligenceCrudProcedure
    .input(
      z.object({
        studioType: STUDIO_TYPE_SCHEMA,
        name: z.string().trim().min(1).max(200),
        brief: z.record(z.string(), z.unknown()).optional(),
        brandKitId: z.number().int().positive().optional(),
        // implementation-progress.md gap #1 (CLOSED): without this,
        // `video_projects.sourceRefs.productIds` is never populated for
        // Catalog Studio projects, so `queueRender(profile: "final")`'s
        // `ResolvedCatalogFacts` resolution (and therefore the claim gate,
        // §4.4 step 2) is always a no-op — see `resolveCatalogFactsForProject`
        // + `queueRender` below, which already read `projectRow.sourceRefs`.
        sourceRefs: z
          .object({ productIds: z.array(z.string().trim().min(1)).optional() })
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      await assertStudioTypeEnabled(ctx.tenantId, input.studioType);
      const auth = requireAuthScope(ctx);
      return insertVideoProject(auth, {
        studioType: input.studioType,
        name: input.name,
        brief: input.brief ?? null,
        brandKitId: input.brandKitId ?? null,
        sourceRefs: input.sourceRefs ?? null,
      } as never);
    }),

  get: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const row = await getVideoProject(auth, input.projectId);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return row;
    }),

  list: videoIntelligenceCrudProcedure
    .input(
      z
        .object({
          studioType: STUDIO_TYPE_SCHEMA.optional(),
          status: PROJECT_STATUS_SCHEMA.optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return listVideoProjects(auth, input);
    }),

  updateBrief: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        brief: z.record(z.string(), z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const row = await updateVideoProjectFields(auth, input.projectId, { brief: input.brief });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return row;
    }),

  saveDocument: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1),
        document: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);

      const parsedDocument = VideoProjectDocumentSchema.safeParse(input.document);
      if (!parsedDocument.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `VI_DOCUMENT_INVALID: ${parsedDocument.error.message}`,
        });
      }

      // F133-01 checkpoint 1 (CRITICAL, pre-merge security gate): reject any
      // scene.layers[] image/video/audio `src` that isn't an internal
      // storage-proxy URL BEFORE it is ever persisted (spec §17.3). See
      // `resolveProjectAssets`'s own call to this same assertion for
      // checkpoint 2 (defense-in-depth at compile/render time).
      try {
        assertSceneLayerAssetUrlsAllowed(parsedDocument.data, "VI_DOCUMENT_INVALID");
      } catch (error) {
        mapCompileError(error);
      }

      try {
        return await saveVideoProjectDocument(auth, {
          id: input.projectId,
          baseRevision: input.baseRevision,
          document: parsedDocument.data,
          reason: "saveDocument",
        });
      } catch (error) {
        if (error instanceof VideoProjectRevisionConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        if (error instanceof VideoProjectNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  listRevisions: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return listVideoProjectRevisions(auth, input.projectId);
    }),

  restoreRevision: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive(), revision: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      try {
        return await restoreVideoProjectRevision(auth, {
          projectId: input.projectId,
          revision: input.revision,
        });
      } catch (error) {
        if (error instanceof VideoProjectNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: error.message });
        }
        throw error;
      }
    }),

  delete: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const deleted = await deleteVideoProject(auth, input.projectId);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return { success: true };
    }),

  /* ---- 4.2 Stage runners --------------------------------------------------- */

  runScenePlanStage: videoIntelligenceGenProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      const traceId = mintTraceId();
      logStage("scene_plan", input.projectId, traceId, "start");
      const { jobId } = await enqueueVideoIntelligenceJob({
        kind: "scene_plan",
        tenantId: auth.tenantId,
        userId: auth.userId,
        projectId: input.projectId,
        input: { traceId },
      });
      return { jobId, traceId };
    }),

  runNarrationStage: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        sceneIds: z.array(z.string().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const traceId = mintTraceId();
      logStage("narration", input.projectId, traceId, "start");

      const { projectRow, document } = await loadDocumentOrThrow(auth, input.projectId);

      const targetSceneIds = input.sceneIds ? new Set(input.sceneIds) : null;
      const targetScenes = document.scenes.filter(
        scene =>
          (!targetSceneIds || targetSceneIds.has(scene.sceneId)) &&
          typeof scene.narration === "string" &&
          scene.narration.trim().length > 0,
      );

      if (targetScenes.length === 0) {
        logStage("narration", input.projectId, traceId, "finish", { scenesNarrated: 0 });
        return { revision: projectRow.revision, scenesNarrated: 0, creditsCharged: 0 };
      }

      const totalChars = targetScenes.reduce(
        (sum, scene) => sum + (scene.narration?.trim().length ?? 0),
        0,
      );
      const creditsNeeded = calculateTTSCredits(totalChars);
      if (!(await hasEnoughCredits(auth.userId, creditsNeeded))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "VI_INSUFFICIENT_CREDITS: not enough credits for narration synthesis",
        });
      }

      const updatedScenesBySceneId = new Map<string, Scene>();
      for (const scene of targetScenes) {
        const narrationText = scene.narration!.trim();
        const tts = await synthesize(narrationText, { format: "mp3", provider: "openai" });

        const storageKey = `video-intelligence/${auth.tenantId}/${input.projectId}/narration/${scene.sceneId}-${Date.now()}.mp3`;
        const stored = await storagePut(storageKey, tts.audioBuffer, tts.contentType);

        const [assetRow] = await db
          .insert(mediaAssets)
          .values({
            tenantId: auth.tenantId,
            userId: auth.userId,
            sourceType: "video_intelligence_narration",
            status: "ready",
            storageKey: stored.key,
            originalUrl: stored.url,
            mimeType: tts.contentType,
            fileSize: tts.audioBuffer.byteLength,
          } as never)
          .returning();

        const captionCues =
          scene.captionCues.length > 0
            ? scene.captionCues
            : deriveCaptionCues(narrationText, scene.startMs, scene.endMs);

        updatedScenesBySceneId.set(scene.sceneId, {
          ...scene,
          narrationAudioAssetId: (assetRow as { id: number }).id,
          captionCues,
        });
      }

      const nextDocument: VideoProjectDocument = {
        ...document,
        scenes: document.scenes.map(scene => updatedScenesBySceneId.get(scene.sceneId) ?? scene),
      };

      let saveResult: { revision: number };
      try {
        saveResult = await saveVideoProjectDocument(auth, {
          id: input.projectId,
          baseRevision: projectRow.revision,
          document: nextDocument,
          reason: "narration",
        });
      } catch (error) {
        if (error instanceof VideoProjectRevisionConflictError) {
          throw new TRPCError({ code: "CONFLICT", message: error.message });
        }
        throw error;
      }

      await deductCredits({
        userId: auth.userId,
        amount: creditsNeeded,
        description: "Video Intelligence Platform — narration TTS synthesis",
        tenantId: auth.tenantId,
      });

      logStage("narration", input.projectId, traceId, "finish", {
        scenesNarrated: targetScenes.length,
        creditsCharged: creditsNeeded,
      });

      return {
        revision: saveResult.revision,
        scenesNarrated: targetScenes.length,
        creditsCharged: creditsNeeded,
      };
    }),

  runQualityReview: videoIntelligenceGenProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      const traceId = mintTraceId();
      logStage("quality_review", input.projectId, traceId, "start");
      const { jobId } = await enqueueVideoIntelligenceJob({
        kind: "quality_review",
        tenantId: auth.tenantId,
        userId: auth.userId,
        projectId: input.projectId,
        input: { traceId },
      });
      return { jobId, traceId };
    }),

  applyQualityRepairs: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        stages: z.array(z.string().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      const traceId = mintTraceId();
      logStage("quality_repair", input.projectId, traceId, "start");
      const { jobId } = await enqueueVideoIntelligenceJob({
        kind: "quality_repair",
        tenantId: auth.tenantId,
        userId: auth.userId,
        projectId: input.projectId,
        input: { traceId, stages: input.stages ?? [] },
      });
      return { jobId, traceId };
    }),

  approveStage: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      const currentIndex = STAGE_ORDER.indexOf(projectRow.status as (typeof STAGE_ORDER)[number]);
      const nextStatus =
        currentIndex >= 0 && currentIndex < STAGE_ORDER.length - 1
          ? STAGE_ORDER[currentIndex + 1]
          : projectRow.status;

      const row = await updateVideoProjectFields(auth, input.projectId, { status: nextStatus });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return row;
    }),

  rejectStage: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive(), reason: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      // Guided-mode "hold": keeps the current stage (no status advance).
      // `reason` is accepted for a future qaLedger append (Phase 2) — not
      // persisted yet in Phase 1 beyond this response echo.
      return { projectId: input.projectId, status: projectRow.status, reason: input.reason ?? null };
    }),

  /* ---- 4.3 Captions --------------------------------------------------------- */

  exportCaptions: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive(), format: z.enum(["srt", "vtt"]) }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { document } = await loadDocumentOrThrow(auth, input.projectId);

      const cues: HyperframesTranscriptCue[] = [];
      let index = 1;
      for (const scene of document.scenes) {
        for (const cue of scene.captionCues) {
          cues.push({
            index: index++,
            text: cue.text,
            start: (scene.startMs + cue.startMs) / 1000,
            end: (scene.startMs + cue.endMs) / 1000,
          });
        }
      }

      const content = input.format === "srt" ? renderTranscriptCuesAsSrt(cues) : renderTranscriptCuesAsVtt(cues);
      return { format: input.format, content };
    }),

  /* ---- 4.4 Render ------------------------------------------------------------ */

  getRenderCostEstimate: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { compileResult } = await compileProjectInternal(auth, input.projectId);
      return { cost: compileResult.cost };
    }),

  compileProject: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { compileResult } = await compileProjectInternal(auth, input.projectId);
      if (compileResult.kind === "single") {
        return { kind: "single" as const, config: compileResult.config, cost: compileResult.cost };
      }
      return {
        kind: "segmented" as const,
        parts: compileResult.parts,
        concat: compileResult.concat,
        cost: compileResult.cost,
      };
    }),

  queueRender: videoIntelligenceGenProcedure
    .input(z.object({ projectId: z.number().int().positive(), profile: RENDER_PROFILE_SCHEMA }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const traceId = mintTraceId();
      logStage("queue_render", input.projectId, traceId, "start", { profile: input.profile });

      const { projectRow, document, resolver, compileResult } = await compileProjectInternal(
        auth,
        input.projectId,
      );

      if (compileResult.kind === "segmented") {
        // Phase-1 contract limitation (documented, not a bug): the frozen
        // `remotionRenderVideoWorkerInputSchema` (section-03) carries a
        // SINGLE `remotionTemplate` per job — `segmentPlan` only records
        // `{ index, durationInFrames }` metadata, not a per-part payload
        // array, so a >40-layer segmented compile has no single-job render
        // path yet. Reject explicitly rather than silently rendering only
        // part 0.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "VI_SEGMENTED_RENDER_NOT_SUPPORTED: this project compiles to multiple segments " +
            "(>40 layers); segmented multi-job rendering is not yet wired in Phase 1",
        });
      }

      if (input.profile === "final") {
        const sourceRefs = (projectRow.sourceRefs as { productIds?: string[] } | null) ?? null;
        const productIds = sourceRefs?.productIds ?? [];

        // F133-02 (HIGH, pre-merge security gate): a Catalog Studio project
        // MUST have at least one product id before it can be final-rendered
        // — otherwise the claim gate below is silently skipped entirely
        // (`resolvedCatalog === null` short-circuits `validateProjectClaims`
        // to its vacuous "no catalog source" result), letting a
        // `studioType: "catalog"` project with prohibited claims render with
        // zero validation whenever `sourceRefs` was omitted (the `create`
        // input's `sourceRefs` is optional at the Zod level, so a direct API
        // call bypassing the UI's product-picker can always omit it). This
        // is only a valid no-op state for Motion Studio (`studioType !==
        // "catalog"`) projects, which never have a catalog source to begin
        // with.
        if (projectRow.studioType === "catalog" && productIds.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "VI_MISSING_SOURCE_REFS: a Catalog Studio project must have sourceRefs.productIds " +
              "set before it can be final-rendered (the claim-validation gate cannot run otherwise)",
          });
        }

        const resolvedCatalog =
          productIds.length > 0 ? await resolveCatalogFactsForProject(productIds, auth) : null;

        const claimResult = validateProjectClaims(document, resolvedCatalog);
        if (claimResult.blocksFinalRender) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              `VI_CLAIM_VIOLATION: ${claimResult.prohibitedClaims.length} prohibited claim(s), ` +
              `${claimResult.unmappedStatements.length} unmapped statement(s)`,
          });
        }
      }

      let configForRender = compileResult.config;
      if (input.profile === "preview") {
        configForRender = downscaleConfigForPreview(configForRender);
      }

      const manifest = buildAssetManifest(configForRender, resolver);
      const manifestWithHashes: AssetManifest = {
        sources: manifest.sources.map(source => ({
          ...source,
          sha256: source.sha256 ?? fallbackAssetSourceHash(source.url),
        })),
      };

      const workerInput: RemotionRenderVideoWorkerInput = {
        kind: "remotion_render_video",
        schemaVersion: 1,
        platformContractVersion: REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION,
        rendererPolicyVersion: REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION,
        videoProjectId: String(input.projectId),
        projectRevision: projectRow.revision,
        traceId,
        renderProfile: {
          profile: input.profile,
          width: configForRender.width,
          height: configForRender.height,
          fps: configForRender.fps,
          codec: "h264",
          loudnessNormalize: true,
          burnInAssCaptions: document.captions.burnIn,
        },
        remotionTemplate: configForRender,
        compositionId: "GenericTemplate",
        assetManifest: manifestWithHashes as RemotionRenderVideoWorkerInput["assetManifest"],
        // implementation-progress.md gap #3 (CLOSED): when `captions.burnIn`
        // is true, real caption cues are threaded through the additive,
        // optional `captionLines` field (section-03,
        // `shared/workerRuntime.ts`) so `hyperframesRenderWorker.ts`'s
        // `ass_burn` post-pass burns real cue text/timing instead of an
        // empty array. Absolute-timeline seconds, derived from each scene's
        // already-persisted `captionCues` (same offset-and-convert math as
        // `exportCaptions`, see `buildCaptionLinesForRender`).
        //
        // implementation-progress.md gap #3 follow-up (CLOSED): also thread
        // the author's chosen caption preset (`document.captions.presetId`)
        // through the additive, optional `captionPresetId` field so the
        // burned `.ass` file actually renders visible `Dialogue:` events
        // instead of the hardcoded `"no_subtitle_style"` sentinel (which
        // maps to "skip burn-in entirely" and previously made every burned
        // caption invisible regardless of `captionLines` content).
        postPasses: document.captions.burnIn ? ["loudnorm", "ass_burn"] : ["loudnorm"],
        segmentPlan: null,
        remotionTemplateHash: createHash("sha256").update(JSON.stringify(configForRender)).digest("hex"),
        durationInFrames: configForRender.durationInFrames,
        ...(document.captions.burnIn
          ? {
              captionLines: buildCaptionLinesForRender(document),
              captionPresetId: document.captions.presetId,
            }
          : {}),
      };

      const { created, job } = await queueRemotionRenderVideoJob({
        ...workerInput,
        tenantId: auth.tenantId,
        requestedByUserId: auth.userId,
        isAdminRequester: ctx.user?.role === "admin",
      });

      if (created) {
        await updateVideoProjectFields(
          auth,
          input.projectId,
          input.profile === "final" ? { renderJobId: job.id } : { previewJobId: job.id },
        ).catch(error => {
          debugError("videoProjects", `Failed to persist ${input.profile} worker job backlink`, error);
        });

        // Lane-A dispatch (closes implementation-progress.md gap #2 — see
        // `videoIntelligenceJobs.ts`'s module doc comment for the full
        // rationale). Fire-and-forget: the tRPC response returns
        // `{ workerJobId }` immediately; the render runs in the background
        // of this same in-process server.
        void dispatchLaneARemotionRenderJob({ tenantId: auth.tenantId, workerJobId: job.id }).catch(
          error => {
            debugError("videoProjects", `Lane-A dispatch failed for worker job ${job.id}`, error);
          },
        );
      }

      logStage("queue_render", input.projectId, traceId, "finish", { workerJobId: job.id, created });
      return { workerJobId: job.id, created };
    }),

  /* ---- 4.6 Motion template listing ------------------------------------------ */

  listMotionTemplates: videoIntelligenceCrudProcedure
    .input(
      z
        .object({
          categories: z.array(z.string()).optional(),
          durationMs: z.number().int().positive().optional(),
          aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      return selectTemplatesFor(input ?? {});
    }),

  /* ---- Async job polling (spec §15.3 — video_intelligence_jobs read surface) */

  getGenerationJobStatus: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive(), jobId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const record = await getVideoIntelligenceJobStatus(input.jobId, {
        tenantId: auth.tenantId,
        userId: auth.userId,
        projectId: input.projectId,
      });
      if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      return record;
    }),

  getActiveGenerationJob: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return getActiveVideoIntelligenceJob({
        tenantId: auth.tenantId,
        userId: auth.userId,
        projectId: input.projectId,
      });
    }),

  /* ---- 4.5 Brand kits -------------------------------------------------------- */

  brandKits: brandKitsRouter,
});

export type VideoProjectsRouter = typeof videoProjectsRouter;
