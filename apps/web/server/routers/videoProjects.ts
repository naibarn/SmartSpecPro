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
import { and, asc, desc, eq, ilike, inArray, isNotNull } from "drizzle-orm";

import { router, protectedProcedure } from "../_core/trpc";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";
import { auditLogger, type AuditEventType } from "../services/auditLogger";
import { debugError } from "../_core/logger";
import { db } from "../db";
import { mediaAssets, workerJobs } from "../../drizzle/schema";
import { mediaModels } from "../../drizzle/schema";

import {
  VideoProjectDocumentSchema,
  type VideoProjectDocument,
  type Scene,
  type CaptionCue,
  type ClaimRecord,
  VideoProjectNarrationSettingsSchema,
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
  buildFontManifestSources,
  mergeAssetManifests,
  fallbackAssetSourceHash,
  assertSceneLayerAssetUrlsAllowed,
  assertDocumentLayerIdsUnique,
  toAbsoluteUrl,
  toBrowserAssetUrl,
  type AssetManifest,
} from "../services/videoProjectAssetResolver";
import {
  insertVideoProject,
  getVideoProject,
  listVideoProjects,
  listVideoProjectsByProduct,
  saveVideoProjectDocument,
  listVideoProjectRevisions,
  restoreVideoProjectRevision,
  updateVideoProjectFields,
  deleteVideoProject,
  duplicateVideoProject,
  insertBrandKit,
  getBrandKit,
  listBrandKits,
  updateBrandKit,
  deleteBrandKit,
  appendQaLedgerEntry,
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
  type VideoIntelligenceJobKind,
  type VideoIntelligenceJobPayload,
  type VideoIntelligenceJobProgress,
} from "../services/videoIntelligenceJobs";
import { validateProjectClaims, type ResolvedCatalogFacts } from "../services/validateProjectClaims";
import { probeAudioDurationMs } from "../services/videoProjectAudioDuration";
import { retimeScenesToNarrationAudio } from "../services/videoProjectNarrationTiming";
import { VIDEO_AUTOMATION_MODES } from "../../shared/videoIntelligence/automationMode";
import {
  computeQualityMetrics,
  estimateVideoProjectQualityLoopCredits,
  computeLayerBudgetBreakdown,
} from "../services/videoProjectQualityMetrics";
import { synthesize, calculateTTSCredits } from "../services/ttsService";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLMDynamic } from "../services/creditService";
import { calculateCreditCost } from "../services/pricingCalculator";
import { mediaGenerationService, type AudioModel } from "../services/mediaGenerationService";
import { signBearerToken } from "../_core/tokens";
import { getCachedPublicAppUrl } from "../services/appRuntimeConfig";
import { transcribeAudio } from "../_core/voiceTranscription";
import { buildVideoIntelligenceCreditContext } from "../services/videoIntelligenceCreditGuards";
import { assertR2StorageActive, storagePut, storageResolveUrl } from "../storage";
import {
  renderTranscriptCuesAsSrt,
  renderTranscriptCuesAsVtt,
  type HyperframesTranscriptCue,
} from "../services/hyperframesTranscriptionService";
import { listMarketplaceInsightsByProduct } from "../services/marketplaceInsightService";
import { getMarketplaceProductWithAccess } from "../services/marketplaceProductService";
import {
  resolveStructuredStageModelSelection,
  listRecommendedStructuredStageModels,
  assertStructuredStageModelAvailable,
  VideoIntelligenceModelError,
  type StructuredStageModelSource,
} from "../services/videoIntelligenceModelResolver";
import { makeRunReview, buildDocumentSummary } from "../services/videoProjectReviewAdapter";
import {
  runVideoProjectQualityLoop,
  clampQualityLoopRounds,
  type VideoProjectQualityLoopEffects,
  type VideoProjectReview,
} from "../services/videoProjectQualityLoop";
import {
  planScenes,
  assertSceneTimelineValid,
  forecastPostStageLayerCount,
  type ScenePlanMode,
  type ScenePlanResult,
  type ForecastableStage,
  type LayerBudgetForecast,
} from "../services/videoProjectScenePlanner";
import { makeRunPlanSkill } from "../services/videoProjectScenePlanAdapter";
import {
  buildNarrationScriptSkillInput,
  makeRunNarrationScriptSkill,
} from "../services/videoProjectNarrationScriptAdapter";
import {
  planMotionVariants,
  type MotionVariantMode,
  type MotionVariantResult,
} from "../services/videoProjectMotionDirector";
import { makeRunMotionDirectorSkill } from "../services/videoProjectMotionDirectorAdapter";
import { makeRunBrollPromptSkill, type BrollPromptSkillOutput } from "../services/videoProjectBrollPromptAdapter";
import {
  estimateStageTokens,
  STAGE_CEILING_CALLS_PER_ROUND,
  MOTION_VARIANTS_PER_SCENE_CEILING,
  type StageEstimateBasis,
  type VideoIntelligenceStage,
} from "../services/videoProjectStageEstimator";
import { createRepairRoundSession, assertReviewRevisionCurrent } from "../services/videoProjectRepairApplier";
import { makeRepairEffects } from "../services/videoProjectRepairRewriter";
import { type QaLedgerEntry, readQaLedger } from "../../shared/videoIntelligence/qaLedger";
import { isStageResultReady } from "../../shared/videoIntelligence/stageApproval";
import {
  readVideoContentDraft,
  writeVideoContentDraft,
  CONTENT_DRAFT_DURATION_OPTIONS_SECONDS,
  CONTENT_DRAFT_MOTION_STYLES,
  CONTENT_DRAFT_VOICE_TONES,
  DEFAULT_CONTENT_DRAFT_DURATION_SECONDS,
  DEFAULT_CONTENT_DRAFT_MOTION_STYLE,
  DEFAULT_CONTENT_DRAFT_VOICE_TONE,
  type ContentDraftDurationSeconds,
  type ContentDraftMotionStyle,
  type ContentDraftVoiceTone,
  type VideoContentDraftState,
} from "../../shared/videoIntelligence/contentDraft";
import { recordVideoIntelligenceStageRun } from "../services/videoIntelligenceObservability";

/* -------------------------------------------------------------------------- */
/* Zod input building blocks                                                  */
/* -------------------------------------------------------------------------- */

// CMD-2 enum-honesty closure (audited against production `video_projects`
// rows — only `studioType: "catalog"` / `status: "brief"` are in use today):
// `content`, `review_remix`, and `imported` were never wired to ANY
// generator/UI flow (`STUDIO_TYPE_REQUIRED_FLAG` below only ever mapped
// `catalog`/`motion` to a real feature flag) and carried zero production
// rows — pruned rather than kept-but-undocumented. `catalog` (product-driven
// projects) and `motion` (general Motion Studio projects) are the only two
// studio types this platform actually implements.
const STUDIO_TYPE_SCHEMA = z.enum(["catalog", "motion"]);
// Same audit: `content` and `assets` were STAGE_ORDER-only placeholders with
// no generator, no dispatch-stage `nextStatus`, and no UI (the real 7-stage
// rail is `StageRail.tsx`'s `VIDEO_STUDIO_STAGES` — brief/scenes/narration/
// motion/captions/qa/render) — pruned. Every remaining value is a status a
// real code path actually writes: `dispatchStageJob`'s `nextStatus`
// (scenes/motion/qa), `executeQualityReviewStage`'s terminal `ready`, and
// `dispatchLaneARemotionRenderJob`'s render lifecycle
// (rendering/completed/failed).
const PROJECT_STATUS_SCHEMA = z.enum([
  "brief",
  "narration",
  "scenes",
  "motion",
  "captions",
  "qa",
  "ready",
  "rendering",
  "completed",
  "failed",
]);
const RENDER_PROFILE_SCHEMA = z.enum(["preview", "final"]);
// Feature 143 §4.7 item 2 — the asset picker's `kind` filter. Mirrors the
// three `scene.layers[]` types that carry a `src` field (`image`/`video`/
// `audio` — see `videoProjectAssetResolver.ts`'s
// `collectHandAuthoredAssetLayerUrls`); `svg`/`motionGraphic`/`text`/
// `scene3d` layers are never placed through an asset picker.
const ASSET_PICKER_KIND_SCHEMA = z.enum(["image", "video", "audio"]);
// Coherent with `StageRail.tsx`'s real 7-stage rail order
// (brief -> scenes -> narration -> motion -> captions -> qa -> render) —
// the OLD order here had `narration` before `scenes` (backwards vs the UI)
// and stepped through two dead placeholder stages. `ready` is this
// backend's own terminal pre-render status (the UI's final "render" stage
// has no dedicated `PROJECT_STATUS_SCHEMA` value of its own — reaching
// "render" is a UI-only concern once the project is `ready`).
const STAGE_ORDER = [
  "brief",
  "scenes",
  "narration",
  "motion",
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
    logoAssetId: row.logoAssetId ?? null,
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
  if (projectRow.document == null) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "VI_DOCUMENT_NOT_INITIALIZED: Save the project brief before running this stage.",
    });
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
  const { projectRow, document: loadedDocument } = await loadDocumentOrThrow(auth, projectId);
  // Use the same effective timeline for asset manifests, caption burn-in and
  // the Remotion config. Keeping the legacy document here would make the
  // compiler render the extended audio correctly while ASS captions still
  // used the old scene offsets.
  const document = retimeScenesToNarrationAudio(loadedDocument);

  const resolver = await resolveProjectAssets(document, auth).catch(mapCompileError);
  const brandKit = await resolveBrandKitForDocument(auth, document);
  const sourceRefs = (projectRow.sourceRefs as { productIds?: string[] } | null) ?? null;
  const productIds = sourceRefs?.productIds ?? [];
  const catalogFacts = productIds.length > 0 ? await resolveCatalogFactsForProject(productIds, auth) : null;

  const buildCtx: TemplateBuildContext = {
    format: document.format,
    brandKit,
    assetResolver: resolver,
    catalogFacts,
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

function toBrowserCompiledConfig(config: RemotionTemplateConfig): RemotionTemplateConfig {
  return {
    ...config,
    layers: config.layers.map(layer => {
      if (!("src" in layer) || typeof layer.src !== "string") return layer;
      return { ...layer, src: toBrowserAssetUrl(layer.src) };
    }),
  };
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

  // §4.11 last paragraph: `fontSizePx` is an absolute pixel value (unlike
  // the percent-of-canvas `x`/`y`/`width`/`height` geometry, which needs no
  // adjustment), so it must be rescaled by the same `spatialScale` used for
  // width/height above — otherwise a downscaled preview renders text at
  // roughly double its correct relative size, making the preview-based
  // verification loop in AC2 untrustworthy.
  const layers = config.layers.map(layer =>
    layer.type === "text"
      ? {
          ...layer,
          startFrame: Math.round(layer.startFrame * frameScale),
          durationFrames: Math.max(1, Math.round(layer.durationFrames * frameScale)),
          fontSizePx: Math.max(1, Math.round(layer.fontSizePx * spatialScale)),
        }
      : {
          ...layer,
          startFrame: Math.round(layer.startFrame * frameScale),
          durationFrames: Math.max(1, Math.round(layer.durationFrames * frameScale)),
        },
  ) as RemotionTemplateConfig["layers"];

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
  const resolvedProductIds = [...new Set(productIds)];
  const claimResolutions: ResolvedCatalogFacts["claimResolutions"] = [];
  const products: NonNullable<ResolvedCatalogFacts["products"]> = [];

  for (const productId of resolvedProductIds) {
    try {
      const bundle = await getMarketplaceProductWithAccess(productId, {
        userId: auth.userId,
        tenantId: auth.tenantId,
      });
      products.push({
        productId,
        name: bundle.product.productName ?? null,
        brand: bundle.product.brand ?? null,
        referenceImageUrls: bundle.images.map(image => image.url).filter(Boolean),
        referenceImageAssetIds: bundle.images
          .map(image => image.captureAssetId)
          .filter((assetId): assetId is string => Boolean(assetId)),
      });
    } catch (error) {
      debugError("videoProjects", `Failed to resolve product identity facts for ${productId}`, error);
    }
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
  return { productIds: resolvedProductIds, products, claimResolutions };
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

/** Converts timestamped STT segments (seconds) into scene-relative caption
 * cues.  This is intentionally pure so subtitle timing can be verified
 * without spending TTS/STT credits. */
export function normalizeTimestampedCaptionCues(
  segments: Array<{ start: number; end: number; text: string }>,
  sceneDurationMs: number,
): CaptionCue[] {
  const durationMs = Math.max(1, Math.round(sceneDurationMs));
  return segments
    .map((segment) => {
      const text = String(segment.text ?? "").trim();
      const startMs = Math.max(0, Math.round(Number(segment.start) * 1000));
      const endMs = Math.min(durationMs, Math.round(Number(segment.end) * 1000));
      if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
      return { startMs, endMs: Math.max(startMs + 1, endMs), text } satisfies CaptionCue;
    })
    .filter((cue): cue is CaptionCue => cue !== null);
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
/* Stage estimate + dispatch preamble (Feature 142, section-04)              */
/* -------------------------------------------------------------------------- */

/** `getStageEstimate` output shape (section-04 spec §4.4) — reused by the
 *  dispatch preamble so the quoted number and the id pinned into the job
 *  payload always come from the exact same computation. */
type VideoIntelligenceStageEstimate = {
  // "auto_draft" is a router-owned composite stage (Feature 142 follow-on) —
  // it never enters `videoProjectStageEstimator.ts`'s own
  // `estimateStageTokens`/`buildStageEstimate` machinery (see
  // `buildAutoDraftStageEstimate` below), so it stays a router-local
  // addition to this file's own estimate shape rather than a change to that
  // shared, pure module's `VideoIntelligenceStage` union.
  // "narration" (implementation-progress.md gap #4, CLOSED) is the same
  // kind of router-local addition — see `buildNarrationStageEstimate` below.
  stage: VideoIntelligenceStage | "auto_draft" | "narration";
  modelId: string;
  maxLoops: number;
  perRoundCredits: number;
  typicalCredits: number;
  ceilingCredits: number;
  callsPerRoundCeiling: number;
  basis: StageEstimateBasis;
  isCeiling: true;
  // Feature 143 §4.9.4 (P0 wiring) — the projected total layer count AFTER
  // this stage would run, so `StageEstimateDialog` can show it next to the
  // credit ceiling BEFORE the user spends credits on a stage that could
  // otherwise hard-fail `VI_PLAN_LAYER_BUDGET_EXCEEDED` only after payment.
  // Additive field: existing callers that ignore it keep working unchanged.
  layerBudgetForecast: LayerBudgetForecast;
};

/**
 * Feature 143 §4.9.4 — maps this router's own stage vocabulary (which is
 * NOT identical to `videoProjectScenePlanner.ts`'s `ForecastableStage`) onto
 * the forecast helper's stage union. Only `"scene_plan"` (and `"auto_draft"`,
 * which runs a scene_plan pass as its first leg — see
 * `buildAutoDraftStageEstimate`) can add/replace a scene's visual template,
 * so it is the only stage whose forecast actually differs from
 * `currentTotal`. `"quality_review"`/`"quality_repair"` are QA/repair-review
 * passes over the EXISTING document (never add a template or a
 * `scene.layers[]` entry on their own), so they map to arbitrary non-
 * `"scene_plan"` forecastable stages purely for a descriptive `basis` — the
 * forecast helper returns `currentTotal === projectedTotal` for every one of
 * them regardless of which non-`"scene_plan"` value is passed.
 */
function mapStageToForecastableStage(
  stage: VideoIntelligenceStage | "auto_draft" | "narration",
): ForecastableStage {
  switch (stage) {
    case "scene_plan":
    case "auto_draft":
      return "scene_plan";
    case "narration":
      return "narration";
    case "motion":
      return "motion";
    case "quality_review":
      return "claims";
    case "quality_repair":
      return "content";
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}

/**
 * Resolves the model, sizes the document, and prices both the per-round and
 * ceiling credit cost — the ONE place this section computes a credit number.
 * Never a hardcoded constant (spec §6.4): `perRoundCredits` comes from
 * `calculateCreditsForLLMDynamic` against real model pricing and real,
 * document-derived token counts. Throws `VideoIntelligenceModelError` when no
 * recommended, structured-output-capable model is available — callers map
 * this to `VI_NO_RECOMMENDED_MODEL`.
 */
async function buildStageEstimate(
  document: VideoProjectDocument,
  stage: VideoIntelligenceStage | "narration",
  explicitModelId?: string | null,
): Promise<{
  estimate: VideoIntelligenceStageEstimate;
  modelId: string;
  modelSource: StructuredStageModelSource;
}> {
  if (stage === "narration") {
    const estimate = buildNarrationStageEstimate(document).estimate;
    return {
      estimate,
      modelId: estimate.modelId,
      modelSource: "recommended",
    };
  }

  const modelSelection = await resolveStructuredStageModelSelection(explicitModelId ?? null);
  const basis = estimateStageTokens(document, stage);
  const perRoundCredits = await calculateCreditsForLLMDynamic(
    basis.estimatedInputTokens,
    basis.estimatedOutputTokens,
    modelSelection.modelId,
  );

  // Section-06: uses the SAME clamp `runVideoProjectQualityLoop` applies at
  // execution time, so the quoted round count and the round count the loop
  // actually runs never disagree (spec §6.4 step 6).
  const maxLoops = clampQualityLoopRounds(document.qa.maxLoops);
  const typicalCredits = estimateVideoProjectQualityLoopCredits(perRoundCredits, maxLoops);
  const ceilingCredits = estimateVideoProjectQualityLoopCredits(
    perRoundCredits * STAGE_CEILING_CALLS_PER_ROUND,
    maxLoops,
  );

  return {
    estimate: {
      stage,
      modelId: modelSelection.modelId,
      maxLoops,
      perRoundCredits,
      typicalCredits,
      ceilingCredits,
      callsPerRoundCeiling: STAGE_CEILING_CALLS_PER_ROUND,
      basis,
      isCeiling: true,
      layerBudgetForecast: forecastPostStageLayerCount({
        document,
        stage: mapStageToForecastableStage(stage),
      }),
    },
    modelId: modelSelection.modelId,
    modelSource: modelSelection.source,
  };
}

/** Sizing heuristics for the narration-script sub-stage ONLY — mirrors
 *  `videoProjectStageEstimator.ts`'s own per-scene allowance style so this
 *  router-local estimate stays in the same spirit as that shared module's
 *  machinery without widening its `VideoIntelligenceStage` union for a
 *  composite stage that never calls `estimateStageTokens` directly. */
const AUTO_DRAFT_NARRATION_SCRIPT_BASE_INPUT_TOKENS = 700;
const AUTO_DRAFT_NARRATION_SCRIPT_INPUT_TOKENS_PER_SCENE = 40;
const AUTO_DRAFT_NARRATION_SCRIPT_OUTPUT_BASE_TOKENS = 150;
const AUTO_DRAFT_NARRATION_SCRIPT_OUTPUT_TOKENS_PER_SCENE = 120;
/** Thai speaking rate used elsewhere in this feature area (caption-cue
 *  sizing) — 17 chars/sec, the same constant this codebase already applies
 *  to Vertical Drama narration timing. Sizing-only; never the credit
 *  constant itself (`calculateTTSCredits` owns that). */
const AUTO_DRAFT_THAI_CHARS_PER_SECOND = 17;

/**
 * The `auto_draft` job kind chains scene_plan (fill_empty) -> the
 * narration-script skill -> TTS synthesis into ONE job. Its credit estimate
 * is therefore the SUM of three real, document-derived costs — never a
 * hardcoded constant:
 *   1. the scene-plan LLM call, reusing `buildStageEstimate`'s own
 *      per-round pricing (never its QA-loop-scaled ceiling — auto_draft
 *      never loops);
 *   2. the narration-script LLM call, sized from how many scenes still lack
 *      narration and priced against the SAME resolved model (both stages
 *      share `VI_STRUCTURED_STAGE_REQUIREMENTS`, so a second model resolve
 *      would always agree with the first — reusing `scenePlanBuilt.modelId`
 *      avoids a redundant resolve call);
 *   3. TTS synthesis over an estimated narration character count (the same
 *      17 chars/sec pacing heuristic this codebase already uses elsewhere),
 *      priced through the real `calculateTTSCredits`.
 * The ceiling multiplies ONLY the two LLM legs by `STAGE_CEILING_CALLS_PER_ROUND`
 * (each of `callLLMStructured`'s `maxRetries: 2` calls can itself be billed) —
 * TTS synthesis is not retried through that same mechanism, so it is added
 * to the ceiling un-multiplied. Reuses `VideoIntelligenceStageEstimate`'s
 * existing shape unchanged (`StageEstimateDialog` needs no client change).
 */
async function buildAutoDraftStageEstimate(
  document: VideoProjectDocument,
  explicitModelId?: string | null,
): Promise<{
  estimate: VideoIntelligenceStageEstimate;
  modelId: string;
  modelSource: StructuredStageModelSource;
}> {
  const scenePlanBuilt = await buildStageEstimate(document, "scene_plan", explicitModelId);

  const emptyNarrationScenes = document.scenes.filter(
    scene => typeof scene.narration !== "string" || scene.narration.trim().length === 0,
  );
  const narrationSceneCount = emptyNarrationScenes.length;

  const narrationScriptInputTokens =
    AUTO_DRAFT_NARRATION_SCRIPT_BASE_INPUT_TOKENS +
    narrationSceneCount * AUTO_DRAFT_NARRATION_SCRIPT_INPUT_TOKENS_PER_SCENE;
  const narrationScriptOutputTokens =
    AUTO_DRAFT_NARRATION_SCRIPT_OUTPUT_BASE_TOKENS +
    narrationSceneCount * AUTO_DRAFT_NARRATION_SCRIPT_OUTPUT_TOKENS_PER_SCENE;
  const narrationScriptPerRoundCredits = await calculateCreditsForLLMDynamic(
    narrationScriptInputTokens,
    narrationScriptOutputTokens,
    scenePlanBuilt.modelId,
  );

  const estimatedNarrationChars = emptyNarrationScenes.reduce((sum, scene) => {
    const durationMs = Math.max(0, scene.endMs - scene.startMs);
    return sum + Math.round((durationMs / 1000) * AUTO_DRAFT_THAI_CHARS_PER_SECOND);
  }, 0);
  const ttsCredits = calculateTTSCredits(estimatedNarrationChars);

  const llmPerRoundCredits = scenePlanBuilt.estimate.perRoundCredits + narrationScriptPerRoundCredits;
  const perRoundCredits = llmPerRoundCredits + ttsCredits;
  // auto_draft is a single pass, never a QA loop — `maxLoops` is always 1.
  const typicalCredits = perRoundCredits;
  const ceilingCredits = llmPerRoundCredits * STAGE_CEILING_CALLS_PER_ROUND + ttsCredits;

  return {
    estimate: {
      stage: "auto_draft",
      modelId: scenePlanBuilt.modelId,
      maxLoops: 1,
      perRoundCredits,
      typicalCredits,
      ceilingCredits,
      callsPerRoundCeiling: STAGE_CEILING_CALLS_PER_ROUND,
      basis: scenePlanBuilt.estimate.basis,
      isCeiling: true,
      // auto_draft's first leg IS a scene_plan pass, so it reuses that
      // builder's own forecast (mapStageToForecastableStage maps
      // "auto_draft" to "scene_plan" too — this just avoids a second,
      // redundant document walk since scenePlanBuilt already computed it).
      layerBudgetForecast: scenePlanBuilt.estimate.layerBudgetForecast,
    },
    modelId: scenePlanBuilt.modelId,
    modelSource: scenePlanBuilt.modelSource,
  };
}

/** Model label recorded on a narration estimate/charge — narration synthesis
 *  is priced by `calculateTTSCredits` (flat rate, never model catalog
 *  pricing), so there is no resolved LLM `modelId` the way the other stages
 *  have one; this constant fills that (required, non-null) estimate field
 *  with the actual TTS provider/route `synthesizeProjectNarration` calls
 *  (`synthesize(text, { provider: "openai" })`), so it's descriptive rather
 *  than a placeholder. */
const NARRATION_TTS_MODEL_LABEL = "openai-tts";

/**
 * implementation-progress.md gap #4 (CLOSED): `runNarrationStage` charges
 * real credits with no pre-flight quote, unlike every other paid stage. This
 * follows the SAME precedent `buildAutoDraftStageEstimate` (above) set for a
 * router-owned composite estimate that reuses `VideoIntelligenceStageEstimate`'s
 * existing shape unchanged (`StageEstimateDialog` needs no client change):
 * priced with the real `calculateTTSCredits` over the total narration
 * character count of scenes still lacking `narrationAudioAssetId` — never a
 * hardcoded constant. Narration is a single TTS pass, never a retried LLM
 * call, so `maxLoops`/`callsPerRoundCeiling` are both 1 and
 * `ceilingCredits === typicalCredits` (no `STAGE_CEILING_CALLS_PER_ROUND`
 * multiplier — that constant only models `callLLMStructured`'s own retries,
 * which this stage never makes).
 */
function buildNarrationStageEstimate(document: VideoProjectDocument): {
  estimate: VideoIntelligenceStageEstimate;
} {
  const scenesLackingNarrationAudio = document.scenes.filter(
    scene =>
      typeof scene.narration === "string" &&
      scene.narration.trim().length > 0 &&
      scene.narrationAudioAssetId == null,
  );
  const totalChars = scenesLackingNarrationAudio.reduce(
    (sum, scene) => sum + (scene.narration?.trim().length ?? 0),
    0,
  );
  const ttsCredits = calculateTTSCredits(totalChars);

  return {
    estimate: {
      stage: "narration" as const,
      modelId: NARRATION_TTS_MODEL_LABEL,
      maxLoops: 1,
      perRoundCredits: ttsCredits,
      typicalCredits: ttsCredits,
      ceilingCredits: ttsCredits,
      callsPerRoundCeiling: 1,
      basis: {
        sceneCount: scenesLackingNarrationAudio.length,
        narrationChars: totalChars,
        captionChars: 0,
        layerCount: 0,
        claimCount: 0,
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
      },
      isCeiling: true,
      layerBudgetForecast: forecastPostStageLayerCount({
        document,
        stage: mapStageToForecastableStage("narration"),
      }),
    },
  };
}

/**
 * Shared dispatch preamble for the three LLM stages (`scene_plan`,
 * `quality_review`, `quality_repair`). Order is load-bearing (spec §6.5):
 *   flag → auth (caller's job) → project/document → model resolve →
 *   estimate → credit pre-check → status stamp → enqueue (restore status on
 *   failure). Nothing is stamped or enqueued until affordability is known,
 * and the status is written BEFORE enqueue returns so the client can never
 * re-enable a credit-spending button mid-flight.
 *
 * 🔴 Makes ZERO `deductCredits` calls of its own — `hasEnoughCredits` below
 * is a read-only pre-check; the quoted ceiling is never charged here.
 * `callLLMStructured` (inside the executor's `runReview` effect) is the only
 * thing that ever charges credits for these stages.
 */
async function dispatchStageJob(args: {
  auth: ProjectAuthScope;
  projectId: number;
  stage: VideoIntelligenceStage | "narration" | "auto_draft";
  kind: VideoIntelligenceJobKind;
  nextStatus: string;
  requestedBaseRevision?: number;
  extraInput?: Record<string, unknown>;
  selectedModelId?: string | null;
}): Promise<{ jobId: string; traceId: string; estimate: VideoIntelligenceStageEstimate }> {
  const { auth, projectId, stage, kind, nextStatus, requestedBaseRevision, extraInput } = args;

  const projectRow = await getVideoProject(auth, projectId);
  if (!projectRow) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
  }

  const parsedDocument = VideoProjectDocumentSchema.safeParse(projectRow.document);
  if (!parsedDocument.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `VI_DOCUMENT_INVALID: ${parsedDocument.error.message}`,
    });
  }
  const document = parsedDocument.data;

  // section-08 §6.3: baseRevision -> CONFLICT check, placed BEFORE the model
  // resolve/estimate/credit pre-check so a doomed (stale-revision) request
  // costs exactly one row read and nothing else — zero writes, zero pricing
  // reads, zero model resolution (spec §8 trap #7). `requestedBaseRevision`
  // stays optional: an omitted value pins the CURRENT revision below (never
  // a conflict), so a caller that does not track revisions is never forced
  // to. Same TRPCError CONFLICT shape/message style as `saveDocument`'s own
  // `VideoProjectRevisionConflictError` mapping (videoProjects.ts) so the
  // client's existing CONFLICT banner/reload path needs no client change.
  if (typeof requestedBaseRevision === "number" && requestedBaseRevision !== projectRow.revision) {
    throw new TRPCError({
      code: "CONFLICT",
      message:
        `VIDEO_PROJECT_REVISION_CONFLICT: project ${projectId} expected base revision ` +
        `${requestedBaseRevision} but current revision is ${projectRow.revision}`,
    });
  }

  let built: Awaited<ReturnType<typeof buildStageEstimate>>;
  try {
    built =
      stage === "auto_draft"
        ? await buildAutoDraftStageEstimate(document, args.selectedModelId)
        : await buildStageEstimate(document, stage, args.selectedModelId);
  } catch (error) {
    if (error instanceof VideoIntelligenceModelError) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }
    throw error;
  }

  // Credit pre-check BEFORE any write — an unaffordable request must never
  // occupy the 2-hour per-project active pointer (spec §6.5 / traps #5).
  // Read-only: `hasEnoughCredits` never reserves or deducts.
  const affordable = await hasEnoughCredits(auth.userId, built.estimate.ceilingCredits);
  if (!affordable) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `VI_INSUFFICIENT_CREDITS: not enough credits for the quoted ${built.estimate.ceilingCredits}-credit ceiling`,
    });
  }

  const previousStatus = projectRow.status;
  const traceId = mintTraceId();
  logStage(stage, projectId, traceId, "start");

  // Status stamped BEFORE enqueue returns (spec §6.5 / traps #2) — the test
  // suite asserts this by mock call ORDER, not final state: stamping late is
  // the recorded cause of a double-charge defect elsewhere in this codebase.
  await updateVideoProjectFields(auth, projectId, { status: nextStatus });

  const baseRevision = requestedBaseRevision ?? projectRow.revision;

  let enqueueResult: { jobId: string; deduped: boolean };
  try {
    enqueueResult = await enqueueVideoIntelligenceJob({
      kind,
      tenantId: auth.tenantId,
      userId: auth.userId,
      projectId,
      input: {
        traceId,
        modelId: built.modelId,
        modelSource: built.modelSource,
        previousStatus,
        baseRevision,
        ...extraInput,
      },
    });
  } catch (error) {
    // Restore on ANY enqueue failure (including section-01's
    // VI_QUEUE_UNAVAILABLE) — never swallow, always rethrow the real error.
    await updateVideoProjectFields(auth, projectId, { status: previousStatus }).catch(restoreError => {
      debugError(
        "videoProjects",
        `Failed to restore status for project ${projectId} after a failed ${stage} enqueue`,
        restoreError,
      );
    });
    throw error;
  }

  return { jobId: enqueueResult.jobId, traceId, estimate: built.estimate };
}

/* -------------------------------------------------------------------------- */
/* Async job executor (kind-specific logic, dispatched by                    */
/* videoIntelligenceJobs.ts's BullMQ worker + this router's own queries)     */
/* -------------------------------------------------------------------------- */

/**
 * All three LLM-backed stage executors below (`quality_review` §section-04,
 * `scene_plan` §section-05, `quality_repair` §section-06) are now fully
 * wired — each computes its real, deterministic facts (metrics/claim
 * validation/targets) in TypeScript and lets a skill-authored LLM call own
 * every judgment call (skill-first rule,
 * `memory/feedback_skill_first_authoring.md`); TypeScript never fabricates a
 * plan, a review, or a repair. Historically (Phase 1 / section-04) the
 * scene-plan and quality-repair executors instead failed fast with a
 * greppable `VI_*_NOT_WIRED` error rather than synthesize fake judgment —
 * that scope boundary is now closed.
 */
/**
 * Feature 142, section-05 (extended by the `auto_draft` job kind's own
 * scene-planning sub-stage): the shared scene-planning CORE — loads the
 * document itself, builds the read-only brand context (§7.7), wires
 * `planScenes` to `runPlanSkill`, and persists via `saveVideoProjectDocument`
 * (which also snapshots `video_project_revisions` with `reason: "scene_plan"`).
 * `executeScenePlanStage` (the `scene_plan` job kind) and
 * `executeAutoDraftStage` (the `auto_draft` job kind's first sub-stage) both
 * call this — no scene-planning logic is duplicated between them.
 *
 * `baseRevision`: when omitted, defaults to the freshly-loaded
 * `projectRow.revision` (mirrors the `scene_plan` kind's own
 * `payload.input.baseRevision ?? projectRow.revision` resolution exactly).
 */
async function runScenePlanCore(args: {
  auth: ProjectAuthScope;
  projectId: number;
  traceId: string;
  modelId: string;
  mode: ScenePlanMode;
  baseRevision?: number;
  documentOverride?: VideoProjectDocument;
  persistDocument?: boolean;
  briefMotionStyle?: string | null;
  onProgress: (progress: VideoIntelligenceJobProgress) => void;
}): Promise<
  Pick<ScenePlanResult, "document" | "revision" | "plannedSceneIds" | "appendedSceneIds" | "skippedSceneIds" | "gaps" | "hasLongGap" | "layerBudget" | "summary"> & {
    creditsUsed: number;
    modelId: string | null;
  }
> {
  const { auth, projectId, traceId, modelId, mode, briefMotionStyle, onProgress } = args;

  const projectRow = await getVideoProject(auth, projectId);
  if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
  const document = args.documentOverride ?? (await loadDocumentOrThrow(auth, projectId)).document;
  const baseRevision = typeof args.baseRevision === "number" ? args.baseRevision : projectRow.revision;

  const sourceRefs = (projectRow.sourceRefs as { productIds?: string[] } | null) ?? null;
  const productIds = sourceRefs?.productIds ?? [];
  const studioType = projectRow.studioType;
  const projectBrief = (projectRow.brief && typeof projectRow.brief === "object"
    ? projectRow.brief
    : {}) as Record<string, unknown>;
  const briefNotes = typeof projectBrief.notes === "string" ? projectBrief.notes : null;

  // Read-only brand context for the skill (§7.7) — the planner itself never
  // writes brand values into the document; brand-lock enforcement stays with
  // the real compile at render time.
  const resolvedBrandKit = await resolveBrandKitForDocument(auth, document);
  const brandKit =
    resolvedBrandKit && document.brandKitId
      ? {
          id: document.brandKitId,
          lockedTokens: Object.entries(resolvedBrandKit.locks)
            .filter(([, locked]) => locked === true)
            .map(([token]) => token),
        }
      : null;

  onProgress({ stage: "scene_plan_planning" });

  let totalCreditsUsed = 0;
  let lastModelIdUsed: string | null = modelId;

  const runPlanSkill = makeRunPlanSkill({
    tenantId: auth.tenantId,
    userId: auth.userId,
    traceId,
    modelId,
    projectId,
    // 🔴 Reports spend that ALREADY happened inside callLLMStructured — this
    // callback NEVER calls deductCredits (AD-7 / traps #1).
    onUsage: usage => {
      totalCreditsUsed += usage.creditsUsed;
      lastModelIdUsed = usage.modelId ?? lastModelIdUsed;
    },
  });

  const result = await planScenes({
    document,
    mode,
    studioType,
    briefNotes,
    briefMotionStyle,
    productIds,
    brandKit,
    // R10 self-heal (§7.7 follow-up): the FULL resolved brand kit, used only
    // to deterministically re-apply locked tokens onto the skill's output —
    // never fed into the skill itself (that stays the advisory `brandKit`
    // fact above).
    resolvedBrandKit,
    effects: {
      runPlanSkill,
      resolveFacts: ids => resolveCatalogFactsForProject(ids, auth),
      persistDocument: (doc, reason) =>
        args.persistDocument === false
          ? Promise.resolve({ revision: baseRevision })
          : saveVideoProjectDocument(auth, {
              id: projectId,
              baseRevision,
              document: doc,
              reason,
            }),
    },
  });

  onProgress({ stage: "scene_plan_persisted" });

  return {
    document: result.document,
    revision: result.revision,
    plannedSceneIds: result.plannedSceneIds,
    appendedSceneIds: result.appendedSceneIds,
    skippedSceneIds: result.skippedSceneIds,
    gaps: result.gaps,
    hasLongGap: result.hasLongGap,
    layerBudget: result.layerBudget,
    summary: result.summary,
    creditsUsed: totalCreditsUsed,
    modelId: lastModelIdUsed,
  };
}

/**
 * Feature 142, section-05: the Scene Plan stage's real executor. Reads the
 * dispatch-resolved `modelId`/`modelSource`/`baseRevision`/`mode` from the
 * job payload (never re-resolves the model — traps #4/#5), fails rather than
 * substitutes when that model has since been revoked/disabled, then delegates
 * to the shared `runScenePlanCore` (also used by `executeAutoDraftStage`).
 */
async function executeScenePlanStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "scene_plan_start" });

  const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
  const modelId =
    typeof payload.input.modelId === "string" && payload.input.modelId.trim().length > 0
      ? payload.input.modelId
      : null;
  const modelSource: StructuredStageModelSource =
    payload.input.modelSource === "explicit_pin" ? "explicit_pin" : "recommended";
  const mode: ScenePlanMode = payload.input.mode === "replace" ? "replace" : "fill_empty";

  // A missing/blank modelId is a programming error at dispatch time — the
  // model must be resolved ONCE at dispatch (spec §6.6/§7.6 step 1), never here.
  if (!modelId) {
    throw new Error(
      "VI_NO_RECOMMENDED_MODEL: scene_plan job payload is missing a dispatch-resolved modelId " +
        "(programming error — the model must be resolved once at dispatch, never at execution time)",
    );
  }

  // Fail rather than substitute when the dispatch-pinned model has since
  // been revoked/disabled — never silently swap in a different model the
  // user never confirmed a price for.
  await assertStructuredStageModelAvailable(modelId, undefined, { source: modelSource });

  const baseRevision = typeof payload.input.baseRevision === "number" ? payload.input.baseRevision : undefined;

  const core = await runScenePlanCore({
    auth,
    projectId: payload.projectId,
    traceId,
    modelId,
    mode,
    baseRevision,
    onProgress,
  });

  // Secret-safety: `extra` carries numbers and model names only — never
  // prompt text, never catalog credentials (spec §7.6 step 7).
  logStage("scene_plan", payload.projectId, traceId, "finish", {
    mode,
    plannedCount: core.plannedSceneIds.length,
    appendedCount: core.appendedSceneIds.length,
    skippedCount: core.skippedSceneIds.length,
    layersUsed: core.layerBudget.used,
    hasLongGap: core.hasLongGap,
    modelUsed: core.modelId,
    creditsUsed: core.creditsUsed,
  });

  return {
    kind: "scene_plan" as const,
    traceId,
    mode,
    revision: core.revision,
    plannedSceneIds: core.plannedSceneIds,
    appendedSceneIds: core.appendedSceneIds,
    skippedSceneIds: core.skippedSceneIds,
    gaps: core.gaps,
    hasLongGap: core.hasLongGap,
    layerBudget: core.layerBudget,
    summary: core.summary,
    creditsUsed: core.creditsUsed,
    modelId: core.modelId,
  };
}

/**
 * Motion stage — multi-variant picker. Loads the document, builds the same
 * read-only brand context `runScenePlanCore` builds (§7.7), wires
 * `planMotionVariants` to `runMotionDirectorSkill`, and persists via
 * `saveVideoProjectDocument` (reason `"motion_variants"`, snapshotted in
 * `video_project_revisions` like every other stage write). Never writes
 * `scene.visual`/`scene.motion` — only `scene.motionCandidates` — so a
 * concurrent human edit to a scene's applied motion can never be clobbered
 * by this call (see `videoProjectMotionDirector.ts`'s header).
 */
async function runMotionCore(args: {
  auth: ProjectAuthScope;
  projectId: number;
  traceId: string;
  modelId: string;
  mode: MotionVariantMode;
  variantsPerScene: { min: number; max: number };
  baseRevision?: number;
  onProgress: (progress: VideoIntelligenceJobProgress) => void;
}): Promise<MotionVariantResult & { creditsUsed: number; modelId: string | null }> {
  const { auth, projectId, traceId, modelId, mode, variantsPerScene, onProgress } = args;

  const { projectRow, document } = await loadDocumentOrThrow(auth, projectId);
  const baseRevision = typeof args.baseRevision === "number" ? args.baseRevision : projectRow.revision;

  const resolvedBrandKit = await resolveBrandKitForDocument(auth, document);
  const brandKit =
    resolvedBrandKit && document.brandKitId
      ? {
          id: document.brandKitId,
          lockedTokens: Object.entries(resolvedBrandKit.locks)
            .filter(([, locked]) => locked === true)
            .map(([token]) => token),
        }
      : null;

  onProgress({ stage: "motion_planning" });

  let totalCreditsUsed = 0;
  let lastModelIdUsed: string | null = modelId;

  const runMotionDirectorSkill = makeRunMotionDirectorSkill({
    tenantId: auth.tenantId,
    userId: auth.userId,
    traceId,
    modelId,
    projectId,
    onUsage: usage => {
      totalCreditsUsed += usage.creditsUsed;
      lastModelIdUsed = usage.modelId ?? lastModelIdUsed;
    },
  });

  const result = await planMotionVariants({
    document,
    mode,
    studioType: projectRow.studioType,
    variantsPerScene,
    brandKit,
    baseRevision,
    effects: {
      runMotionDirectorSkill,
      persistDocument: (doc, reason) =>
        saveVideoProjectDocument(auth, {
          id: projectId,
          baseRevision,
          document: doc,
          reason,
        }),
    },
  });

  onProgress({ stage: "motion_persisted" });

  return { ...result, creditsUsed: totalCreditsUsed, modelId: lastModelIdUsed };
}

/**
 * The `motion` job kind's real executor. Same dispatch-resolved-model
 * discipline as every other LLM-backed stage in this file (never re-resolve
 * the model at execution time).
 */
async function executeMotionStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "motion_start" });

  const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
  const modelId =
    typeof payload.input.modelId === "string" && payload.input.modelId.trim().length > 0
      ? payload.input.modelId
      : null;
  const modelSource: StructuredStageModelSource =
    payload.input.modelSource === "explicit_pin" ? "explicit_pin" : "recommended";
  const mode: MotionVariantMode = payload.input.mode === "replace" ? "replace" : "fill_empty";

  const rawVariants = payload.input.variantsPerScene as { min?: unknown; max?: unknown } | undefined;
  const min =
    typeof rawVariants?.min === "number" && rawVariants.min >= 1 ? Math.floor(rawVariants.min) : 2;
  const maxCandidate =
    typeof rawVariants?.max === "number" && rawVariants.max >= min ? Math.floor(rawVariants.max) : Math.max(min, 3);
  const max = Math.min(maxCandidate, MOTION_VARIANTS_PER_SCENE_CEILING);
  const variantsPerScene = { min: Math.min(min, max), max };

  if (!modelId) {
    throw new Error(
      "VI_NO_RECOMMENDED_MODEL: motion job payload is missing a dispatch-resolved modelId " +
        "(programming error — the model must be resolved once at dispatch, never at execution time)",
    );
  }

  await assertStructuredStageModelAvailable(modelId, undefined, { source: modelSource });

  const baseRevision = typeof payload.input.baseRevision === "number" ? payload.input.baseRevision : undefined;

  const core = await runMotionCore({
    auth,
    projectId: payload.projectId,
    traceId,
    modelId,
    mode,
    variantsPerScene,
    baseRevision,
    onProgress,
  });

  logStage("motion", payload.projectId, traceId, "finish", {
    mode,
    proposedCount: core.proposedSceneIds.length,
    skippedCount: core.skippedSceneIds.length,
    rejectedCount: core.rejectedSceneIds.length,
    modelUsed: core.modelId,
    creditsUsed: core.creditsUsed,
  });

  return {
    kind: "motion" as const,
    traceId,
    mode,
    revision: core.revision,
    proposedSceneIds: core.proposedSceneIds,
    skippedSceneIds: core.skippedSceneIds,
    rejectedSceneIds: core.rejectedSceneIds,
    summary: core.summary,
    creditsUsed: core.creditsUsed,
    modelId: core.modelId,
  };
}

/**
 * Feature 142, section-04: the Quality Review stage's real executor. Reads
 * the dispatch-resolved `modelId`/`modelSource` from the job payload (never
 * re-resolves — traps #4), fails rather than substitutes when that model has
 * since been revoked/disabled (AD-3), then runs the section-06 QA loop
 * wired to section-03's `runReview` effect. Persists the review to
 * `video_projects.qaLedger` (never `video_project_revisions` — traps #3).
 */
async function executeQualityReviewStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
  const modelId =
    typeof payload.input.modelId === "string" && payload.input.modelId.trim().length > 0
      ? payload.input.modelId
      : null;
  const modelSource: StructuredStageModelSource =
    payload.input.modelSource === "explicit_pin" ? "explicit_pin" : "recommended";

  // A missing/blank modelId is a programming error at dispatch time — the
  // model must be resolved ONCE at dispatch (spec §6.6 step 1), never here.
  if (!modelId) {
    throw new Error(
      "VI_NO_RECOMMENDED_MODEL: quality_review job payload is missing a dispatch-resolved modelId " +
        "(programming error — the model must be resolved once at dispatch, never at execution time)",
    );
  }

  // Fail rather than substitute when the dispatch-pinned model has since
  // been revoked/disabled (spec §6.6 step 2 / AD-3) — never silently swap in
  // a different model the user never confirmed a price for.
  await assertStructuredStageModelAvailable(modelId, undefined, { source: modelSource });

  onProgress({ stage: "quality_review_metrics" });
  const { projectRow, document, compileResult } = await compileProjectInternal(auth, payload.projectId);
  const cost = compileResult.cost;

  const sourceRefs = (projectRow.sourceRefs as { productIds?: string[] } | null) ?? null;
  const productIds = sourceRefs?.productIds ?? [];
  const resolvedCatalog =
    projectRow.studioType === "catalog" && productIds.length > 0
      ? await resolveCatalogFactsForProject(productIds, auth)
      : null;
  const claimValidation = validateProjectClaims(document, resolvedCatalog);
  const metrics = computeQualityMetrics({ document, claimValidation, renderCost: cost });
  onProgress({ stage: "quality_review_metrics_done" });

  const documentSummary = buildDocumentSummary(document);
  // The CURRENT revision at execution time (read fresh, not the dispatch-time
  // `baseRevision`) — this is what section-06's `VI_REPAIR_STALE_REVIEW`
  // guard compares against (spec §6.6 step 3).
  const revisionReviewed = projectRow.revision;

  let round = 0;
  let ledgerEntryCount = 0;
  let totalCreditsUsed = 0;
  let lastModelIdUsed: string | null = modelId;

  const runReview = makeRunReview({
    tenantId: auth.tenantId,
    userId: auth.userId,
    traceId,
    modelId,
    documentSummary,
    claimValidation,
    // 🔴 Reports spend that ALREADY happened inside callLLMStructured — this
    // callback NEVER calls deductCredits (AD-7 / traps #1).
    onUsage: usage => {
      totalCreditsUsed += usage.creditsUsed;
      lastModelIdUsed = usage.modelId ?? lastModelIdUsed;
    },
  });

  onProgress({ stage: "quality_review_judging" });

  const state = await runVideoProjectQualityLoop({
    projectId: String(payload.projectId),
    // Review is the user-triggered assessment pass. Repairs are a separate
    // confirmed `quality_repair` job; keeping this pass to one round prevents
    // the temporary no-op repair seams below from re-billing repeated reviews
    // without changing the document.
    policy: { targetScore: document.qa.targetScore, maxLoops: 1 },
    metrics,
    effects: {
      runReview,
      persistReview: async review => {
        round += 1;
        const entry: QaLedgerEntry = {
          at: new Date().toISOString(),
          round,
          revision: revisionReviewed,
          review,
          creditsUsed: totalCreditsUsed,
          modelId: lastModelIdUsed,
          traceId,
        };
        const ledgerResult = await appendQaLedgerEntry(auth, payload.projectId, entry);
        ledgerEntryCount = ledgerResult.entryCount;
      },
      // section-06 replaces this — unused in this section's single-round MVP path.
      repairStage: async () => {},
      // section-06 replaces this — unused in this section's single-round MVP path.
      recomputeMetrics: async () => metrics,
    },
  });

  onProgress({ stage: "quality_review_persisted" });

  const blocksFinalRender = claimValidation.blocksFinalRender;
  const nextStatus =
    state.bestReview.score >= document.qa.targetScore && !blocksFinalRender ? "ready" : "qa";
  await updateVideoProjectFields(auth, payload.projectId, { status: nextStatus });

  const highSeverityCount = state.bestReview.issues.filter(issue => issue.severity === "high").length;

  // Secret-safety: `extra` carries model names and numbers only — never
  // prompt text, never catalog credentials (spec §6.6 step 8).
  logStage("quality_review", payload.projectId, traceId, "finish", {
    score: state.bestReview.score,
    issueCount: state.bestReview.issues.length,
    highSeverityCount,
    claimCoverage: metrics.claimCoverage.coverage,
    modelUsed: lastModelIdUsed,
    creditsUsed: totalCreditsUsed,
  });

  return {
    kind: "quality_review" as const,
    traceId,
    revision: revisionReviewed,
    rounds: state.rounds,
    review: state.bestReview,
    creditsUsed: totalCreditsUsed,
    modelId: lastModelIdUsed,
    blocksFinalRender,
    ledgerEntryCount,
  };
}

/**
 * Feature 142, section-06: the Quality Repair stage's real executor. Loads
 * the newest stored review from `qaLedger`, enforces the revision guard
 * BEFORE any write (a BullMQ redelivery must be a byte-identical no-op),
 * then runs the bounded multi-round loop wired to the repair round session
 * (`videoProjectRepairApplier.ts`) and the rewriter's `RepairEffects`
 * (`videoProjectRepairRewriter.ts`). Persists exactly ONE
 * `video_project_revisions` row per repair round (reason "quality_repair"),
 * never per handler (traps #6).
 */
async function executeQualityRepairStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "quality_repair_start" });

  const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
  const modelId =
    typeof payload.input.modelId === "string" && payload.input.modelId.trim().length > 0
      ? payload.input.modelId
      : null;
  const modelSource: StructuredStageModelSource =
    payload.input.modelSource === "explicit_pin" ? "explicit_pin" : "recommended";

  // A missing/blank modelId is a programming error at dispatch time — the
  // model must be resolved ONCE at dispatch (spec §6.8 step 1), never here.
  if (!modelId) {
    throw new Error(
      "VI_NO_RECOMMENDED_MODEL: quality_repair job payload is missing a dispatch-resolved modelId " +
        "(programming error — the model must be resolved once at dispatch, never at execution time)",
    );
  }

  // Fail rather than substitute when the dispatch-pinned model has since
  // been revoked/disabled — never silently swap in a different model the
  // user never confirmed a price for.
  await assertStructuredStageModelAvailable(modelId, undefined, { source: modelSource });

  const { projectRow, document, compileResult } = await compileProjectInternal(auth, payload.projectId);
  const renderCost = compileResult.cost;

  const ledger = readQaLedger(projectRow.qaLedger);
  const latestEntry = ledger.entries[ledger.entries.length - 1];
  if (!latestEntry || !latestEntry.review.repairInstructions || latestEntry.review.repairInstructions.length === 0) {
    throw new Error(
      "VI_REPAIR_NO_INSTRUCTIONS: no stored quality-review entry with repairInstructions is available to repair",
    );
  }

  // Nothing is written before this line — that is what makes a redelivery a
  // byte-identical no-op (spec §6.8 step 4).
  assertReviewRevisionCurrent({ reviewedRevision: latestEntry.revision, currentRevision: projectRow.revision });

  onProgress({ stage: "quality_repair_applying" });

  const sourceRefs = (projectRow.sourceRefs as { productIds?: string[] } | null) ?? null;
  const productIds = sourceRefs?.productIds ?? [];
  const resolvedCatalog = productIds.length > 0 ? await resolveCatalogFactsForProject(productIds, auth) : null;

  let totalCreditsUsed = 0;
  let lastModelIdUsed: string | null = modelId;

  const rewriteEffects = makeRepairEffects({
    tenantId: auth.tenantId,
    userId: auth.userId,
    traceId,
    modelId,
    projectId: payload.projectId,
    // 🔴 Reports spend that ALREADY happened inside callLLMStructured — this
    // callback NEVER charges credits itself (traps #1).
    onUsage: usage => {
      totalCreditsUsed += usage.creditsUsed;
      lastModelIdUsed = usage.modelId ?? lastModelIdUsed;
    },
  });

  const baseRevision =
    typeof payload.input.baseRevision === "number" ? payload.input.baseRevision : projectRow.revision;

  // An optional caller-requested subset of stages (payload.input.stages,
  // §2/§4.1's `applyQualityRepairs` mutation input) narrows which of the
  // skill-authored `repairInstructions` this run acts on. An empty/absent
  // list means "every stage the review flagged" — the common case.
  const requestedStages = Array.isArray(payload.input.stages)
    ? (payload.input.stages as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const storedReview = latestEntry.review as unknown as VideoProjectReview;
  const scopedReview: VideoProjectReview =
    requestedStages.length > 0
      ? {
          ...storedReview,
          repairInstructions: (storedReview.repairInstructions ?? []).filter(entry =>
            requestedStages.includes(entry.stage),
          ),
        }
      : storedReview;

  let currentReview: VideoProjectReview = scopedReview;
  const initialReviewRef = currentReview;

  const session = createRepairRoundSession({
    document,
    baseRevision,
    resolvedCatalog,
    effects: rewriteEffects,
    reviewFor: () => currentReview,
    persistDocument: (doc, base) =>
      saveVideoProjectDocument(auth, {
        id: payload.projectId,
        baseRevision: base,
        document: doc,
        reason: "quality_repair",
      }),
    renderCostFor: () => renderCost,
  });

  onProgress({ stage: "quality_repair_rereview" });

  // A fresh `runReview` per round, built from the CURRENT (possibly
  // already-repaired) document — otherwise round 2 would judge the
  // pre-repair text and the loop could never converge (spec §6.8 step 7).
  const runReview: VideoProjectQualityLoopEffects["runReview"] = async input => {
    const snapshot = session.snapshot();
    const documentSummary = buildDocumentSummary(snapshot.document);
    const claimValidation = validateProjectClaims(snapshot.document, resolvedCatalog);
    const reviewFn = makeRunReview({
      tenantId: auth.tenantId,
      userId: auth.userId,
      traceId,
      modelId,
      documentSummary,
      claimValidation,
      onUsage: usage => {
        totalCreditsUsed += usage.creditsUsed;
        lastModelIdUsed = usage.modelId ?? lastModelIdUsed;
      },
    });
    return reviewFn(input);
  };

  let round = 0;
  let ledgerEntryCount = ledger.entries.length;

  const state = await runVideoProjectQualityLoop({
    projectId: String(payload.projectId),
    policy: { targetScore: document.qa.targetScore, maxLoops: document.qa.maxLoops },
    initialReview: currentReview,
    metrics: computeQualityMetrics({
      document,
      claimValidation: validateProjectClaims(document, resolvedCatalog),
      renderCost,
    }),
    effects: {
      runReview,
      repairStage: session.repairStage,
      persistReview: async reviewEntry => {
        currentReview = reviewEntry;
        round += 1;
        // Skip re-appending the FIRST review — it is already in the ledger
        // (the stored review this repair applied); re-appending would
        // duplicate a round the user already saw.
        if (reviewEntry === initialReviewRef) return;

        const snapshot = session.snapshot();
        const entry: QaLedgerEntry = {
          at: new Date().toISOString(),
          round,
          revision: snapshot.revision,
          review: reviewEntry,
          creditsUsed: totalCreditsUsed,
          modelId: lastModelIdUsed,
          traceId,
        };
        const ledgerResult = await appendQaLedgerEntry(auth, payload.projectId, entry);
        ledgerEntryCount = ledgerResult.entryCount;
      },
      recomputeMetrics: session.recomputeMetrics,
    },
  });

  onProgress({ stage: "quality_repair_persisted" });

  const finalSnapshot = session.snapshot();
  const blocksFinalRender = validateProjectClaims(finalSnapshot.document, resolvedCatalog).blocksFinalRender;
  await updateVideoProjectFields(auth, payload.projectId, { status: "qa" });

  // Secret-safety: `extra` carries stage names, numbers and model names
  // only — never prompt text, never rewritten copy, never catalog
  // credentials (spec §6.8 step 9).
  logStage("quality_repair", payload.projectId, traceId, "finish", {
    appliedStages: finalSnapshot.applied,
    skippedStages: finalSnapshot.skipped,
    rolledBackStages: finalSnapshot.rolledBack,
    revisionBefore: baseRevision,
    revisionAfter: finalSnapshot.revision,
    rounds: state.rounds,
    scoreBefore: initialReviewRef.score,
    scoreAfter: state.bestReview.score,
    modelUsed: lastModelIdUsed,
    creditsUsed: totalCreditsUsed,
    ledgerEntryCount,
  });

  return {
    kind: "quality_repair" as const,
    traceId,
    revisionBefore: baseRevision,
    revisionAfter: finalSnapshot.revision,
    rounds: state.rounds,
    appliedStages: finalSnapshot.applied,
    skippedStages: finalSnapshot.skipped,
    rolledBackStages: finalSnapshot.rolledBack,
    review: state.bestReview,
    scoreBefore: initialReviewRef.score,
    scoreAfter: state.bestReview.score,
    creditsUsed: totalCreditsUsed,
    modelId: lastModelIdUsed,
    blocksFinalRender,
  };
}

/**
 * Feature 142 (extended by the `auto_draft` job kind): the shared TTS
 * synthesis + caption-cue derivation CORE, extracted verbatim from
 * `runNarrationStage`'s own body (section-07 §2.4) so the mutation and
 * `executeAutoDraftStage`'s TTS sub-stage never diverge. Preserves the
 * original's credit accounting EXACTLY: `calculateTTSCredits` prices the
 * synthesized characters, `hasEnoughCredits` gates BEFORE any provider call,
 * and `deductCredits` charges AFTER the document save succeeds — same order
 * as before this extraction.
 *
 * `targetSceneIds === null` synthesizes every scene with non-empty
 * narration (mirrors `runNarrationStage`'s own un-filtered default) — this
 * function's filtering logic is otherwise UNCHANGED from before the
 * extraction, so `runNarrationStage`'s existing "re-synthesize on demand"
 * behavior for an explicitly-requested `sceneIds` input is never altered. A
 * caller that needs idempotency across scenes that already have narration
 * audio (the `auto_draft` job kind) computes and passes a narrower set —
 * that filtering happens at the CALL SITE, never inside this shared core.
 */
type VideoProjectNarrationRuntimeSettings = {
  modelId?: string;
  voice?: string;
  speed?: number;
  extraParams?: Record<string, unknown>;
};

function createVideoProjectMediaToken(userId: number): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes: ["media:generate"],
      jti: `video_project_media_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    },
    "15m",
  );
}

function absoluteVideoProjectMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = getCachedPublicAppUrl().replace(/\/+$/, "");
  return base ? `${base}${url.startsWith("/") ? url : `/${url}`}` : url;
}

async function loadNarrationCatalogModel(modelId?: string) {
  const rows = await db
    .select({
      modelId: mediaModels.modelId,
      provider: mediaModels.provider,
      creditCost: mediaModels.creditCost,
      configJson: mediaModels.configJson,
    })
    .from(mediaModels)
    .where(
      modelId
        ? and(eq(mediaModels.modelType, "audio"), eq(mediaModels.modelId, modelId), eq(mediaModels.isEnabled, true))
        : and(eq(mediaModels.modelType, "audio"), eq(mediaModels.isEnabled, true)),
    )
    .orderBy(
      // The catalog's sort/priority is the recommendation order.  Cost is
      // only the final tie-breaker, so we never pick the cheapest model from
      // the entire catalogue ahead of an admin-recommended model.
      asc(mediaModels.sortOrder),
      asc(mediaModels.priority),
      asc(mediaModels.creditCost),
      asc(mediaModels.modelId),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function downloadGeneratedNarrationAudio(url: string): Promise<{ audioBuffer: Buffer; contentType: string }> {
  const response = await fetch(absoluteVideoProjectMediaUrl(url));
  if (!response.ok) {
    throw new Error(`Generated narration audio download failed: HTTP ${response.status}`);
  }
  return {
    audioBuffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "audio/mpeg",
  };
}

async function alignNarrationCaptions(args: {
  audioUrl: string;
  language: string;
  narration: string;
  sceneDurationMs: number;
}): Promise<{ cues: CaptionCue[]; source: "aligned" | "estimated" }> {
  try {
    const result = await transcribeAudio({
      audioUrl: absoluteVideoProjectMediaUrl(args.audioUrl),
      language: args.language,
      prompt: args.narration.slice(0, 1000),
    });
    if ("segments" in result && Array.isArray(result.segments) && result.segments.length > 0) {
      const cues = normalizeTimestampedCaptionCues(result.segments, args.sceneDurationMs);
      if (cues.length > 0) return { cues, source: "aligned" };
    }
  } catch (error) {
    debugError("videoProjects", "Timestamped narration alignment unavailable; using deterministic caption fallback", error);
  }
  return {
    cues: deriveCaptionCues(args.narration, 0, args.sceneDurationMs),
    source: "estimated",
  };
}

async function synthesizeProjectNarration(args: {
  auth: ProjectAuthScope;
  projectId: number;
  projectRevision: number;
  document: VideoProjectDocument;
  targetSceneIds: Set<string> | null;
  settings?: VideoProjectNarrationRuntimeSettings;
  onProgress?: (progress: VideoIntelligenceJobProgress) => void;
}): Promise<{ document: VideoProjectDocument; revision: number; scenesNarrated: number; creditsCharged: number }> {
  const { auth, projectId, projectRevision, document, targetSceneIds, settings, onProgress } = args;

  const targetScenes = document.scenes.filter(
    scene =>
      (!targetSceneIds || targetSceneIds.has(scene.sceneId)) &&
      typeof scene.narration === "string" &&
      scene.narration.trim().length > 0,
  );

  if (targetScenes.length === 0) {
    return { document, revision: projectRevision, scenesNarrated: 0, creditsCharged: 0 };
  }

  // Requests from the updated panel always carry settings.  Keep the old
  // no-settings path for already-open clients and legacy auto-draft jobs so a
  // rolling deployment does not fail while the browser refreshes.
  const catalogModel = settings ? await loadNarrationCatalogModel(settings.modelId) : null;
  if (settings?.modelId && !catalogModel) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `VI_TTS_MODEL_UNAVAILABLE: audio model "${settings.modelId}" is not enabled in the media catalogue`,
    });
  }
  const useMediaCatalog = Boolean(catalogModel);
  const extraParams = { ...(settings?.extraParams ?? {}) };
  if (settings?.voice && extraParams.voice === undefined) extraParams.voice = settings.voice;
  const creditsNeeded = useMediaCatalog
    ? targetScenes.reduce(
        (sum, scene) => sum + calculateCreditCost(catalogModel, { text: scene.narration!.trim(), ...extraParams }),
        0,
      )
    : calculateTTSCredits(targetScenes.reduce((sum, scene) => sum + (scene.narration?.trim().length ?? 0), 0));
  if (!(await hasEnoughCredits(auth.userId, creditsNeeded))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "VI_INSUFFICIENT_CREDITS: not enough credits for narration synthesis",
    });
  }

  const updatedScenesBySceneId = new Map<string, Scene>();
  let generatedCredits = 0;
  for (const scene of targetScenes) {
    onProgress?.({
      stage: "narration_synthesizing",
      message: scene.sceneId,
    });
    const narrationText = scene.narration!.trim();
    let audioBuffer: Buffer;
    let contentType = "audio/mpeg";
    let audioUrl: string | null = null;
    let generatedDurationMs: number | undefined;
    let sceneCredits = calculateTTSCredits(narrationText.length);

    if (catalogModel) {
      const traceId = mintTraceId();
      const result = await mediaGenerationService.generateAudio(
        {
          text: narrationText,
          model: catalogModel.modelId as AudioModel,
          voice: settings?.voice,
          speed: settings?.speed,
          extraParams,
          apiConfig: { provider: catalogModel.provider, trace_id: traceId },
          publicUrl: getCachedPublicAppUrl() || undefined,
          auditContext: {
            userId: auth.userId,
            tenantId: auth.tenantId,
            traceId,
            source: "videoProjects.runNarrationStage",
            stage: "narration",
          },
        },
        createVideoProjectMediaToken(auth.userId),
      );
      const generated = result.data.find((item) => typeof item.url === "string" && item.url.trim());
      if (!generated?.url) throw new Error(`TTS model ${catalogModel.modelId} returned no audio URL`);
      const downloaded = await downloadGeneratedNarrationAudio(generated.url);
      audioBuffer = downloaded.audioBuffer;
      contentType = downloaded.contentType;
      audioUrl = generated.url;
      const rawDuration = Number((generated.data as Record<string, unknown> | undefined)?.durationSeconds);
      const providerDurationMs = Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration * 1000)
        : undefined;
      generatedDurationMs = await probeAudioDurationMs(audioBuffer, contentType)
        ?? providerDurationMs
        // Last-resort fallback for a runtime without ffprobe and a provider
        // that omitted duration metadata. It is intentionally used only as a
        // fallback; MP3 byte size is not an authoritative duration.
        ?? Math.max(1, Math.round(audioBuffer.byteLength / (128 * 1024 / 8) * 1000));
      sceneCredits = result.creditsUsed || calculateCreditCost(catalogModel, { text: narrationText, ...extraParams });
    } else {
      // Backward-compatible fallback for a temporarily unavailable catalog;
      // normal Video Studio requests always send a catalog model id.
      const tts = await synthesize(narrationText, { format: "mp3", provider: "openai" });
      audioBuffer = tts.audioBuffer;
      contentType = tts.contentType;
      generatedDurationMs = Math.max(1, Math.round(tts.duration * 1000));
    }

    const storageKey = `video-intelligence/${auth.tenantId}/${projectId}/narration/${scene.sceneId}-${Date.now()}.mp3`;
    await assertR2StorageActive();
    const stored = await storagePut(storageKey, audioBuffer, contentType);

    const [assetRow] = await db
      .insert(mediaAssets)
      .values({
        tenantId: auth.tenantId,
        userId: auth.userId,
        projectId: String(projectId),
        sourceType: "video_intelligence_narration",
        status: "ready",
        storageKey: stored.key,
        originalUrl: audioUrl ?? stored.url,
        mimeType: contentType,
        fileSize: audioBuffer.byteLength,
      } as never)
      .returning();

    const sceneDurationMs = Math.max(1, scene.endMs - scene.startMs);
    const narrationDurationMs = generatedDurationMs ?? sceneDurationMs;
    // Only an explicit manual source is authoritative. Previously any
    // existing cue array was treated as manual, so re-generating narration
    // kept stale draft timings and made subtitles drift away from the new
    // audio file.
    const hasManualCaptionCues = scene.captionTimingSource === "manual" && scene.captionCues.length > 0;
    const captionResult = hasManualCaptionCues
      ? { cues: scene.captionCues, source: "manual" as const }
      : await alignNarrationCaptions({
          audioUrl: audioUrl ?? stored.url,
          language: document.content.language,
          narration: narrationText,
          sceneDurationMs: narrationDurationMs,
        });
    if (catalogModel) generatedCredits += sceneCredits;

    updatedScenesBySceneId.set(scene.sceneId, {
      ...scene,
      narrationAudioAssetId: (assetRow as { id: number }).id,
      narrationAudioDurationMs: generatedDurationMs,
      captionTimingSource: captionResult.source,
      captionCues: hasManualCaptionCues
        ? scene.captionCues
        : captionResult.cues.map((cue) => ({ ...cue, startMs: cue.startMs, endMs: cue.endMs })),
    });
  }

  const narratedDocument = retimeScenesToNarrationAudio({
    ...document,
    scenes: document.scenes.map(scene => updatedScenesBySceneId.get(scene.sceneId) ?? scene),
  });
  const nextDocument: VideoProjectDocument = {
    ...narratedDocument,
    ...(settings
      ? {
          narrationSettings: {
            modelId: settings.modelId ?? document.narrationSettings?.modelId ?? "",
            ...(settings.voice ? { voice: settings.voice } : document.narrationSettings?.voice ? { voice: document.narrationSettings.voice } : {}),
            ...(settings.speed !== undefined ? { speed: settings.speed } : document.narrationSettings?.speed !== undefined ? { speed: document.narrationSettings.speed } : {}),
            ...(Object.keys(extraParams).length > 0 ? { extraParams } : document.narrationSettings?.extraParams ? { extraParams: document.narrationSettings.extraParams } : {}),
          },
        }
      : {}),
  };

  let saveResult: { revision: number };
  try {
    saveResult = await saveVideoProjectDocument(auth, {
      id: projectId,
      baseRevision: projectRevision,
      document: nextDocument,
      reason: "narration",
    });
  } catch (error) {
    if (error instanceof VideoProjectRevisionConflictError) {
      throw new TRPCError({ code: "CONFLICT", message: error.message });
    }
    throw error;
  }

  // implementation-progress.md gap #2 (CLOSED): this charge previously had no
  // idempotency key at all. The legacy `runNarrationStage` mutation is still
  // synchronous (the Video Studio UI uses `runNarrationStageAsync`), so there
  // is no real `jobId` to redeliver on that compatibility path — the
  // "stand-in jobId" below is deterministic over data that is INVARIANT for
  // two requests racing against each other BEFORE either has written its
  // save (same `projectId` + the STARTING `projectRevision` this call read +
  // the exact target scene set), so two genuinely-concurrent/duplicate
  // in-flight calls collide on the same key and `deductCredits` charges only
  // once. It deliberately does NOT protect a request retried AFTER a prior
  // attempt already saved+charged successfully — that scenario has no
  // client-supplied nonce to key off (`runNarrationStage`'s input has none),
  // and the next attempt would read the ALREADY-BUMPED revision, producing a
  // different key by design (an intentional "regenerate narration" call must
  // still be able to charge again).
  const targetSceneIdsKeyPart = targetSceneIds
    ? Array.from(targetSceneIds).sort().join(",")
    : "all";
  const creditContext = buildVideoIntelligenceCreditContext({
    jobId: `narration:${projectId}:${projectRevision}:${targetSceneIdsKeyPart}`,
    stage: "narration",
    traceId: `vi-narration-${projectId}-${projectRevision}`,
    projectId,
    modelId: null,
  });

  await deductCredits({
    userId: auth.userId,
    amount: catalogModel && generatedCredits > 0 ? generatedCredits : creditsNeeded,
    description: "Video Intelligence Platform — narration TTS synthesis",
    tenantId: auth.tenantId,
    idempotencyKey: creditContext.idempotencyKey,
    metadata: creditContext.metadata,
  });

  return {
    document: nextDocument,
    revision: saveResult.revision,
    scenesNarrated: targetScenes.length,
    creditsCharged: catalogModel && generatedCredits > 0 ? generatedCredits : creditsNeeded,
  };
}

/** Async narration executor used by Video Studio's job-backed TTS flow.
 *  The existing synchronous mutation remains available for legacy callers
 *  and the auto-draft composite, while the product-facing panel uses this
 *  path so provider latency never occupies the tRPC request. */
async function executeNarrationStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "narration_start" });

  const { projectRow, document } = await loadDocumentOrThrow(auth, payload.projectId);
  const baseRevision = typeof payload.input.baseRevision === "number"
    ? payload.input.baseRevision
    : projectRow.revision;
  if (baseRevision !== projectRow.revision) {
    throw new VideoProjectRevisionConflictError(payload.projectId, baseRevision, projectRow.revision);
  }

  const rawSceneIds = payload.input.sceneIds;
  const targetSceneIds = Array.isArray(rawSceneIds)
    ? new Set(rawSceneIds.filter((sceneId): sceneId is string => typeof sceneId === "string" && sceneId.trim().length > 0))
    : null;
  const settings = payload.input.narrationSettings == null
    ? undefined
    : VideoProjectNarrationSettingsSchema.parse(payload.input.narrationSettings);

  const result = await synthesizeProjectNarration({
    auth,
    projectId: payload.projectId,
    projectRevision: projectRow.revision,
    document,
    targetSceneIds,
    settings,
    onProgress,
  });

  const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
  logStage("narration", payload.projectId, traceId, "finish", {
    scenesNarrated: result.scenesNarrated,
    creditsCharged: result.creditsCharged,
  });
  onProgress({ stage: "narration_persisted" });

  return {
    kind: "narration" as const,
    traceId,
    revision: result.revision,
    scenesNarrated: result.scenesNarrated,
    creditsCharged: result.creditsCharged,
  };
}

/**
 * The `auto_draft` job kind — chains scene_plan (fill_empty) -> the
 * narration-script skill -> TTS synthesis + caption-cue derivation into ONE
 * job. `enqueueVideoIntelligenceJob`'s per-project active-pointer dedupe
 * means a second enqueue for the same project always joins whatever job is
 * already active regardless of kind — so this chain MUST run inside one job
 * rather than as several separately-dispatched kinds (see
 * `videoIntelligenceJobs.ts`'s `VideoIntelligenceJobKind` docblock).
 *
 * Reuses `runScenePlanCore` (section-05's own scene-planning path,
 * unduplicated) and `synthesizeProjectNarration` (extracted from
 * `runNarrationStage`, identical credit accounting). Every sub-stage is
 * non-destructive: scene planning is always `mode: "fill_empty"`, narration
 * text is written only for scenes whose narration is still empty, and TTS
 * only runs for scenes still missing `narrationAudioAssetId` — re-running
 * `auto_draft` on an already-drafted project is therefore always a safe,
 * idempotent top-up rather than a re-charge or an overwrite.
 */
async function executeAutoDraftStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  onProgress({ stage: "auto_draft_start" });

  const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
  const modelId =
    typeof payload.input.modelId === "string" && payload.input.modelId.trim().length > 0
      ? payload.input.modelId
      : null;
  const modelSource: StructuredStageModelSource =
    payload.input.modelSource === "explicit_pin" ? "explicit_pin" : "recommended";

  // A missing/blank modelId is a programming error at dispatch time — the
  // model must be resolved ONCE at dispatch, never here (same rule as every
  // other LLM-backed stage in this file).
  if (!modelId) {
    throw new Error(
      "VI_NO_RECOMMENDED_MODEL: auto_draft job payload is missing a dispatch-resolved modelId " +
        "(programming error — the model must be resolved once at dispatch, never at execution time)",
    );
  }

  // Fail rather than substitute when the dispatch-pinned model has since
  // been revoked/disabled — never silently swap in a different model the
  // user never confirmed a price for.
  await assertStructuredStageModelAvailable(modelId, undefined, { source: modelSource });

  const initialBaseRevision =
    typeof payload.input.baseRevision === "number" ? payload.input.baseRevision : undefined;

  let totalCreditsUsed = 0;
  let lastModelIdUsed: string | null = modelId;

  /* -- a. scene planning (fill_empty), so timing locks land BEFORE any --- */
  /* -- narration is written (isTimingLocked freezes startMs/endMs once  -- */
  /* -- narration audio or caption cues exist — scenes must be planned   -- */
  /* -- before TTS runs) ---------------------------------------------- */
  onProgress({ stage: "auto_draft_scene_plan" });
  const scenePlanResult = await runScenePlanCore({
    auth,
    projectId: payload.projectId,
    traceId,
    modelId,
    mode: "fill_empty",
    baseRevision: initialBaseRevision,
    onProgress,
  });
  totalCreditsUsed += scenePlanResult.creditsUsed;
  lastModelIdUsed = scenePlanResult.modelId ?? lastModelIdUsed;

  /* -- b. narration-script skill, only for scenes with empty narration -- */
  onProgress({ stage: "auto_draft_narration_script" });
  const { projectRow: afterPlanRow, document: afterPlanDocument } = await loadDocumentOrThrow(
    auth,
    payload.projectId,
  );
  let currentDocument = afterPlanDocument;
  let currentRevision = afterPlanRow.revision;

  const emptyNarrationSceneIds = currentDocument.scenes
    .filter(scene => typeof scene.narration !== "string" || scene.narration.trim().length === 0)
    .map(scene => scene.sceneId);

  let narrationScriptWritten = 0;

  if (emptyNarrationSceneIds.length > 0) {
    const sourceRefs = (afterPlanRow.sourceRefs as { productIds?: string[] } | null) ?? null;
    const productIds = sourceRefs?.productIds ?? [];
    const studioType = afterPlanRow.studioType;
    const catalogFacts =
      studioType === "catalog" && productIds.length > 0
        ? await resolveCatalogFactsForProject(productIds, auth)
        : null;

    const skillInput = buildNarrationScriptSkillInput({
      document: currentDocument,
      studioType,
      catalogFacts,
      sceneIds: emptyNarrationSceneIds,
    });

    const runNarrationScriptSkill = makeRunNarrationScriptSkill({
      tenantId: auth.tenantId,
      userId: auth.userId,
      traceId,
      modelId,
      projectId: payload.projectId,
      // 🔴 Reports spend that ALREADY happened inside callLLMStructured —
      // this callback NEVER calls deductCredits (same rule as every other
      // skill-adapter effect in this file).
      onUsage: usage => {
        totalCreditsUsed += usage.creditsUsed;
        lastModelIdUsed = usage.modelId ?? lastModelIdUsed;
      },
    });

    const output = await runNarrationScriptSkill(skillInput);

    // Structural validation BEFORE any merge — every returned index must
    // key into a scene actually sent, mirroring `planScenes`'s own
    // "validate everything before merging" discipline (§7 of section-05).
    const narrationBySceneId = new Map<string, string>();
    for (const entry of output.scenes) {
      if (entry.index < 0 || entry.index >= skillInput.scenes.length) {
        throw new Error(
          `VI_NARRATION_SCRIPT_INVALID: narration-script output referenced out-of-range index ${entry.index} ` +
            `(${skillInput.scenes.length} scene(s) were sent)`,
        );
      }
      const targetSceneId = skillInput.scenes[entry.index]!.sceneId;
      narrationBySceneId.set(targetSceneId, entry.narration.trim());
    }

    if (narrationBySceneId.size > 0) {
      const nextScenes = currentDocument.scenes.map(scene => {
        // Non-destructive — fill_empty everywhere: only ever fills a scene
        // whose narration is STILL empty.
        const alreadyNarrated = typeof scene.narration === "string" && scene.narration.trim().length > 0;
        const draftedNarration = narrationBySceneId.get(scene.sceneId);
        if (alreadyNarrated || !draftedNarration) return scene;
        return { ...scene, narration: draftedNarration };
      });
      const candidate: VideoProjectDocument = { ...currentDocument, scenes: nextScenes };
      const reparsed = VideoProjectDocumentSchema.safeParse(candidate);
      if (!reparsed.success) {
        throw new Error(
          `VI_NARRATION_SCRIPT_INVALID: merged document failed schema validation: ${reparsed.error.message}`,
        );
      }

      const saveResult = await saveVideoProjectDocument(auth, {
        id: payload.projectId,
        baseRevision: currentRevision,
        document: reparsed.data,
        reason: "narration_script",
      });
      currentDocument = reparsed.data;
      currentRevision = saveResult.revision;
      narrationScriptWritten = narrationBySceneId.size;
    }
  }
  onProgress({ stage: "auto_draft_narration_script_persisted" });

  /* -- c. TTS synthesis + caption cues, only for scenes still missing --- */
  /* -- narration audio (idempotent re-run: never re-synthesizes) ------- */
  onProgress({ stage: "auto_draft_tts" });
  const pendingAudioSceneIds = new Set(
    currentDocument.scenes
      .filter(
        scene =>
          scene.narrationAudioAssetId === null &&
          typeof scene.narration === "string" &&
          scene.narration.trim().length > 0,
      )
      .map(scene => scene.sceneId),
  );

  const narrationResult = await synthesizeProjectNarration({
    auth,
    projectId: payload.projectId,
    projectRevision: currentRevision,
    document: currentDocument,
    targetSceneIds: pendingAudioSceneIds,
    settings: currentDocument.narrationSettings,
  });
  currentDocument = narrationResult.document;
  currentRevision = narrationResult.revision;

  onProgress({ stage: "auto_draft_persisted" });

  const grandTotalCreditsUsed = totalCreditsUsed + narrationResult.creditsCharged;

  // Secret-safety: `extra` carries numbers and model names only — never
  // prompt text, never catalog credentials or narration text (same
  // discipline as every other stage's `logStage` call in this file).
  logStage("auto_draft", payload.projectId, traceId, "finish", {
    plannedCount: scenePlanResult.plannedSceneIds.length,
    appendedCount: scenePlanResult.appendedSceneIds.length,
    narrationScriptWritten,
    scenesNarrated: narrationResult.scenesNarrated,
    modelUsed: lastModelIdUsed,
    creditsUsed: grandTotalCreditsUsed,
  });

  return {
    kind: "auto_draft" as const,
    traceId,
    revision: currentRevision,
    scenePlan: {
      plannedSceneIds: scenePlanResult.plannedSceneIds,
      appendedSceneIds: scenePlanResult.appendedSceneIds,
      skippedSceneIds: scenePlanResult.skippedSceneIds,
      gaps: scenePlanResult.gaps,
      hasLongGap: scenePlanResult.hasLongGap,
      layerBudget: scenePlanResult.layerBudget,
      summary: scenePlanResult.summary,
    },
    narrationScriptWritten,
    scenesNarrated: narrationResult.scenesNarrated,
    creditsUsed: grandTotalCreditsUsed,
    modelId: lastModelIdUsed,
  };
}

/**
 * Review-first content draft. Unlike `auto_draft`, this deliberately stops
 * after scene structure + narration text and stores the candidate inside the
 * project's draft state. The canonical document, TTS assets, captions, and
 * stage status are untouched until the user accepts the candidate.
 */
const CONTENT_DRAFT_MIN_DURATION_MS = 30_000;
const CONTENT_DRAFT_SCENE_TARGET_DURATION_MS = 15_000;
const CONTENT_DRAFT_MAX_SCENE_SLOTS = 32;

function resolveContentDraftDurationSeconds(value: unknown): ContentDraftDurationSeconds {
  return typeof value === "number" && CONTENT_DRAFT_DURATION_OPTIONS_SECONDS.includes(value as ContentDraftDurationSeconds)
    ? (value as ContentDraftDurationSeconds)
    : DEFAULT_CONTENT_DRAFT_DURATION_SECONDS;
}

function resolveContentDraftVoiceTone(value: unknown): ContentDraftVoiceTone {
  return typeof value === "string" && CONTENT_DRAFT_VOICE_TONES.some((tone) => tone.id === value)
    ? (value as ContentDraftVoiceTone)
    : DEFAULT_CONTENT_DRAFT_VOICE_TONE;
}

function resolveContentDraftMotionStyle(value: unknown): ContentDraftMotionStyle {
  return typeof value === "string" && CONTENT_DRAFT_MOTION_STYLES.some((style) => style.id === value)
    ? (value as ContentDraftMotionStyle)
    : DEFAULT_CONTENT_DRAFT_MOTION_STYLE;
}

/**
 * A newly initialized Video Studio document is intentionally minimal (one
 * blank eight-second scene so the editor can open). That shape is useful for
 * manual editing but is not enough context for a review-first content draft.
 * Expand only blank, non-authored documents into editorial beat slots here;
 * the skill still chooses the visual treatment and writes every spoken line.
 * Existing hand-authored/template scenes are never rewritten by this helper.
 */
function prepareContentDraftDocument(
  document: VideoProjectDocument,
  durationLimitMs: number,
  forceDraftReflow: boolean,
): VideoProjectDocument {
  if (!forceDraftReflow && document.scenes.length > 1) return document;
  const current = document.scenes[0];
  if (!current) return document;
  const hasAuthoredVisual =
    current.layers.length > 0 ||
    current.visual.kind === "template" ||
    current.narrationAudioAssetId !== null ||
    current.captionCues.length > 0;
  if (!forceDraftReflow && hasAuthoredVisual) return document;

  const totalDurationMs = Math.max(CONTENT_DRAFT_MIN_DURATION_MS, durationLimitMs);
  const sceneCount = Math.max(
    1,
    Math.min(CONTENT_DRAFT_MAX_SCENE_SLOTS, Math.ceil(totalDurationMs / CONTENT_DRAFT_SCENE_TARGET_DURATION_MS)),
  );
  const slotDurationMs = Math.floor(totalDurationMs / sceneCount);
  const scenes = Array.from({ length: sceneCount }, (_, index) => {
    const startMs = index * slotDurationMs;
    const endMs = index === sceneCount - 1
      ? totalDurationMs
      : (index + 1) * slotDurationMs;
    return {
      ...current,
      sceneId: index === 0 && !forceDraftReflow ? current.sceneId : `content-draft-scene-${index + 1}`,
      startMs,
      endMs,
      narration: null,
      narrationAudioAssetId: null,
      visual: { kind: "layers" as const },
      layers: [],
      motion: { intensity: "medium" as const, camera: "static" },
      captionCues: [],
    };
  });

  return {
    ...document,
    format: { ...document.format, durationMs: totalDurationMs },
    scenes,
  };
}

function buildContentDraftSummary(document: VideoProjectDocument): string {
  const durationSeconds = Math.round(document.format.durationMs / 1000);
  return `วิดีโอประมาณ ${durationSeconds} วินาที แบ่งเป็น ${document.scenes.length} ฉาก ครอบคลุม hook เนื้อหาหลัก และคำกระตุ้นให้ดำเนินการ`;
}

async function executeContentDraftStage(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  onProgress: (progress: VideoIntelligenceJobProgress) => void,
): Promise<unknown> {
  const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
  const modelId = typeof payload.input.modelId === "string" ? payload.input.modelId.trim() : "";
  if (!modelId) throw new Error("VI_NO_RECOMMENDED_MODEL: content draft has no resolved model");
  await assertStructuredStageModelAvailable(modelId, undefined, {
    source: payload.input.modelSource === "explicit_pin" ? "explicit_pin" : "recommended",
  });

  const { projectRow, document: canonicalDocument } = await loadDocumentOrThrow(auth, payload.projectId);
  const previousDraft = readVideoContentDraft(projectRow.brief);
  const durationLimitSeconds = resolveContentDraftDurationSeconds(payload.input.durationLimitSeconds);
  const voiceTone = resolveContentDraftVoiceTone(payload.input.voiceTone);
  const motionStyle = resolveContentDraftMotionStyle(payload.input.motionStyle);
  const brief = (projectRow.brief && typeof projectRow.brief === "object"
    ? projectRow.brief
    : {}) as Record<string, unknown>;
  const briefTopic = typeof brief.topic === "string" ? brief.topic.trim() : "";
  const briefAudience = typeof brief.audience === "string" ? brief.audience.trim() : "";
  const briefDocument = {
    ...(previousDraft?.document ?? canonicalDocument),
    content: {
      ...(previousDraft?.document ?? canonicalDocument).content,
      ...(briefTopic ? { topic: briefTopic } : {}),
      ...(briefAudience ? { audience: briefAudience } : {}),
    },
  };
  const sourceDocument = prepareContentDraftDocument(
    briefDocument,
    durationLimitSeconds * 1000,
    Boolean(previousDraft?.document),
  );
  const feedback = typeof payload.input.feedback === "string" ? payload.input.feedback.trim().slice(0, 2000) : "";
  let totalCreditsUsed = 0;
  let lastModelIdUsed: string | null = modelId;

  onProgress({ stage: "content_draft_scene_plan" });
  const scenePlan = await runScenePlanCore({
    auth,
    projectId: payload.projectId,
    traceId,
    modelId,
    mode: previousDraft?.document ? "replace" : "fill_empty",
    baseRevision: projectRow.revision,
    documentOverride: sourceDocument,
    persistDocument: false,
    briefMotionStyle: motionStyle,
    onProgress,
  });
  totalCreditsUsed += scenePlan.creditsUsed;
  lastModelIdUsed = scenePlan.modelId ?? lastModelIdUsed;

  const sourceRefs = (projectRow.sourceRefs as { productIds?: string[] } | null) ?? null;
  const productIds = sourceRefs?.productIds ?? [];
  const catalogFacts =
    projectRow.studioType === "catalog" && productIds.length > 0
      ? await resolveCatalogFactsForProject(productIds, auth)
      : null;
  const sceneIds = scenePlan.document.scenes.map(scene => scene.sceneId);
  const narrationSkill = makeRunNarrationScriptSkill({
    tenantId: auth.tenantId,
    userId: auth.userId,
    traceId,
    modelId,
    projectId: payload.projectId,
    onUsage: usage => {
      totalCreditsUsed += usage.creditsUsed;
      lastModelIdUsed = usage.modelId ?? lastModelIdUsed;
    },
  });

  onProgress({ stage: "content_draft_narration" });
  const narrationOutput = await narrationSkill(
    buildNarrationScriptSkillInput({
      document: scenePlan.document,
      studioType: projectRow.studioType,
      catalogFacts,
      sceneIds,
      feedback: feedback || null,
      previousDraft: previousDraft?.document?.scenes.map(scene => ({
        sceneId: scene.sceneId,
        narration: scene.narration,
      })),
      briefNotes: typeof brief.notes === "string" ? brief.notes : null,
      briefVoiceTone: voiceTone,
    }),
  );
  const narrationBySceneId = new Map<string, string>();
  const seenNarrationIndexes = new Set<number>();
  for (const entry of narrationOutput.scenes) {
    if (entry.index < 0 || entry.index >= sceneIds.length || seenNarrationIndexes.has(entry.index)) {
      throw new Error("VI_NARRATION_SCRIPT_INCOMPLETE: narration output must contain one unique entry for every scene");
    }
    seenNarrationIndexes.add(entry.index);
    const target = sceneIds[entry.index];
    if (target) narrationBySceneId.set(target, entry.narration.trim());
  }
  const missingSceneIds = sceneIds.filter(sceneId => !narrationBySceneId.has(sceneId));
  if (missingSceneIds.length > 0) {
    throw new Error(
      `VI_NARRATION_SCRIPT_INCOMPLETE: narration is missing for ${missingSceneIds.length} scene(s)`,
    );
  }
  const candidate = VideoProjectDocumentSchema.parse({
    ...scenePlan.document,
    scenes: scenePlan.document.scenes.map(scene =>
      narrationBySceneId.has(scene.sceneId)
        ? { ...scene, narration: narrationBySceneId.get(scene.sceneId) }
        : scene,
    ),
  });

  if (previousDraft?.document) {
    const before = previousDraft.document.scenes.map(scene => `${scene.sceneId}:${scene.narration ?? ""}`).join("\n");
    const after = candidate.scenes.map(scene => `${scene.sceneId}:${scene.narration ?? ""}`).join("\n");
    if (before === after) {
      throw new Error("VI_DRAFT_NOT_CHANGED: the regenerated draft was identical to the previous draft");
    }
  }

  const now = new Date().toISOString();
  const draft: VideoContentDraftState = {
    status: "ready",
    attempt: (previousDraft?.attempt ?? 0) + 1,
    feedback: feedback || null,
    document: candidate,
    summary: scenePlan.summary || buildContentDraftSummary(candidate),
    totalNarrationCharacters: candidate.scenes.reduce(
      (total, scene) => total + (scene.narration?.trim().length ?? 0),
      0,
    ),
    durationLimitSeconds,
    voiceTone,
    motionStyle,
    modelId: lastModelIdUsed,
    error: null,
    createdAt: previousDraft?.createdAt ?? now,
    updatedAt: now,
  };
  await updateVideoProjectFields(auth, payload.projectId, {
    brief: writeVideoContentDraft(projectRow.brief, draft),
  });
  onProgress({ stage: "content_draft_ready" });
  return {
    kind: "content_draft" as const,
    traceId,
    attempt: draft.attempt,
    revision: projectRow.revision,
    modelId: lastModelIdUsed,
    creditsUsed: totalCreditsUsed,
  };
}

/**
 * Restores `payload.input.previousStatus` when a stage throws, then rethrows
 * so the job record still records the real error (spec §6.7). Restore
 * failures are logged and swallowed — they must never mask the original
 * error. `runVideoIntelligenceJob` never rethrows, so this wrapper is the
 * ONLY place a failed stage's status gets restored. Also emits a `finish`
 * audit event carrying the error, so a failed stage is as observable as a
 * successful one.
 *
 * section-08 §6.3 in-worker concurrency case: `saveVideoProjectDocument`
 * throws `VideoProjectRevisionConflictError` when a human saved between
 * dispatch and execution. Caught here (so the status is still restored) and
 * rethrown as a plain `Error` whose message starts with
 * `VI_REVISION_CONFLICT:` — a worker has no tRPC error codes, and this
 * `VI_`-prefixed string is what the client's job-error allowlist renders
 * verbatim instead of a generic fallback. NEVER swallowed: silently
 * absorbing this error would let the AI silently overwrite a concurrent
 * human edit (spec §8 trap #8).
 *
 * Also records a stage run (section-08 §6 — the schema-failure-rate
 * denominator) on BOTH the success and the failure path.
 */
async function withStageStatusRestore<T>(
  payload: VideoIntelligenceJobPayload,
  auth: ProjectAuthScope,
  run: () => Promise<T>,
): Promise<T> {
  try {
    const result = await run();
    recordVideoIntelligenceStageRun(payload.kind);
    return result;
  } catch (error) {
    recordVideoIntelligenceStageRun(payload.kind);

    const previousStatus =
      typeof payload.input.previousStatus === "string" ? payload.input.previousStatus : null;
    if (previousStatus) {
      try {
        await updateVideoProjectFields(auth, payload.projectId, { status: previousStatus });
      } catch (restoreError) {
        debugError(
          "videoProjects",
          `Failed to restore status for project ${payload.projectId} after a failed ${payload.kind} job`,
          restoreError,
        );
      }
    }

    const outgoingError =
      error instanceof VideoProjectRevisionConflictError
        ? new Error(`VI_REVISION_CONFLICT: ${error.message}`)
        : error;

    const traceId = typeof payload.input.traceId === "string" ? payload.input.traceId : mintTraceId();
    logStage(payload.kind, payload.projectId, traceId, "finish", {
      error: outgoingError instanceof Error ? outgoingError.message : String(outgoingError),
    });

    throw outgoingError;
  }
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
      return withStageStatusRestore(payload, auth, () =>
        executeScenePlanStage(payload, auth, onProgress),
      );
    case "narration":
      return withStageStatusRestore(payload, auth, () =>
        executeNarrationStage(payload, auth, onProgress),
      );
    case "quality_review":
      return withStageStatusRestore(payload, auth, () =>
        executeQualityReviewStage(payload, auth, onProgress),
      );
    case "quality_repair":
      return withStageStatusRestore(payload, auth, () =>
        executeQualityRepairStage(payload, auth, onProgress),
      );
    case "auto_draft":
      return withStageStatusRestore(payload, auth, () =>
        executeAutoDraftStage(payload, auth, onProgress),
      );
    case "content_draft":
      return withStageStatusRestore(payload, auth, () =>
        executeContentDraftStage(payload, auth, onProgress),
      );
    case "motion":
      return withStageStatusRestore(payload, auth, () =>
        executeMotionStage(payload, auth, onProgress),
      );
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

  duplicate: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        name: z.string().trim().min(1).max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      try {
        return await duplicateVideoProject(auth, input);
      } catch (error) {
        if (error instanceof VideoProjectNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
        }
        throw error;
      }
    }),

  updateAutomationMode: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        automationMode: z.enum(VIDEO_AUTOMATION_MODES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const row = await updateVideoProjectFields(auth, input.projectId, {
        automationMode: input.automationMode,
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return row;
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

  listByProduct: videoIntelligenceCrudProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return listVideoProjectsByProduct(auth, {
        productId: input.productId,
        limit: input.limit,
      });
    }),

  /**
   * Feature 143 §4.7 item 2 (the P0 asset picker procedure) / AC5 — a
   * tenant+owner-scoped, paged, kind-filterable list of assets the client
   * can place into `scene.layers[].src`. Deliberately backed by
   * `mediaAssets` ONLY (not `libraryItems`): `mediaAssets.checksumSha256`
   * is a real stored column, so this list can return a REAL content hash on
   * every row for free — `libraryItems` carries no checksum column, and
   * computing one per row here would mean an unbounded number of content
   * fetches inside a paginated LIST query (the same "don't hash bytes in
   * the request path when a stored hash already exists" principle behind
   * §4.7 item 1's `resolveProjectAssets` fix). Only rows that already carry
   * a stored `checksumSha256` are returned — legacy rows without one are
   * filtered out rather than surfaced with a fabricated/undefined hash.
   *
   * `storageUrl` is built with the exact same `toAbsoluteUrl` helper
   * `resolveProjectAssets` uses, so it is guaranteed to be an allowlisted,
   * same-origin storage-proxy URL (`isAllowedInternalAssetUrl` would accept
   * it) — safe to write straight into `scene.layers[].src`.
   */
  listPickerAssets: videoIntelligenceCrudProcedure
    .input(
      z
        .object({
          kind: ASSET_PICKER_KIND_SCHEMA.optional(),
          query: z.string().trim().max(200).optional(),
          limit: z.number().int().min(1).max(100).optional(),
          offset: z.number().int().min(0).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);

      const limit = input?.limit ?? 24;
      const offset = input?.offset ?? 0;

      const conditions = [
        eq(mediaAssets.tenantId, auth.tenantId),
        eq(mediaAssets.userId, auth.userId),
        // Only rows with a real stored content hash — see doc comment above.
        isNotNull(mediaAssets.checksumSha256),
      ];
      if (input?.kind) {
        conditions.push(ilike(mediaAssets.mimeType, `${input.kind}/%`));
      }
      if (input?.query) {
        const escaped = input.query.replace(/[%_\\]/g, ch => `\\${ch}`);
        conditions.push(ilike(mediaAssets.originalUrl, `%${escaped}%`));
      }

      // Fetch one extra row to cheaply determine `hasMore` without a second
      // COUNT query.
      const rows = (await db
        .select({
          id: mediaAssets.id,
          storageKey: mediaAssets.storageKey,
          checksumSha256: mediaAssets.checksumSha256,
          mimeType: mediaAssets.mimeType,
          width: mediaAssets.width,
          height: mediaAssets.height,
          thumbnailUrl: mediaAssets.thumbnailUrl,
        })
        .from(mediaAssets)
        .where(and(...conditions))
        .orderBy(desc(mediaAssets.createdAt))
        .limit(limit + 1)
        .offset(offset)) as Array<{
        id: number;
        storageKey: string;
        checksumSha256: string | null;
        mimeType: string;
        width: number | null;
        height: number | null;
        thumbnailUrl: string | null;
      }>;

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      const items = (
        await Promise.all(
          page.map(async row => {
            const kind = row.mimeType.split("/")[0];
            if (kind !== "image" && kind !== "video" && kind !== "audio") return null;
            const relativeUrl = await storageResolveUrl(row.storageKey);
            if (!relativeUrl || !row.checksumSha256) return null;
            return {
              assetId: row.id,
              storageUrl: toAbsoluteUrl(relativeUrl),
              sha256: row.checksumSha256,
              kind: kind as "image" | "video" | "audio",
              width: row.width ?? undefined,
              height: row.height ?? undefined,
              thumbnailUrl: row.thumbnailUrl ?? undefined,
            };
          }),
        )
      ).filter((item): item is NonNullable<typeof item> => item !== null);

      return {
        items,
        nextOffset: hasMore ? offset + limit : null,
      };
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

  /**
   * implementation-progress.md gap #1 (CLOSED, 2nd pass): `sourceRefs` was
   * write-once at `create` (see the Zod shape mirrored below), so a Catalog
   * Studio project created without a product id had no repair path for
   * `queueRender(profile: "final")`'s `VI_MISSING_SOURCE_REFS` gate short of
   * delete+recreate. Same owner-scoped, feature-flag-gated shape as
   * `updateBrief` immediately above — additive only, `create`'s own input
   * schema is unchanged.
   */
  updateSourceRefs: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        sourceRefs: z
          .object({ productIds: z.array(z.string().trim().min(1)).optional() })
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const row = await updateVideoProjectFields(auth, input.projectId, {
        sourceRefs: input.sourceRefs,
      });
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

      // Brand-kit reachability bridge (CMD-2 closure): `create` writes
      // `video_projects.brandKitId` but never writes a `document` itself —
      // `document` stays `null` until the workspace page's "initialize
      // document" flow calls THIS mutation for the first time with a
      // freshly-built default document (`createDefaultDocument.ts`, which
      // always seeds `brandKitId: null`, client-side). Without this bridge,
      // a brand kit chosen at `create` time could never reach
      // `document.brandKitId` — the ONLY field the compiler
      // (`resolveBrandKitForDocument`) and the scene planner ever read.
      // Only backfills when the incoming document doesn't already name a
      // brand kit — never silently overrides an explicit client choice
      // (including an explicit "detach" via `brandKitId: null` from
      // `setBrandKit` below, which always keeps the column and document in
      // sync itself and would never hit this branch).
      let documentToSave = parsedDocument.data;
      if (documentToSave.brandKitId === null) {
        const projectRowForBrandKit = await getVideoProject(auth, input.projectId);
        if (projectRowForBrandKit?.brandKitId) {
          documentToSave = {
            ...documentToSave,
            brandKitId: String(projectRowForBrandKit.brandKitId),
          };
        }
      }

      // F133-01 checkpoint 1 (CRITICAL, pre-merge security gate): reject any
      // scene.layers[] image/video/audio `src` that isn't an internal
      // storage-proxy URL BEFORE it is ever persisted (spec §17.3). See
      // `resolveProjectAssets`'s own call to this same assertion for
      // checkpoint 2 (defense-in-depth at compile/render time).
      try {
        assertSceneLayerAssetUrlsAllowed(documentToSave, "VI_DOCUMENT_INVALID");
      } catch (error) {
        mapCompileError(error);
      }

      // Feature 143 §4.12 — document-wide `scene.layers[].id` uniqueness,
      // asserted BEFORE persistence for the same reason as the SSRF
      // allowlist above: a duplicate id breaks `key={layer.id}` in the
      // flattened `<Player>`/render composition and can corrupt the
      // brand `cta` lock's canonical-text detection (see
      // `assertDocumentLayerIdsUnique`'s doc comment).
      try {
        assertDocumentLayerIdsUnique(documentToSave, "VI_DUPLICATE_LAYER_ID");
      } catch (error) {
        mapCompileError(error);
      }

      // implementation-progress.md gap #3 (CLOSED): the scene-planner's own
      // R2 timeline-invariant gate (`VI_PLAN_TIMELINE_INVALID` — inverted or
      // overlapping scenes, or a scene running past `format.durationMs`),
      // extracted as `assertSceneTimelineValid` so this hand-edit path gets
      // the SAME check the planner's merged output has always had, instead
      // of only failing later at compile/render time. Gaps between scenes
      // remain explicitly legal (unchanged planner semantics).
      try {
        assertSceneTimelineValid(documentToSave);
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "VI_PLAN_TIMELINE_INVALID: invalid scene timeline",
        });
      }

      try {
        return await saveVideoProjectDocument(auth, {
          id: input.projectId,
          baseRevision: input.baseRevision,
          document: documentToSave,
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

  /**
   * CMD-2 brand-kit reachability closure (spec §7.7 / §4.4): makes
   * `document.brandKitId` — the ONLY field `resolveBrandKitForDocument`
   * (this file, ~line 320) and `videoProjectScenePlanner.ts`'s advisory
   * brand-kit fact ever read — actually settable. Before this mutation
   * existed, `video_projects.brandKitId` (the `create` input column) could
   * be written but nothing ever propagated it onto `document.brandKitId`,
   * so a brand kit could never affect compilation/enforcement/rendering.
   *
   * Authority: `document.brandKitId` is authoritative (it's what the
   * compiler and scene planner read). `video_projects.brandKitId` is kept
   * as a denormalized mirror, always written in the SAME mutation — so from
   * any caller's point of view the two can never observably disagree.
   *
   * Validates the brand kit exists and belongs to this tenant+owner via
   * `getBrandKit` (owner-scoped — a foreign-tenant/foreign-user id resolves
   * to `null`, never leaks existence). `brandKitId: null` detaches.
   *
   * A future picker UI calls this with the project's current `revision` as
   * `baseRevision` (from `get`/`list`) and either a chosen `brandKitId` or
   * `null` to detach; `documentUpdated: false` in the response means the
   * project has no `document` yet (pre-"initialize document" flow) — the
   * column was still updated, and the pending `saveDocument` backfill
   * (above) will seed `document.brandKitId` from it on the first save.
   */
  setBrandKit: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1),
        brandKitId: z.number().int().positive().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);

      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      }
      if (projectRow.revision !== input.baseRevision) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            `VIDEO_PROJECT_REVISION_CONFLICT: project ${input.projectId} expected base revision ` +
            `${input.baseRevision} but current revision is ${projectRow.revision}`,
        });
      }

      if (input.brandKitId !== null) {
        const kit = await getBrandKit(auth, input.brandKitId);
        if (!kit) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Brand kit not found" });
        }
      }

      await updateVideoProjectFields(auth, input.projectId, { brandKitId: input.brandKitId });

      const parsedDocument = VideoProjectDocumentSchema.safeParse(projectRow.document);
      if (!parsedDocument.success) {
        // No document yet — the column write above is enough; the next
        // `saveDocument` call backfills `document.brandKitId` from it.
        return {
          revision: projectRow.revision,
          brandKitId: input.brandKitId,
          documentUpdated: false as const,
        };
      }

      const nextDocument: VideoProjectDocument = {
        ...parsedDocument.data,
        brandKitId: input.brandKitId === null ? null : String(input.brandKitId),
      };

      try {
        const { revision } = await saveVideoProjectDocument(auth, {
          id: input.projectId,
          baseRevision: input.baseRevision,
          document: nextDocument,
          reason: "set_brand_kit",
        });
        return { revision, brandKitId: input.brandKitId, documentUpdated: true as const };
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
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1).optional(),
        // §2 — the only field section-05 adds to the dispatch input.
        // `fill_empty` (default) never overwrites existing work; `replace`
        // is destructive and must be reachable only behind an explicit UI
        // confirmation (section-07).
        mode: z.enum(["replace", "fill_empty"]).default("fill_empty"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return dispatchStageJob({
        auth,
        projectId: input.projectId,
        stage: "scene_plan",
        kind: "scene_plan",
        nextStatus: "scenes",
        requestedBaseRevision: input.baseRevision,
        extraInput: { mode: input.mode },
      });
    }),

  /**
   * The `auto_draft` job kind — chains scene_plan (fill_empty) -> the
   * narration-script skill -> TTS synthesis + caption cues into ONE
   * BullMQ job (`executeAutoDraftStage`). Same dispatch preamble/rate limit
   * as every other generation-stage runner in this router.
   */
  runAutoDraftStage: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return dispatchStageJob({
        auth,
        projectId: input.projectId,
        stage: "auto_draft",
        kind: "auto_draft",
        nextStatus: "scenes",
        requestedBaseRevision: input.baseRevision,
      });
    }),

  /** Review-first content draft: generate script/scene candidates only. */
  runContentDraft: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1).optional(),
        feedback: z.string().trim().max(2000).optional(),
        modelId: z.string().trim().min(1).max(200),
        durationLimitSeconds: z.union([
          z.literal(30),
          z.literal(60),
          z.literal(90),
          z.literal(180),
          z.literal(300),
        ]).optional(),
        voiceTone: z.string().trim().max(80).optional(),
        motionStyle: z.string().trim().max(80).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      const recommendedModels = await listRecommendedStructuredStageModels();
      if (!recommendedModels.some(model => model.modelId === input.modelId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `VI_MODEL_NOT_RECOMMENDED: model "${input.modelId}" is not in the recommended structured-output set`,
        });
      }

      const previousDraft = readVideoContentDraft(projectRow.brief);
      const now = new Date().toISOString();
      const generatingDraft: VideoContentDraftState = {
        status: "generating",
        attempt: (previousDraft?.attempt ?? 0) + 1,
        feedback: input.feedback?.trim() || null,
        document: previousDraft?.document ?? null,
        summary: previousDraft?.summary ?? null,
        totalNarrationCharacters: previousDraft?.totalNarrationCharacters ?? 0,
        durationLimitSeconds: resolveContentDraftDurationSeconds(input.durationLimitSeconds),
        voiceTone: resolveContentDraftVoiceTone(input.voiceTone),
        motionStyle: resolveContentDraftMotionStyle(input.motionStyle),
        modelId: null,
        error: null,
        createdAt: previousDraft?.createdAt ?? now,
        updatedAt: now,
      };
      await updateVideoProjectFields(auth, input.projectId, {
        brief: writeVideoContentDraft(projectRow.brief, generatingDraft),
      });

      try {
        return await dispatchStageJob({
          auth,
          projectId: input.projectId,
          stage: "scene_plan",
          kind: "content_draft",
          // Content review does not advance the production stage.
          nextStatus: projectRow.status,
          requestedBaseRevision: input.baseRevision,
          selectedModelId: input.modelId,
          extraInput: {
            feedback: input.feedback?.trim() || null,
            durationLimitSeconds: resolveContentDraftDurationSeconds(input.durationLimitSeconds),
            voiceTone: resolveContentDraftVoiceTone(input.voiceTone),
            motionStyle: resolveContentDraftMotionStyle(input.motionStyle),
          },
        });
      } catch (error) {
        await updateVideoProjectFields(auth, input.projectId, {
          brief: writeVideoContentDraft(projectRow.brief, previousDraft),
        }).catch(() => undefined);
        throw error;
      }
    }),

  getContentDraft: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return readVideoContentDraft(projectRow.brief);
    }),

  acceptContentDraft: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive(), baseRevision: z.number().int().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      const draft = readVideoContentDraft(projectRow.brief);
      if (!draft?.document || draft.status !== "ready") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "VI_DRAFT_NOT_READY: Generate and review a content draft before accepting it.",
        });
      }

      const saved = await saveVideoProjectDocument(auth, {
        id: input.projectId,
        baseRevision: input.baseRevision,
        document: draft.document,
        reason: "content_draft_accept",
      });
      const row = await updateVideoProjectFields(auth, input.projectId, {
        brief: writeVideoContentDraft(projectRow.brief, null),
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return { ...row, revision: saved.revision };
    }),

  /**
   * Motion stage — multi-variant picker. Proposes 2-3 motion-template
   * candidates per scene into `scene.motionCandidates` (never touches
   * `scene.visual`/`scene.motion`). `mode: "fill_empty"` (default) only
   * (re)proposes candidates for scenes with no `selectedMotionCandidateId`
   * yet — never destructive. `mode: "replace"` refreshes the offered list
   * for EVERY scene but still never overwrites an already-applied
   * selection (see `videoProjectMotionDirector.ts`'s header) — reachable
   * only behind an explicit UI confirmation, same convention as
   * `runScenePlanStage`'s own `replace` mode.
   *
   * A picker UI: call this, poll `getGenerationJobStatus`/
   * `getActiveGenerationJob` for completion, then read
   * `document.scenes[].motionCandidates` (via `get`) to render the options
   * and call `selectMotionCandidate` once the user picks one.
   */
  runMotionStage: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1).optional(),
        mode: z.enum(["replace", "fill_empty"]).default("fill_empty"),
        variantsPerScene: z
          .object({
            min: z.number().int().min(1).max(MOTION_VARIANTS_PER_SCENE_CEILING).default(2),
            max: z.number().int().min(1).max(MOTION_VARIANTS_PER_SCENE_CEILING).default(3),
          })
          .refine(v => v.max >= v.min, { message: "variantsPerScene.max must be >= min" })
          .default({ min: 2, max: 3 }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return dispatchStageJob({
        auth,
        projectId: input.projectId,
        stage: "motion",
        kind: "motion",
        nextStatus: "motion",
        requestedBaseRevision: input.baseRevision,
        extraInput: { mode: input.mode, variantsPerScene: input.variantsPerScene },
      });
    }),

  /**
   * Drafts one scene-linked B-roll prompt through the dedicated skill. This
   * procedure never calls a paid image/video provider; the client must show
   * the editable result and the later media mutation is the sole paid action.
   */
  createBrollPromptDraft: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        sceneId: z.string().trim().min(1),
        kind: z.enum(["image", "video"]),
        referenceImageUrl: z.string().trim().max(4000).optional(),
        userInstructions: z.string().trim().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { document } = await loadDocumentOrThrow(auth, input.projectId);
      const scene = document.scenes.find(candidate => candidate.sceneId === input.sceneId);
      if (!scene) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Scene "${input.sceneId}" not found` });
      }

      let selection;
      try {
        selection = await resolveStructuredStageModelSelection();
      } catch (error) {
        if (error instanceof VideoIntelligenceModelError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }

      const traceId = mintTraceId();
      const runSkill = makeRunBrollPromptSkill({
        tenantId: auth.tenantId,
        userId: auth.userId,
        projectId: input.projectId,
        traceId,
        modelId: selection.modelId,
      });
      let draft: BrollPromptSkillOutput;
      try {
        draft = await runSkill({
          kind: input.kind,
          brief: {
            topic: document.content.topic ?? null,
            audience: document.content.audience ?? null,
            language: document.content.language,
            platformPreset: document.content.platformPreset,
            studioType: "video_edit",
          },
          scene: {
            sceneId: scene.sceneId,
            startMs: scene.startMs,
            endMs: scene.endMs,
            narration: scene.narration,
            captionText: scene.captionCues.map(cue => cue.text),
          },
          referenceImageUrl: input.referenceImageUrl ?? null,
          userInstructions: input.userInstructions ?? null,
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "B-roll prompt draft failed",
          cause: error,
        });
      }

      if (draft.kind !== input.kind || draft.sceneId !== scene.sceneId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "VI_BROLL_PROMPT_INVALID: skill returned a prompt for the wrong scene or media kind",
        });
      }

      return { draft, promptModelId: selection.modelId, traceId };
    }),

  /**
   * Applies one previously-generated motion candidate to a scene —
   * cheap, synchronous, no LLM call, no credit charge. This is the ONLY
   * mutation that ever writes `scene.visual`/`scene.motion` from a
   * `motionCandidates` entry; `runMotionStage` only ever populates the
   * offered list. The picker UI calls this when the user clicks a
   * candidate.
   */
  selectMotionCandidate: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1),
        sceneId: z.string().trim().min(1),
        candidateId: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { document } = await loadDocumentOrThrow(auth, input.projectId);

      const scene = document.scenes.find(s => s.sceneId === input.sceneId);
      if (!scene) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Scene "${input.sceneId}" not found` });
      }
      const chosen = (scene.motionCandidates ?? []).find(c => c.candidateId === input.candidateId);
      if (!chosen) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Motion candidate "${input.candidateId}" not found on scene "${input.sceneId}"`,
        });
      }

      const nextDocument: VideoProjectDocument = {
        ...document,
        scenes: document.scenes.map(s =>
          s.sceneId !== input.sceneId
            ? s
            : {
                ...s,
                visual: { kind: "template", templateId: chosen.templateId, params: chosen.templateParams },
                motion: chosen.motion,
                selectedMotionCandidateId: chosen.candidateId,
              },
        ),
      };

      try {
        return await saveVideoProjectDocument(auth, {
          id: input.projectId,
          baseRevision: input.baseRevision,
          document: nextDocument,
          reason: "select_motion_candidate",
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

  runNarrationStage: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        sceneIds: z.array(z.string().min(1)).optional(),
        narrationSettings: VideoProjectNarrationSettingsSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const traceId = mintTraceId();
      logStage("narration", input.projectId, traceId, "start");

      const { projectRow, document } = await loadDocumentOrThrow(auth, input.projectId);
      const targetSceneIds = input.sceneIds ? new Set(input.sceneIds) : null;

      const result = await synthesizeProjectNarration({
        auth,
        projectId: input.projectId,
        projectRevision: projectRow.revision,
        document,
        targetSceneIds,
        settings: input.narrationSettings,
      });

      logStage("narration", input.projectId, traceId, "finish", {
        scenesNarrated: result.scenesNarrated,
        creditsCharged: result.creditsCharged,
      });

      return {
        revision: result.revision,
        scenesNarrated: result.scenesNarrated,
        creditsCharged: result.creditsCharged,
      };
    }),

  /** Job-backed narration entry point for Video Studio. The mutation only
   * acknowledges enqueueing; the worker performs provider generation,
   * storage, caption alignment, and document persistence. */
  runNarrationStageAsync: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        sceneIds: z.array(z.string().min(1)).optional(),
        narrationSettings: VideoProjectNarrationSettingsSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return dispatchStageJob({
        auth,
        projectId: input.projectId,
        stage: "narration",
        kind: "narration",
        nextStatus: "narration",
        extraInput: {
          sceneIds: input.sceneIds ?? null,
          narrationSettings: input.narrationSettings ?? null,
        },
      });
    }),

  runQualityReview: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return dispatchStageJob({
        auth,
        projectId: input.projectId,
        stage: "quality_review",
        kind: "quality_review",
        nextStatus: "qa",
        requestedBaseRevision: input.baseRevision,
      });
    }),

  applyQualityRepairs: videoIntelligenceGenProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        baseRevision: z.number().int().min(1).optional(),
        stages: z.array(z.string().min(1)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      return dispatchStageJob({
        auth,
        projectId: input.projectId,
        stage: "quality_repair",
        kind: "quality_repair",
        nextStatus: "qa",
        requestedBaseRevision: input.baseRevision,
        extraInput: { stages: input.stages ?? [] },
      });
    }),

  /**
   * Feature 142, section-04: a credit estimate for the WHOLE loop, derived
   * from real model pricing and real document size — never a hardcoded
   * constant. Registered on the CRUD procedure (60/min), not the gen
   * procedure, because this is a read the UI calls on panel open and must
   * not consume the 20/min generation budget the actual run needs.
   */
  listRecommendedStageModels: videoIntelligenceCrudProcedure.query(async ({ ctx }) => {
    await assertVideoIntelligenceEnabled(ctx.tenantId);
    try {
      return { models: await listRecommendedStructuredStageModels() };
    } catch (error) {
      if (error instanceof VideoIntelligenceModelError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
      }
      throw error;
    }
  }),

  getStageEstimate: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        stage: z.enum(["scene_plan", "quality_review", "quality_repair", "auto_draft", "narration", "motion"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { document } = await loadDocumentOrThrow(auth, input.projectId);

      try {
        // `auto_draft` is a router-owned composite estimate (scene_plan +
        // narration-script + TTS, see `buildAutoDraftStageEstimate`) — it
        // never enters `buildStageEstimate`'s 3-stage machinery directly.
        // `narration` (gap #4, CLOSED) is priced purely by TTS char count
        // (`buildNarrationStageEstimate`) — it never resolves an LLM model
        // either, so it also never enters `buildStageEstimate`.
        if (input.stage === "narration") {
          return buildNarrationStageEstimate(document).estimate;
        }
        const { estimate } =
          input.stage === "auto_draft"
            ? await buildAutoDraftStageEstimate(document)
            : await buildStageEstimate(document, input.stage);
        return estimate;
      } catch (error) {
        if (error instanceof VideoIntelligenceModelError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
        }
        throw error;
      }
    }),

  /**
   * Feature 143 §4.6 — the layer-budget meter's data source: a breakdown of
   * the 40-layer render budget by source (hand-authored / template / caption
   * / audio, plus the `hidden` count that is excluded from the total). Reads
   * `computeLayerBudgetBreakdown`, which is built on the SAME non-throwing
   * dry-estimate the `compiledTotal` field already uses — deliberately NEVER
   * a real `compileVideoProject` call, so the meter keeps returning a number
   * even when brand-lock enforcement would make an actual compile throw
   * `BrandLockViolationError` (the moment the user most needs the meter to
   * stay lit, not go blank). Registered on the CRUD procedure (60/min), same
   * as `getStageEstimate` — a read the UI calls on panel/timeline open.
   */
  getLayerBudget: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { document } = await loadDocumentOrThrow(auth, input.projectId);
      return computeLayerBudgetBreakdown(document);
    }),

  approveStage: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { projectRow, document } = await loadDocumentOrThrow(auth, input.projectId);

      if (!isStageResultReady(projectRow.status, document)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `VI_STAGE_NOT_READY: Stage "${projectRow.status}" has no complete persisted result to approve.`,
        });
      }

      const currentIndex = STAGE_ORDER.indexOf(projectRow.status as (typeof STAGE_ORDER)[number]);
      const nextStatus =
        currentIndex >= 0 && currentIndex < STAGE_ORDER.length - 1
          ? STAGE_ORDER[currentIndex + 1]
          : projectRow.status;

      const row = await updateVideoProjectFields(auth, input.projectId, { status: nextStatus });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });
      return row;
    }),

  /**
   * Guided-mode "hold": keeps the current stage (no status advance). CMD-2
   * closure — `reason` used to be accepted and silently thrown away
   * ("Phase 2" stub); it is now persisted onto `video_projects.qaLedger`
   * via `appendQaLedgerEntry` (the same jsonb column `runQualityReview`
   * writes to) so a rejection reason is actually discoverable afterwards
   * instead of vanishing the moment the response is sent. This reuses the
   * ledger's existing `QaLedgerEntry` shape rather than adding a new
   * column/table — `review.score`/`scorecard` are `0`/`{}` (never a
   * fabricated AI judgment) and the reason lives in
   * `review.issues[0].message` with a `stage_reject` dimension so a reader
   * can tell this entry apart from a real `quality_review` round. Only
   * writes an entry when a `reason` was actually given — a bare "hold" with
   * no reason has nothing new to record.
   */
  rejectStage: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive(), reason: z.string().trim().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      if (input.reason) {
        const traceId = mintTraceId();
        try {
          await appendQaLedgerEntry(auth, input.projectId, {
            at: new Date().toISOString(),
            round: 0,
            revision: projectRow.revision,
            review: {
              score: 0,
              scorecard: {},
              issues: [
                {
                  dimension: "stage_reject",
                  severity: "low",
                  message: `Stage "${projectRow.status}" held: ${input.reason}`,
                },
              ],
            },
            creditsUsed: 0,
            modelId: null,
            traceId,
          });
        } catch (error) {
          // Best-effort — a ledger-append failure must never block the
          // "hold" response the caller is actually waiting on.
          debugError(
            "videoProjects",
            `rejectStage: failed to append reject reason to qaLedger for project ${input.projectId}`,
            error,
          );
        }
      }

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
        return { kind: "single" as const, config: toBrowserCompiledConfig(compileResult.config), cost: compileResult.cost };
      }
      return {
        kind: "segmented" as const,
        parts: compileResult.parts.map(toBrowserCompiledConfig),
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

      const compiledConfigs =
        compileResult.kind === "single" ? [compileResult.config] : compileResult.parts;
      const configsForRender = compiledConfigs.map(config =>
        input.profile === "preview" ? downscaleConfigForPreview(config) : config,
      );
      const configForRender = configsForRender[0]!;
      const isSegmented = compileResult.kind === "segmented";
      const segmentPlan = isSegmented
        ? {
            parts: configsForRender.map((config, index) => ({
              index,
              durationInFrames: config.durationInFrames,
            })),
          }
        : null;
      const durationInFrames = configsForRender.reduce(
        (total, config) => total + config.durationInFrames,
        0,
      );

      const manifests = configsForRender.map(config => buildAssetManifest(config, resolver));
      // §4.10/RK12: one `role: "font"` manifest source per distinct
      // allowlisted family this document's text layers actually use, so the
      // worker's pre-flight `stage_assets` step can fail fast (clear error)
      // instead of the render silently shipping tofu.
      const fontSources = (
        await Promise.all(configsForRender.map(config => buildFontManifestSources(config)))
      ).flat();
      const mergedManifest = mergeAssetManifests([
        ...manifests,
        { sources: fontSources },
      ]);
      const manifestWithHashes: AssetManifest = {
        sources: mergedManifest.sources.map(source => ({
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
        postPasses: [
          ...(isSegmented ? (["segment_concat"] as const) : []),
          "loudnorm",
          ...(document.captions.burnIn ? (["ass_burn"] as const) : []),
        ],
        segmentPlan,
        ...(isSegmented ? { segmentTemplates: configsForRender } : {}),
        remotionTemplateHash: createHash("sha256")
          .update(JSON.stringify(isSegmented ? configsForRender : configForRender))
          .digest("hex"),
        durationInFrames,
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
        executionTarget:
          (ctx.req as typeof ctx.req & { smartaihubMcpRemotionExecutor?: boolean }).smartaihubMcpRemotionExecutor
            ? "remotion_executor"
            : "desktop_worker",
        preferredWorkerId:
          (ctx.req as typeof ctx.req & { smartaihubRemotionWorkerId?: string }).smartaihubRemotionWorkerId ?? null,
      });

      // Tracks whether the `renderJobId`/`previewJobId` backlink write below
      // actually landed. Previously this failure was fully swallowed (only
      // `debugError`-logged, never surfaced to the caller) — the render was
      // already queued and dispatch below still proceeds regardless (the
      // worker job itself does not depend on this backlink), but the CALLER
      // must be able to tell the write didn't happen, since a lost backlink
      // means `getRenderStatus`/the studio can never find this job again.
      let backlinkPersisted = true;

      if (created) {
        await updateVideoProjectFields(
          auth,
          input.projectId,
          input.profile === "final" ? { renderJobId: job.id } : { previewJobId: job.id },
        ).catch(error => {
          backlinkPersisted = false;
          debugError("videoProjects", `Failed to persist ${input.profile} worker job backlink`, error);
        });

        // Lane-A dispatch (closes implementation-progress.md gap #2 — see
        // `videoIntelligenceJobs.ts`'s module doc comment for the full
        // rationale). Fire-and-forget: the tRPC response returns
        // `{ workerJobId }` immediately; the render runs in the background
        // of this same in-process server. `userId` is threaded through so
        // the dispatcher can mirror the render's terminal state back onto
        // this owner-scoped `video_projects` row (post-render lifecycle,
        // CMD-2 backend gap closure).
        void dispatchLaneARemotionRenderJob({
          tenantId: auth.tenantId,
          userId: auth.userId,
          workerJobId: job.id,
        }).catch(error => {
          debugError("videoProjects", `Lane-A dispatch failed for worker job ${job.id}`, error);
        });
      }

      logStage("queue_render", input.projectId, traceId, "finish", { workerJobId: job.id, created });
      return { workerJobId: job.id, created, backlinkPersisted };
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

  /** Returns owner-scoped narration assets referenced by the current
   * document. The URL is resolved through the storage layer so the client
   * can play the completed TTS without receiving storage keys.
   *
   * This is a browser-facing response: keep storage-proxy URLs relative to
   * the public app origin. `toAbsoluteUrl` is intentionally reserved for
   * worker/Remotion URLs and may point at an internal Node address such as
   * localhost, which a user's browser cannot reach.
   */
  getNarrationAssets: videoIntelligenceCrudProcedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const { document } = await loadDocumentOrThrow(auth, input.projectId);
      const durationByAssetId = new Map(
        document.scenes
          .filter(scene => scene.narrationAudioAssetId != null)
          .map(scene => [scene.narrationAudioAssetId as number, scene.narrationAudioDurationMs ?? null]),
      );
      const assetIds = Array.from(durationByAssetId.keys());
      if (assetIds.length === 0) return { items: [] };

      const rows = (await db
        .select({
          id: mediaAssets.id,
          storageKey: mediaAssets.storageKey,
          mimeType: mediaAssets.mimeType,
        })
        .from(mediaAssets)
        .where(
          and(
            eq(mediaAssets.tenantId, auth.tenantId),
            eq(mediaAssets.userId, auth.userId),
            inArray(mediaAssets.id, assetIds),
          ),
        )) as Array<{ id: number; storageKey: string; mimeType: string }>;

      const items = (
        await Promise.all(
          rows.map(async row => {
            const relativeUrl = await storageResolveUrl(row.storageKey);
            if (!relativeUrl) return null;
            return {
              sceneId: document.scenes.find(scene => scene.narrationAudioAssetId === row.id)?.sceneId ?? null,
              assetId: row.id,
              audioUrl: relativeUrl,
              mimeType: row.mimeType,
              durationMs: durationByAssetId.get(row.id) ?? null,
            };
          }),
        )
      ).filter((item): item is NonNullable<typeof item> => item !== null && item.sceneId !== null);

      return { items };
    }),

  /**
   * Post-render lifecycle gap closure (CMD-2 backend): a `queueRender`
   * caller previously had NO way to poll the resulting `remotion_render_video`
   * `worker_jobs` row — `renderJobId`/`previewJobId` were write-only columns
   * (see `videoProjectRepo.ts`'s doc comment). Mirrors
   * `getGenerationJobStatus`'s owner-scoped-read shape, but reads the
   * `worker_jobs` table directly (the Lane-A render lives there, not in the
   * Redis-backed `video_intelligence_jobs` job store `getGenerationJobStatus`
   * reads from — those are two separate queues, see `videoIntelligenceJobs.ts`'s
   * module doc comment).
   *
   * `profile` defaults to `"final"` when the project has a `renderJobId`,
   * else falls back to `"preview"` — mirrors the UI's own priority (a studio
   * user cares about the final render's status once one has been queued).
   * Never throws for "no job queued yet" — returns `jobId: null` instead, so
   * a poller can treat that as "nothing to show" without a try/catch.
   */
  getRenderStatus: videoIntelligenceCrudProcedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        profile: RENDER_PROFILE_SCHEMA.optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertVideoIntelligenceEnabled(ctx.tenantId);
      const auth = requireAuthScope(ctx);
      const projectRow = await getVideoProject(auth, input.projectId);
      if (!projectRow) throw new TRPCError({ code: "NOT_FOUND", message: "Video project not found" });

      const profile: "preview" | "final" =
        input.profile ?? (projectRow.renderJobId ? "final" : "preview");
      const jobId = profile === "final" ? projectRow.renderJobId : projectRow.previewJobId;

      if (!jobId) {
        return {
          profile,
          jobId: null,
          status: null,
          resultVideoUrl: null,
          failureReason: null,
          updatedAt: null,
        };
      }

      // Tenant-scoped (not just owner-scoped by `projectRow`'s own lookup
      // above) — belt-and-suspenders against a `worker_jobs` row somehow
      // belonging to a different tenant than this already-owner-verified
      // project.
      const [jobRow] = await db
        .select()
        .from(workerJobs)
        .where(and(eq(workerJobs.id, jobId), eq(workerJobs.tenantId, auth.tenantId)))
        .limit(1);

      if (!jobRow) {
        return {
          profile,
          jobId,
          status: null,
          resultVideoUrl: null,
          failureReason: null,
          updatedAt: null,
        };
      }

      const outputUrl =
        typeof (jobRow.outputJson as Record<string, unknown> | null)?.outputUrl === "string"
          ? ((jobRow.outputJson as Record<string, unknown>).outputUrl as string)
          : null;

      return {
        profile,
        jobId,
        status: jobRow.status,
        resultVideoUrl: jobRow.status === "completed" ? outputUrl : null,
        failureReason: jobRow.status === "failed" ? (jobRow.failureReason ?? null) : null,
        updatedAt: (jobRow.finishedAt ?? jobRow.startedAt ?? jobRow.createdAt)?.toISOString?.() ?? null,
      };
    }),

  /* ---- 4.5 Brand kits -------------------------------------------------------- */

  brandKits: brandKitsRouter,
});

export type VideoProjectsRouter = typeof videoProjectsRouter;
