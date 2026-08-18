import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { signBearerToken } from "../_core/tokens";
import {
  PRESENTATION_EDITOR_ROUTE_BASE,
  PRESENTATION_ERROR_CODE,
  PRESENTATION_EXPORT_MAX_HEIGHT,
  PRESENTATION_EXPORT_MAX_WIDTH,
  isPresentationFeatureEnabled,
  isPresentationExportWriteEnabled,
  isPresentationAIGenerationEnabled,
} from "@shared/presentation/constants";
import {
  isPresentationItemType,
  presentationAvailabilitySchema,
  presentationSlideContentSchema,
  presentationRouteGuardInputSchema,
  presentationRouteGuardResultSchema,
  audioTrackInputSchema,
  projectAudioTrackInputSchema,
  type PresentationAvailability,
  type PresentationRouteBlockedResult,
  type PresentationRouteGuardResult,
} from "@shared/presentation/contracts";
import { getDb } from "../db";
import { getExportsByDeckId } from "../services/presentationExportService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getUnifiedMediaTask } from "../services/mediaTaskPollingService";
import { ensurePresentationTaskResultDurable } from "../services/presentationMediaAssetService";
import {
  PresentationServiceError,
  addSlideToDeck,
  attachAssetToDeck,
  createPresentationDeckForLibraryItem,
  deletePresentationDeck,
  deleteSlideFromDeck,
  detachAssetFromDeck,
  duplicateSlideInDeck,
  createPresentationFromTemplate,
  createTemplateFromPresentation,
  getPresentationDeckByLibraryItem,
  getPresentationDeckDetail,
  listPresentationVersionHistory,
  listAssetsForDeck,
  listSlidesForDeck,
  reorderSlidesInDeck,
  restorePresentationVersion,
  uploadAssetToDeck,
  updatePresentationDeckMetadata,
  updateSlideInDeck,
  updateSlideAudioTrack,
  updateDeckProjectAudioTrack,
  generateSlideAudioFromSavedNote,
} from "../services/presentationService";
import {
  convertOfficeSourceToPresentation,
  getPresentationCompatibilityOpen,
} from "../services/presentationCompatibilityService";
import {
  buildPlayDeckPayload,
  buildSlideshowPayload,
  cancelPresentationExport,
  getPresentationExportStatus,
  triggerPresentationExport,
} from "../services/presentationPlaybackExport";
import { applyTemplateAssetToDeck } from "../services/presentationTemplateService";
import { getRedisClient } from "../services/redis";
import {
  generateAIDraft,
  generateLayoutFromNoteAsync,
  generateLayoutFromDeckNoteAsync,
  repairSlideFromSavedNote,
  relayoutExistingSlideAsync,
  resolvePendingMediaForDeck,
} from "../services/aiPresentationService";
import {
  generatePresentationArticle,
  generatePresentationSlideDraft,
  preparePresentationSlideBundle,
} from "../services/presentationArticleGenerator";
import { resolveAutoDraftParams } from "../services/autoDraftResolver";
import { createLibraryItem } from "../services/libraryService";
import {
  deletePresentationCustomBlock,
  listPresentationCustomBlockGovernanceAudit,
  listPresentationCustomBlocks,
  renderPresentationCustomBlockPreview,
  savePresentationCustomBlock,
  trackPresentationCustomBlockUse,
  updatePresentationCustomBlock,
} from "../services/presentationCustomBlockService";
import { presentationCustomBlockGovernanceAuditInputSchema } from "@shared/presentation/customBlocks";
import {
  AI_GEOMETRIC_ACCENT_SHAPES,
  AI_GEOMETRIC_CROP_SHAPES,
  AI_LAYOUT_TEMPLATE_IDS,
  AI_STYLE_PRESET_IDS,
  AIWatermarkSchema,
  GenerateAIDraftInputSchema,
  GenerateLayoutFromNoteInputSchema,
  GenerateLayoutFromDeckNoteInputSchema,
  MAX_AI_DRAFT_SLIDES,
  type GenerateAIDraftInput,
} from "@shared/presentation/aiTypes";
import { BUILT_IN_PRESENTATION_COMPONENT_IDS } from "@shared/presentation/componentRecipes";
import {
  presentationCustomBlockCreateInputSchema,
  presentationCustomBlockDeleteInputSchema,
  presentationCustomBlockListInputSchema,
  presentationCustomBlockRenderPreviewInputSchema,
  presentationCustomBlockTrackUseInputSchema,
  presentationCustomBlockUpdateInputSchema,
} from "@shared/presentation/customBlocks";

const DOCUMENT_MANAGEMENT_ROUTE_BASE =
  "/document-management?scope=my_library&sort=updated_desc&mode=editor&doc=";
// 50MB binary file + base64 overhead.
const MAX_PRESENTATION_UPLOAD_BASE64_LENGTH = 68_000_000;
const presentationEditorialPlannerOptionsSchema = z.object({
  targetAudience: z.enum(["parents", "educators", "healthcare"]).optional(),
  tonePreset: z.enum(["warm_parenting", "premium_editorial", "clinical_guidance"]).optional(),
  fitPreset: z.enum(["balanced", "image_forward", "text_safe"]).optional(),
  pageCountMode: z.enum(["auto", "fixed"]).optional(),
  requestedPageCount: z.number().int().min(1).max(20).optional(),
  globalStylePrompt: z.string().trim().max(4_000).optional().nullable(),
  renderSafety: z.record(z.unknown()).optional().nullable(),
  pageFillRules: z.record(z.unknown()).optional().nullable(),
  qualityOptimizer: z.record(z.unknown()).optional().nullable(),
  imageAssets: z.array(z.discriminatedUnion("assetType", [
    z.object({
      assetType: z.literal("image_prompt"),
      label: z.string().trim().min(1).max(255),
      pageHint: z.number().int().min(1).max(20).optional(),
      prompt: z.string().trim().min(1).max(4_000),
      reference: z.string().trim().max(4_000).optional().nullable(),
    }),
    z.object({
      assetType: z.literal("uploaded_image"),
      label: z.string().trim().min(1).max(255),
      pageHint: z.number().int().min(1).max(20).optional(),
      prompt: z.string().trim().max(4_000).optional().nullable(),
      reference: z.string().trim().url().max(4_000),
    }),
  ])).max(60).optional(),
}).optional();
const AI_DRAFT_STALLED_PROGRESS_MS = 60_000;
const AI_DRAFT_STALLED_LOCK_TTL_SECONDS = 240;
const PRESENTATION_SLIDE_CANVAS_RATIOS = ["16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1"] as const;
const PRESENTATION_SLIDE_OUTPUT_FORMATS = ["json", "md", "pptx", "pdf"] as const;

type DraftProgressStatus = {
  phase: number;
  phaseLabel: string;
  phaseDetail?: string;
  slidesCompleted: number;
  totalSlides: number;
  slidePreview: Array<{ title: string; imageStatus: string }>;
  completed: boolean;
  updatedAt?: string;
  workerActive?: boolean;
  diagnostics?: {
    taskId: string;
    operation?: string;
    model?: string;
    recipeId?: string;
    compactionLevel?: "balanced" | "compact" | "aggressive";
    attempt?: number;
    maxAttempts?: number;
    startedAt?: string;
    deadlineAt?: string;
  };
  cancelled?: boolean;
  error?: { code: string; message: string };
  result?: { slidesAdded: number; newDeckVersion: number; articlePreview: string; warnings: string[] };
};

type StoredDraftProgress = DraftProgressStatus & {
  userId?: number;
};

export function finalizeStalledDraftProgress(options: {
  progress: StoredDraftProgress;
  taskId: string;
  workerActive: boolean;
  lockTtlSeconds?: number | null;
  nowMs?: number;
}): {
  progress: StoredDraftProgress;
  workerActive: boolean;
  shouldPersist: boolean;
  shouldReleaseLock: boolean;
} {
  const updatedAt = options.progress.updatedAt;
  const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const nowMs = options.nowMs ?? Date.now();
  const isStale = Number.isFinite(updatedAtMs)
    ? nowMs - updatedAtMs >= AI_DRAFT_STALLED_PROGRESS_MS
    : false;

  if (options.progress.completed || !isStale) {
    return {
      progress: options.progress,
      workerActive: options.workerActive,
      shouldPersist: false,
      shouldReleaseLock: false,
    };
  }

  let errorMessage: string | null = null;
  if (!options.workerActive) {
    errorMessage = `Draft run stopped because no active worker remained attached during "${options.progress.phaseLabel}". Retry the draft.`;
  } else if (
    typeof options.lockTtlSeconds === "number"
    && options.lockTtlSeconds > 0
    && options.lockTtlSeconds <= AI_DRAFT_STALLED_LOCK_TTL_SECONDS
  ) {
    errorMessage = `Draft run stopped responding during "${options.progress.phaseLabel}". Retry the draft.`;
  }

  if (!errorMessage) {
    return {
      progress: options.progress,
      workerActive: options.workerActive,
      shouldPersist: false,
      shouldReleaseLock: false,
    };
  }

  return {
    progress: {
      ...options.progress,
      completed: true,
      cancelled: false,
      error: {
        code: "stalled",
        message: errorMessage,
      },
      updatedAt: new Date(nowMs).toISOString(),
      workerActive: false,
    },
    workerActive: false,
    shouldPersist: true,
    shouldReleaseLock: true,
  };
}

function buildWrongTypeGuard(itemId: number, itemType: string): PresentationRouteBlockedResult {
  return {
    allowed: false,
    itemId,
    itemType,
    errorCode: PRESENTATION_ERROR_CODE.ITEM_TYPE_MISMATCH,
    message: `Presentation editor only supports itemType=\"presentation\". Received \"${itemType}\".`,
    recoveryCta: {
      label: "Open in Document Management",
      href: `${DOCUMENT_MANAGEMENT_ROUTE_BASE}${itemId}`,
    },
  };
}

function buildFeatureDisabledGuard(itemId: number, itemType: string): PresentationRouteBlockedResult {
  return {
    allowed: false,
    itemId,
    itemType,
    errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    message: "Presentation editor is currently disabled.",
    recoveryCta: {
      label: "Open in Document Management",
      href: `${DOCUMENT_MANAGEMENT_ROUTE_BASE}${itemId}`,
    },
  };
}

function getAvailability(): PresentationAvailability {
  if (!isPresentationFeatureEnabled()) {
    return {
      enabled: false,
      errorCode: PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
      message: "Presentation editor is currently disabled.",
    };
  }

  return {
    enabled: true,
    aiGenerationEnabled: isPresentationAIGenerationEnabled(),
  };
}

function ensureAIGenerationEnabled(): void {
  if (isPresentationAIGenerationEnabled()) {
    return;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: AI presentation generation is currently disabled`,
  );
}

function ensureFeatureEnabled(): void {
  if (isPresentationFeatureEnabled()) {
    return;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: presentation editor is currently disabled`,
  );
}

function ensureExportWriteEnabled(): void {
  if (isPresentationExportWriteEnabled()) {
    return;
  }

  throw new PresentationServiceError(
    PRESENTATION_ERROR_CODE.FEATURE_DISABLED,
    `${PRESENTATION_ERROR_CODE.FEATURE_DISABLED}: presentation export writes are currently disabled`,
  );
}

function resolvePresentationTenantId(
  ctx: { tenantId: unknown; user: { currentTenantId?: unknown } },
): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required for presentation operations",
    });
  }

  return tenantId;
}

function mapPresentationServiceError(error: PresentationServiceError): TRPCError {
  if (error.code === PRESENTATION_ERROR_CODE.VERSION_CONFLICT) {
    return new TRPCError({
      code: "CONFLICT",
      message: error.message,
      cause: error.details?.conflict,
    });
  }

  if (error.code === PRESENTATION_ERROR_CODE.NOT_FOUND) {
    return new TRPCError({ code: "NOT_FOUND", message: error.message });
  }

  if (
    error.code === PRESENTATION_ERROR_CODE.PERMISSION_DENIED
    || error.code === PRESENTATION_ERROR_CODE.LIFECYCLE_RESTRICTED
    || error.code === PRESENTATION_ERROR_CODE.FEATURE_DISABLED
  ) {
    return new TRPCError({ code: "FORBIDDEN", message: error.message });
  }

  if (error.code === PRESENTATION_ERROR_CODE.CONVERSION_IN_PROGRESS) {
    return new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
  }

  if (error.code === PRESENTATION_ERROR_CODE.EXPORT_THROTTLED) {
    return new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message, cause: error.details });
  }

  if (error.code === PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS) {
    return new TRPCError({ code: "PRECONDITION_FAILED", message: error.message });
  }

  if (
    error.code === PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED
    || error.code === PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE
  ) {
    return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  }

  return new TRPCError({ code: "BAD_REQUEST", message: error.message });
}

function toPresentationActor(ctx: {
  tenantId: unknown;
  user: { id: number; role?: string | null; currentTenantId?: unknown };
}) {
  return {
    userId: ctx.user.id,
    tenantId: resolvePresentationTenantId(ctx),
    role: ctx.user.role,
  };
}

function createPresentationToken(userId: number, scopes: string[]): string {
  return signBearerToken(
    {
      sub: String(userId),
      type: "access",
      scopes,
      jti: `presentation_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
    },
    "15m",
  );
}

function getPresentationToken(
  ctx: {
    req?: { headers?: { authorization?: string | string[] } };
    userToken: string | null;
    user: { id: number };
  },
  scopes: string[],
): string {
  const authHeader = ctx.req?.headers?.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return createPresentationToken(ctx.user.id, scopes);
}

const deckIdSchema = z.object({
  deckId: z.number().int().positive(),
});

export const presentationRouter = router({
  availability: protectedProcedure.query(() => {
    return presentationAvailabilitySchema.parse(getAvailability());
  }),

  getMediaTask: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      taskId: z.string().min(1),
      mediaType: z.enum(["image", "video"]),
      slotId: z.string().max(160).optional(),
    }))
    .query(async ({ input, ctx }) => {
      ensureFeatureEnabled();
      ensureAIGenerationEnabled();
      const actor = toPresentationActor(ctx);
      await getPresentationDeckDetail(input.deckId, actor);
      const task = await getUnifiedMediaTask({
        taskId: input.taskId,
        userId: actor.userId,
        userToken: getPresentationToken(ctx, ["media:generate"]),
        tenantId: actor.tenantId,
        auditContext: {
          userId: actor.userId,
          source: "trpc.presentation.getMediaTask",
          stage: "poll",
          deckId: input.deckId,
        },
      });
      if (task.status !== "completed") return task;
      const durable = await ensurePresentationTaskResultDurable({
        tenantId: actor.tenantId,
        userId: actor.userId,
        deckId: input.deckId,
        task,
        mediaType: input.mediaType,
        slotId: input.slotId,
      });
      if (!durable) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "งานสร้างสื่อเสร็จแล้วแต่ไม่พบไฟล์สำหรับจัดเก็บบน R2",
        });
      }
      return durable.task;
    }),

  ai: router({
    generateDraft: protectedProcedure
      .use(createRateLimitMiddleware({ namespace: "ai-draft-gen", limit: 5, windowMs: 60_000 }))
      .input(GenerateAIDraftInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();

          const actor = toPresentationActor(ctx);
          const userToken = getPresentationToken(ctx, ["media:generate"]);

          const redis = getRedisClient();
          const taskId = crypto.randomUUID();
          const lockKey = `ai_draft_lock:${actor.userId}`;

          // Acquire per-user lock
          const lockResult = await redis.set(
            lockKey,
            taskId,
            "EX",
            300,
            "NX",
          );
          if (lockResult === null) {
            const existingTaskId = await redis.get(lockKey);
            if (existingTaskId) {
              return { taskId: existingTaskId, alreadyInProgress: true };
            }
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: "AI draft already in progress for this user",
            });
          }

          // Initialize progress in Redis
          const initialProgress = {
            userId: actor.userId,
            phase: 0,
            phaseLabel: "Starting...",
            slidesCompleted: 0,
            totalSlides: input.numSlides,
            slidePreview: [],
            completed: false,
            updatedAt: new Date().toISOString(),
          };
          await redis.set(
            `ai_draft_progress:${taskId}`,
            JSON.stringify(initialProgress),
            "EX",
            300,
          );

          // Fire-and-forget pipeline
          generateAIDraft(input, actor, userToken, taskId).catch(
            async (err) => {
              try {
                const errMsg = err instanceof Error ? err.message : "Unknown error";
                const safeMsg = errMsg.replace(/https?:\/\/[^\s]+/g, "[redacted]").slice(0, 200);
                await redis.set(
                  `ai_draft_progress:${taskId}`,
                  JSON.stringify({
                    ...initialProgress,
                    completed: true,
                    error: {
                      code: "AI_GENERATION_FAILED",
                      message: safeMsg,
                    },
                  }),
                  "EX",
                  300,
                );
                const owner = await redis.get(lockKey);
                if (owner === taskId) {
                  await redis.del(lockKey);
                }
              } catch {
                // best-effort cleanup
              }
            },
          );

          return { taskId, alreadyInProgress: false };
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          throw err;
        }
      }),

    resolvePendingMedia: protectedProcedure
      .input(z.object({
        deckId: z.number().int().positive(),
        maxJobs: z.number().int().positive().max(200).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();
          const actor = toPresentationActor(ctx);
          const userToken = getPresentationToken(ctx, ["media:generate"]);
          return await resolvePendingMediaForDeck(
            {
              deckId: input.deckId,
              maxJobs: input.maxJobs,
            },
            actor,
            userToken,
          );
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          throw err;
        }
      }),

    relayoutSlide: protectedProcedure
      .input(z.object({
        deckId: z.number().int().positive(),
        slideId: z.number().int().positive(),
        expectedVersion: z.number().int().nonnegative(),
        stylePresetId: z.enum(AI_STYLE_PRESET_IDS).optional(),
        templateId: z.enum(AI_LAYOUT_TEMPLATE_IDS).optional(),
        componentRecipeId: z.enum(BUILT_IN_PRESENTATION_COMPONENT_IDS).optional(),
        includeSvg: z.boolean().optional(),
        includeGeometricCrop: z.boolean().optional(),
        geometricCropShape: z.enum(AI_GEOMETRIC_CROP_SHAPES).optional(),
        includeGeometricAccents: z.boolean().optional(),
        geometricAccentShape: z.enum(AI_GEOMETRIC_ACCENT_SHAPES).optional(),
        watermark: AIWatermarkSchema.optional(),
        supplementalMediaClarityPercent: z.number().int().min(5).max(100).optional(),
        layoutSeed: z.number().int().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          const actor = toPresentationActor(ctx);
          const detail = await getPresentationDeckDetail(input.deckId, actor);
          const slide = detail.slides.find((item) => item.id === input.slideId);
          if (!slide) {
            throw new PresentationServiceError(
              PRESENTATION_ERROR_CODE.NOT_FOUND,
              `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found`,
            );
          }
          const parsed = presentationSlideContentSchema.safeParse(slide.slideContent);
          if (!parsed.success) {
            throw new PresentationServiceError(
              PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
              `${PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE}: existing slide content is invalid`,
            );
          }
          const orderedSlides = [...detail.slides].sort((a, b) => a.orderIndex - b.orderIndex);
          const slideIndex = Math.max(1, orderedSlides.findIndex((item) => item.id === slide.id) + 1);
          const relayout = await relayoutExistingSlideAsync({
            slideTitle: slide.title,
            slideContent: parsed.data,
            slideNotes: slide.notes,
            userToken: ctx.userToken ?? undefined,
            deckTitle: detail.deck.title ?? undefined,
            slideIndex,
            totalSlides: Math.max(1, orderedSlides.length),
            stylePresetId: input.stylePresetId,
            templateId: input.templateId,
            preferredComponentRecipeId: input.componentRecipeId,
            includeSvg: input.includeSvg,
            includeGeometricCrop: input.includeGeometricCrop,
            geometricCropShape: input.geometricCropShape,
            includeGeometricAccents: input.includeGeometricAccents,
            geometricAccentShape: input.geometricAccentShape,
            watermark: input.watermark,
            supplementalMediaClarityPercent: input.supplementalMediaClarityPercent,
            layoutSeed: input.layoutSeed,
          }, actor);

          const updatedSlide = await updateSlideInDeck(
            {
              deckId: input.deckId,
              slideId: input.slideId,
              expectedVersion: input.expectedVersion,
              saveMode: "manual",
              title: slide.title,
              notes: slide.notes,
              slideContent: relayout.slideContent,
            },
            actor,
          );

          return {
            slide: updatedSlide,
            warnings: relayout.warnings,
            applied: relayout.applied,
          };
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          throw err;
        }
      }),

    repairSlideFromNote: protectedProcedure
      .input(z.object({
        deckId: z.number().int().positive(),
        slideId: z.number().int().positive(),
        expectedVersion: z.number().int().nonnegative(),
        stylePresetId: z.enum(AI_STYLE_PRESET_IDS).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();
          const actor = toPresentationActor(ctx);
          const userToken = getPresentationToken(ctx, ["media:generate"]);
          const detail = await getPresentationDeckDetail(input.deckId, actor);
          const slide = detail.slides.find((item) => item.id === input.slideId);
          if (!slide) {
            throw new PresentationServiceError(
              PRESENTATION_ERROR_CODE.NOT_FOUND,
              `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found`,
            );
          }
          const parsed = presentationSlideContentSchema.safeParse(slide.slideContent);
          if (!parsed.success) {
            throw new PresentationServiceError(
              PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
              `${PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE}: existing slide content is invalid`,
            );
          }
          const savedNote = String(slide.notes ?? "").trim();
          if (!savedNote) {
            throw new PresentationServiceError(
              PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
              `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: save a slide note before repairing this slide`,
            );
          }
          const orderedSlides = [...detail.slides].sort((a, b) => a.orderIndex - b.orderIndex);
          const slideIndex = Math.max(1, orderedSlides.findIndex((item) => item.id === slide.id) + 1);
          const repaired = await repairSlideFromSavedNote(
            {
              deckId: input.deckId,
              slideTitle: slide.title,
              slideContent: parsed.data,
              slideNotes: savedNote,
              deckTitle: detail.deck.title ?? undefined,
              slideIndex,
              totalSlides: Math.max(1, orderedSlides.length),
              stylePresetId: input.stylePresetId,
            },
            actor,
            userToken,
          );
          const updatedSlide = await updateSlideInDeck(
            {
              deckId: input.deckId,
              slideId: input.slideId,
              expectedVersion: input.expectedVersion,
              saveMode: "manual",
              title: repaired.title,
              notes: slide.notes,
              slideContent: repaired.slideContent,
            },
            actor,
          );

          return {
            slide: updatedSlide,
            warnings: repaired.warnings,
            applied: repaired.applied,
          };
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          throw err;
        }
      }),

    generateLayoutFromNote: protectedProcedure
      .use(createRateLimitMiddleware({ namespace: "ai-layout-note", limit: 10, windowMs: 60_000 }))
      .input(GenerateLayoutFromNoteInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();
          const actor = toPresentationActor(ctx);
          const userToken = getPresentationToken(ctx, ["media:generate"]);
          const result = await generateLayoutFromNoteAsync(
            {
              deckId: input.deckId,
              slideId: input.slideId,
              expectedVersion: input.expectedVersion,
              stylePresetId: input.stylePresetId,
              componentRecipeId: input.componentRecipeId,
            },
            actor,
            userToken,
          );
          // Re-fetch latest slide version after LLM + image gen (may take 30-60s)
          const freshDetail = await getPresentationDeckDetail(input.deckId, actor);
          const freshSlide = freshDetail.slides.find((s) => s.id === input.slideId);
          const latestSlideVersion = freshSlide?.version ?? input.expectedVersion;
          const updatedSlide = await updateSlideInDeck(
            {
              deckId: input.deckId,
              slideId: input.slideId,
              expectedVersion: latestSlideVersion,
              saveMode: "manual",
              title: result.title,
              slideContent: result.slideContent,
            },
            actor,
          );
          return {
            slide: updatedSlide,
            warnings: result.warnings,
            applied: result.applied,
          };
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          throw err;
        }
      }),

    generateLayoutFromDeckNote: protectedProcedure
      .use(createRateLimitMiddleware({ namespace: "ai-layout-deck", limit: 3, windowMs: 60_000 }))
      .input(GenerateLayoutFromDeckNoteInputSchema)
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();
          const actor = toPresentationActor(ctx);
          const userToken = getPresentationToken(ctx, ["media:generate"]);

          // Verify deck exists and has notes
          const detail = await getPresentationDeckDetail(input.deckId, actor);
          const deckNotes = String(detail.deck.notes ?? "").trim();
          if (!deckNotes) {
            throw new PresentationServiceError(
              PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
              `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: deck notes are empty — add notes before generating layout`,
            );
          }

          const taskId = `layout-deck-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

          // Fire-and-forget pipeline
          generateLayoutFromDeckNoteAsync(
            {
              deckId: input.deckId,
              expectedVersion: input.expectedVersion,
              numSlides: input.numSlides,
              stylePresetId: input.stylePresetId,
            },
            actor,
            userToken,
            taskId,
          ).catch(async (err) => {
            try {
              const errMsg = err instanceof Error ? err.message : "Unknown error";
              const redis = getRedisClient();
              await redis.set(
                `ai_draft_progress:${taskId}`,
                JSON.stringify({
                  phase: 0,
                  phaseLabel: "Error",
                  slidesCompleted: 0,
                  totalSlides: 0,
                  slidePreview: [],
                  completed: true,
                  userId: actor.userId,
                  error: { code: "INTERNAL_ERROR", message: errMsg.slice(0, 500) },
                }),
                "EX",
                3600,
              );
            } catch { /* ignore */ }
          });

          return { taskId };
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          throw err;
        }
      }),

    generateArticle: protectedProcedure
      .use(createRateLimitMiddleware({ namespace: "presentation-article-gen", limit: 6, windowMs: 60_000 }))
      .input(z.object({
        deckId: z.number().int().positive(),
        topic: z.string().trim().min(3).max(2_000),
        preferredLanguage: z.enum(["th", "en"]).optional(),
        executionSource: z.enum(["skill", "agency"]).default("skill"),
        skillId: z.string().trim().max(255).optional().nullable(),
        agencyId: z.string().trim().max(255).optional().nullable(),
        requiresWebSearch: z.boolean().default(false),
        requiresThinking: z.boolean().default(false),
        targetImageCount: z.number().int().min(5).max(20).default(8),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();

          const actor = toPresentationActor(ctx);
          await getPresentationDeckDetail(input.deckId, actor);

          return await generatePresentationArticle({
            tenantId: actor.tenantId,
            userId: actor.userId,
            topic: input.topic,
            preferredLanguage: input.preferredLanguage,
            executionSource: input.executionSource,
            skillId: input.skillId,
            agencyId: input.agencyId,
            requiresWebSearch: input.requiresWebSearch,
            requiresThinking: input.requiresThinking,
            targetImageCount: input.targetImageCount,
          });
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          if (err instanceof TRPCError) {
            throw err;
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Failed to generate article",
          });
        }
      }),

    prepareSlideBundle: protectedProcedure
      .use(createRateLimitMiddleware({ namespace: "presentation-slide-bundle", limit: 6, windowMs: 60_000 }))
      .input(z.object({
        deckId: z.number().int().positive(),
        topic: z.string().trim().min(3).max(2_000),
        article: z.string().trim().min(20).max(25_000),
        preferredLanguage: z.enum(["th", "en"]).optional(),
        slideSkillId: z.string().trim().min(1).max(255),
        requiresThinking: z.boolean().default(false),
        targetImageCount: z.number().int().min(5).max(20).default(8),
        canvasRatio: z.enum(PRESENTATION_SLIDE_CANVAS_RATIOS).default("16:9"),
        outputFormats: z.array(z.enum(PRESENTATION_SLIDE_OUTPUT_FORMATS)).min(1).max(4).default(["json"]),
        imagePromptContext: z.string().trim().max(1_500).optional().nullable(),
        editorialPlannerOptions: presentationEditorialPlannerOptionsSchema,
        existingImageAssets: z.array(z.object({
          id: z.string().trim().min(1).max(128),
          pageNumber: z.number().int().min(1).max(20),
          imageIndex: z.number().int().min(1).max(3),
          placementRole: z.enum(["hero", "supporting", "detail"]),
          shortLabel: z.string().trim().min(1).max(255),
          prompt: z.string().trim().min(1).max(4_000),
          url: z.string().trim().url(),
        })).max(60).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();

          const actor = toPresentationActor(ctx);
          await getPresentationDeckDetail(input.deckId, actor);

          return await preparePresentationSlideBundle({
            userId: actor.userId,
            topic: input.topic,
            article: input.article,
            slideSkillId: input.slideSkillId,
            preferredLanguage: input.preferredLanguage,
            requiresThinking: input.requiresThinking,
            targetImageCount: input.targetImageCount,
            canvasRatio: input.canvasRatio,
            outputFormats: input.outputFormats,
            imagePromptContext: input.imagePromptContext ?? undefined,
            editorialPlannerOptions: input.editorialPlannerOptions ? {
              ...input.editorialPlannerOptions,
              imageAssets: input.editorialPlannerOptions.imageAssets?.map((asset) => ({
                asset_type: asset.assetType,
                label: asset.label,
                page_hint: asset.pageHint,
                prompt: asset.prompt ?? undefined,
                reference: asset.reference ?? undefined,
              })),
            } : undefined,
            existingImageAssets: input.existingImageAssets,
          });
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          if (err instanceof TRPCError) {
            throw err;
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Failed to prepare slide bundle",
          });
        }
      }),

    generateSlideDraft: protectedProcedure
      .use(createRateLimitMiddleware({ namespace: "presentation-slide-draft", limit: 4, windowMs: 60_000 }))
      .input(z.object({
        deckId: z.number().int().positive(),
        topic: z.string().trim().min(3).max(2_000),
        article: z.string().trim().min(20).max(25_000),
        preferredLanguage: z.enum(["th", "en"]).optional(),
        slideSkillId: z.string().trim().min(1).max(255),
        requiresThinking: z.boolean().default(false),
        targetImageCount: z.number().int().min(5).max(20).default(8),
        canvasRatio: z.enum(PRESENTATION_SLIDE_CANVAS_RATIOS).default("16:9"),
        outputFormats: z.array(z.enum(PRESENTATION_SLIDE_OUTPUT_FORMATS)).min(1).max(4).default(["json"]),
        maxPages: z.number().int().min(1).max(20),
        imagePromptContext: z.string().trim().max(1_500).optional().nullable(),
        editorialPlannerOptions: presentationEditorialPlannerOptionsSchema,
        slidePayloadOverrideJson: z.string().trim().max(120_000).optional().nullable(),
        pageImagePlanOverrides: z.array(z.object({
          pageNumber: z.number().int().min(1).max(20),
          maxImagesOverride: z.number().int().min(0).max(3),
        })).max(60).optional(),
        imageAssets: z.array(z.object({
          id: z.string().trim().min(1).max(128),
          pageNumber: z.number().int().min(1).max(20),
          imageIndex: z.number().int().min(1).max(3),
          placementRole: z.enum(["hero", "supporting", "detail"]),
          shortLabel: z.string().trim().min(1).max(255),
          prompt: z.string().trim().min(1).max(4_000),
          url: z.string().trim().url(),
        })).max(60).default([]),
      }))
      .mutation(async ({ input, ctx }) => {
        try {
          ensureFeatureEnabled();
          ensureAIGenerationEnabled();

          const actor = toPresentationActor(ctx);
          await getPresentationDeckDetail(input.deckId, actor);

          return await generatePresentationSlideDraft({
            userId: actor.userId,
            tenantId: actor.tenantId,
            topic: input.topic,
            article: input.article,
            slideSkillId: input.slideSkillId,
            preferredLanguage: input.preferredLanguage,
            requiresThinking: input.requiresThinking,
            targetImageCount: input.targetImageCount,
            canvasRatio: input.canvasRatio,
            outputFormats: input.outputFormats,
            maxPages: input.maxPages,
            imagePromptContext: input.imagePromptContext ?? undefined,
            editorialPlannerOptions: input.editorialPlannerOptions ? {
              ...input.editorialPlannerOptions,
              imageAssets: input.editorialPlannerOptions.imageAssets?.map((asset) => ({
                asset_type: asset.assetType,
                label: asset.label,
                page_hint: asset.pageHint,
                prompt: asset.prompt ?? undefined,
                reference: asset.reference ?? undefined,
              })),
            } : undefined,
            pageImagePlanOverrides: input.pageImagePlanOverrides,
            slidePayloadOverrideJson: input.slidePayloadOverrideJson ?? undefined,
            imageAssets: input.imageAssets,
          });
        } catch (err) {
          if (err instanceof PresentationServiceError) {
            throw mapPresentationServiceError(err);
          }
          if (err instanceof TRPCError) {
            throw err;
          }
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: err instanceof Error ? err.message : "Failed to generate slide JSON",
          });
        }
      }),

    getDraftProgress: protectedProcedure
      .input(z.object({ taskId: z.string().min(1).max(128) }))
      .query(async ({ input, ctx }): Promise<DraftProgressStatus> => {
        const redis = getRedisClient();
        const progressKey = `ai_draft_progress:${input.taskId}`;
        const lockKey = `ai_draft_lock:${ctx.user.id}`;
        const notFoundResponse: DraftProgressStatus = {
          phase: 0,
          phaseLabel: "Unknown",
          slidesCompleted: 0,
          totalSlides: 0,
          slidePreview: [] as Array<{ title: string; imageStatus: string }>,
          completed: false,
          workerActive: false,
          error: { code: "not_found", message: "Draft progress not found" },
        };

        const raw = await redis.get(progressKey);
        if (!raw) {
          return notFoundResponse;
        }

        let parsed: StoredDraftProgress;
        try {
          const result = JSON.parse(raw);
          if (typeof result !== "object" || result === null) {
            return notFoundResponse;
          }
          parsed = result as StoredDraftProgress;
        } catch {
          return notFoundResponse;
        }

        // IDOR check — don't reveal existence of other users' tasks
        if (parsed.userId && parsed.userId !== ctx.user.id) {
          return notFoundResponse;
        }

        const lockOwner = await redis.get(lockKey);
        const initialWorkerActive = lockOwner === input.taskId;
        const lockTtlSeconds = initialWorkerActive
          ? await redis.ttl(lockKey).catch(() => null)
          : null;
        const stalledResolution = finalizeStalledDraftProgress({
          progress: parsed,
          taskId: input.taskId,
          workerActive: initialWorkerActive,
          lockTtlSeconds,
        });
        if (stalledResolution.shouldPersist) {
          parsed = stalledResolution.progress;
          await redis.set(progressKey, JSON.stringify(parsed), "EX", 3600);
          if (stalledResolution.shouldReleaseLock && lockOwner === input.taskId) {
            await redis.del(lockKey).catch(() => {});
          }
        }

        return {
          phase: typeof parsed.phase === "number" ? parsed.phase : 0,
          phaseLabel: typeof parsed.phaseLabel === "string" ? parsed.phaseLabel : "Unknown",
          phaseDetail: typeof parsed.phaseDetail === "string" ? parsed.phaseDetail : undefined,
          slidesCompleted: typeof parsed.slidesCompleted === "number" ? parsed.slidesCompleted : 0,
          totalSlides: typeof parsed.totalSlides === "number" ? parsed.totalSlides : 0,
          slidePreview: Array.isArray(parsed.slidePreview) ? parsed.slidePreview : [],
          completed: typeof parsed.completed === "boolean" ? parsed.completed : false,
          updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
          workerActive: stalledResolution.workerActive,
          diagnostics: parsed.diagnostics && typeof parsed.diagnostics === "object" ? parsed.diagnostics as DraftProgressStatus["diagnostics"] : undefined,
          cancelled: typeof parsed.cancelled === "boolean" ? parsed.cancelled : undefined,
          error: parsed.error && typeof parsed.error === "object" ? parsed.error as { code: string; message: string } : undefined,
          result: parsed.result && typeof parsed.result === "object" ? parsed.result as { slidesAdded: number; newDeckVersion: number; articlePreview: string; warnings: string[] } : undefined,
        };
      }),

    cancelDraft: protectedProcedure
      .input(z.object({ taskId: z.string().min(1).max(128) }))
      .mutation(async ({ input, ctx }) => {
        const redis = getRedisClient();
        const raw = await redis.get(`ai_draft_progress:${input.taskId}`);
        if (!raw) {
          return { success: false };
        }

        let progress: Record<string, unknown>;
        try {
          const result = JSON.parse(raw);
          if (typeof result !== "object" || result === null) {
            return { success: false };
          }
          progress = result as Record<string, unknown>;
        } catch {
          return { success: false };
        }

        if (progress.completed) {
          return { success: false };
        }
        if (progress.userId !== ctx.user.id) {
          return { success: false };
        }
        await redis.set(`ai_draft_cancel:${input.taskId}`, "1", "EX", 300);
        return { success: true };
      }),

    // ── Auto Draft: resolve parameters from topic ──────────
    resolveAutoDraft: protectedProcedure
      .input(z.object({
        topic: z.string().min(3).max(1000),
      }))
      .mutation(async ({ input, ctx }) => {
        ensureFeatureEnabled();
        ensureAIGenerationEnabled();
        const resolution = await resolveAutoDraftParams(input.topic, {
          userId: ctx.user.id,
          tenantId: resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? undefined,
        });
        return resolution;
      }),

    // ── Auto Draft: headless generation (topic → deck link) ──
    autoGenerateDraft: protectedProcedure
      .use(createRateLimitMiddleware({ namespace: "auto-draft-gen", limit: 3, windowMs: 60_000 }))
      .input(z.object({
        topic: z.string().min(3).max(1000),
        numSlides: z.number().int().min(1).max(30).default(5),
        /** Optional overrides — if not provided, auto-resolved */
        draftSkillId: z.string().optional(),
        stylePresetId: z.enum(AI_STYLE_PRESET_IDS).optional(),
        imageModel: z.string().optional(),
        imageSkillId: z.string().optional(),
        // "auto" = detect from content; "en"/"th" = force slide text language.
        // This is a presentation-content language, NOT an i18n UI locale (see SUPPORTED_LANGUAGES).
        language: z.enum(["auto", "en", "th"] as const).optional(),
        canvasWidth: z.number().int().min(64).max(10000).optional(),
        canvasHeight: z.number().int().min(64).max(10000).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        ensureFeatureEnabled();
        ensureAIGenerationEnabled();

        const actor = toPresentationActor(ctx);
        const userToken = getPresentationToken(ctx, ["media:generate"]);
        const traceId = crypto.randomUUID();

        // 1. Auto-resolve all parameters from topic
        const resolution = await resolveAutoDraftParams(input.topic, {
          userId: actor.userId,
          tenantId: actor.tenantId,
          traceId,
        });

        // 2. Create library item + deck
        const libraryItemResult = await createLibraryItem(
          {
            itemType: "presentation",
            source: "auto_draft",
            title: input.topic.slice(0, 200),
          },
          actor,
        );
        const deckResult = await createPresentationDeckForLibraryItem(
          { libraryItemId: libraryItemResult.item.id, title: input.topic.slice(0, 200) },
          actor,
        );
        const deckId = deckResult.deck.id;
        const taskId = traceId;

        // 3. Merge user overrides with auto-resolved params
        const draftSkillId = input.draftSkillId || resolution.draftSkillId;
        const stylePresetId = input.stylePresetId || resolution.stylePresetId;
        const imageModel = input.imageModel || resolution.imageModel;
        const imageSkillId = input.imageSkillId || resolution.imageSkillId;
        const language = input.language || resolution.language;

        // 4. Acquire lock + initialize progress
        const redis = getRedisClient();
        const lockKey = `ai_draft_lock:${actor.userId}`;
        const lockResult = await redis.set(lockKey, taskId, "EX", 300, "NX");
        if (lockResult === null) {
          const existingTaskId = await redis.get(lockKey);
          if (existingTaskId) {
            return {
              taskId: existingTaskId,
              deckId,
              libraryItemId: libraryItemResult.item.id,
              editorUrl: `${PRESENTATION_EDITOR_ROUTE_BASE}/${libraryItemResult.item.id}`,
              alreadyInProgress: true,
              resolution,
            };
          }
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "AI draft already in progress for this user",
          });
        }

        const initialProgress = {
          userId: actor.userId,
          phase: 0,
          phaseLabel: "Starting...",
          slidesCompleted: 0,
          totalSlides: input.numSlides,
          slidePreview: [],
          completed: false,
          updatedAt: new Date().toISOString(),
        };
        await redis.set(`ai_draft_progress:${taskId}`, JSON.stringify(initialProgress), "EX", 300);

        // 5. Fire-and-forget pipeline
        const draftInput: GenerateAIDraftInput = {
          deckId,
          expectedVersion: 0,
          prompt: input.topic,
          numSlides: input.numSlides,
          language,
          textModel: resolution.textModel,
          draftSkillId,
          articleSkillId: draftSkillId,
          imageSkillId,
          imageModel,
          canvasWidth: input.canvasWidth ?? 1280,
          canvasHeight: input.canvasHeight ?? 720,
          stylePresetId,
          useCustomArticle: false,
          hideTextOnSlides: false,
          generateAudio: false,
        };

        generateAIDraft(draftInput, actor, userToken, taskId).catch(
          async (err: unknown) => {
            try {
              const errMsg = err instanceof Error ? err.message : "Unknown error";
              const safeMsg = errMsg.replace(/https?:\/\/[^\s]+/g, "[redacted]").slice(0, 200);
              console.error(`[autoGenerateDraft] taskId=${taskId} userId=${actor.userId} error: ${safeMsg}`);
              await redis.set(
                `ai_draft_progress:${taskId}`,
                JSON.stringify({
                  ...initialProgress,
                  completed: true,
                  error: { code: "AI_GENERATION_FAILED", message: safeMsg },
                }),
                "EX",
                300,
              );
              const owner = await redis.get(lockKey);
              if (owner === taskId) await redis.del(lockKey);
            } catch {
              // best-effort cleanup
            }
          },
        );

        return {
          taskId,
          deckId,
          libraryItemId: libraryItemResult.item.id,
          editorUrl: `${PRESENTATION_EDITOR_ROUTE_BASE}/${libraryItemResult.item.id}`,
          alreadyInProgress: false,
          resolution,
        };
      }),
  }),

  getDeck: protectedProcedure
    .input(deckIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await getPresentationDeckDetail(input.deckId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listCustomBlocks: protectedProcedure
    .input(presentationCustomBlockListInputSchema.optional())
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listPresentationCustomBlocks(
          input ?? { scope: "all", sort: "featured", limit: 100 },
          toPresentationActor(ctx),
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listCustomBlockGovernanceAudit: adminProcedure
    .input(presentationCustomBlockGovernanceAuditInputSchema.optional())
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listPresentationCustomBlockGovernanceAudit(
          input ?? { eventType: "all", limit: 100 },
          toPresentationActor(ctx),
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  saveCustomBlock: protectedProcedure
    .input(presentationCustomBlockCreateInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await savePresentationCustomBlock(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  renderCustomBlockPreview: protectedProcedure
    .input(presentationCustomBlockRenderPreviewInputSchema)
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await renderPresentationCustomBlockPreview(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  deleteCustomBlock: protectedProcedure
    .input(presentationCustomBlockDeleteInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await deletePresentationCustomBlock(input.blockId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  updateCustomBlock: protectedProcedure
    .input(presentationCustomBlockUpdateInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updatePresentationCustomBlock(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  trackCustomBlockUse: protectedProcedure
    .input(presentationCustomBlockTrackUseInputSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await trackPresentationCustomBlockUse(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getDeckByLibraryItem: protectedProcedure
    .input(z.object({
      libraryItemId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const deck = await getPresentationDeckByLibraryItem(input.libraryItemId, toPresentationActor(ctx));
        if (!deck) {
          throw new PresentationServiceError(
            PRESENTATION_ERROR_CODE.NOT_FOUND,
            `${PRESENTATION_ERROR_CODE.NOT_FOUND}: no presentation deck exists for library item ${input.libraryItemId}`,
          );
        }
        return deck;
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  compatibilityOpen: protectedProcedure
    .input(z.object({
      itemId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await getPresentationCompatibilityOpen(input.itemId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  convertSource: protectedProcedure
    .input(z.object({
      sourceItemId: z.number().int().positive(),
      idempotencyKey: z.string().min(1).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await convertOfficeSourceToPresentation(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getSlideshow: protectedProcedure
    .input(deckIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const detail = await getPresentationDeckDetail(input.deckId, toPresentationActor(ctx));
        return buildSlideshowPayload(detail.slides, { deckId: detail.deck.id });
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  triggerExport: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      format: z.enum(["png", "jpg", "pdf", "mp4"]),
      quality: z.enum(["draft", "standard", "high"]).optional().default("standard"),
      idempotencyKey: z.string().min(1).max(128),
      width: z.number().int().positive().max(PRESENTATION_EXPORT_MAX_WIDTH).optional(),
      height: z.number().int().positive().max(PRESENTATION_EXPORT_MAX_HEIGHT).optional(),
    }).refine(
      (data) => (data.width === undefined) === (data.height === undefined),
      {
        message: "width and height must be provided together",
        path: ["width"],
      },
    ))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        ensureExportWriteEnabled();
        const userToken = getPresentationToken(ctx, ["presentation:export"]);
        return await triggerPresentationExport(input, toPresentationActor(ctx), {
          userToken,
        });
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getExportStatus: protectedProcedure
    .input(z.object({
      exportId: z.number().int().positive(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const userToken = getPresentationToken(ctx, ["presentation:export"]);
        return await getPresentationExportStatus(
          input.exportId,
          toPresentationActor(ctx),
          userToken,
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  cancelExport: protectedProcedure
    .input(z.object({ exportId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const actor = toPresentationActor(ctx);
        const userToken = getPresentationToken(ctx, ["presentation:export"]);
        return await cancelPresentationExport(input.exportId, actor, userToken);
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listExports: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      limit: z.number().int().min(1).max(20).default(10),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const actor = toPresentationActor(ctx);
        const db = await getDb();
        if (!db) return [];
        const exports = await getExportsByDeckId(input.deckId, actor.tenantId, actor.userId, input.limit, db);
        return exports.map((r) => ({
          exportId: r.id,
          format: r.format,
          status: r.status,
          downloadUrl: r.outputUrl ?? null,
          createdAt: r.createdAt,
          progressPct: r.progressPct,
          errorMessage: r.errorMessage ?? null,
        }));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  createDeck: protectedProcedure
    .input(z.object({
      libraryItemId: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await createPresentationDeckForLibraryItem(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  saveAsTemplate: protectedProcedure
    .input(z.object({
      sourceLibraryItemId: z.number().int().positive(),
      templateTitle: z.string().min(1).max(255).optional(),
      templateDescription: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await createTemplateFromPresentation(
          {
            sourceLibraryItemId: input.sourceLibraryItemId,
            templateTitle: input.templateTitle,
            templateDescription: input.templateDescription,
          },
          toPresentationActor(ctx),
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  useTemplate: protectedProcedure
    .input(z.object({
      templateLibraryItemId: z.number().int().positive(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await createPresentationFromTemplate(
          {
            templateLibraryItemId: input.templateLibraryItemId,
            title: input.title,
            description: input.description,
          },
          toPresentationActor(ctx),
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  updateDeck: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      title: z.string().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
      notes: z.string().max(20_000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updatePresentationDeckMetadata(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  deleteDeck: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await deletePresentationDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listSlides: protectedProcedure
    .input(deckIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listSlidesForDeck(input.deckId, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  addSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      title: z.string().min(1).max(255).optional(),
      slideContent: presentationSlideContentSchema.optional(),
      notes: z.string().max(5_000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await addSlideToDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  duplicateSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      slideId: z.number().int().positive(),
      targetIndex: z.number().int().min(0).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await duplicateSlideInDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  updateSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      saveMode: z.enum(["manual", "autosave"]).optional(),
      title: z.string().min(1).max(255).optional(),
      slideContent: presentationSlideContentSchema.optional(),
      notes: z.string().max(5_000).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updateSlideInDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listVersions: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listPresentationVersionHistory(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  restoreVersion: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      versionId: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await restorePresentationVersion(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  deleteSlide: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await deleteSlideFromDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  reorderSlides: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      movedSlideId: z.number().int().positive(),
      targetIndex: z.number().int().min(0),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await reorderSlidesInDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  listAssets: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive().nullable().optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await listAssetsForDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  attachAsset: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      slideId: z.number().int().positive().nullable().optional(),
      libraryItemId: z.number().int().positive(),
      byteSize: z.number().int().min(0),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await attachAssetToDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  uploadAndAttachAsset: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      slideId: z.number().int().positive().nullable().optional(),
      fileName: z.string().min(1).max(255),
      fileType: z.string().min(1).max(255),
      fileBase64: z.string().min(1).max(MAX_PRESENTATION_UPLOAD_BASE64_LENGTH),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await uploadAssetToDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes("insufficient credits")) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: error.message,
          });
        }
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  detachAsset: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      linkId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await detachAssetFromDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  applyTemplate: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      templateAssetLibraryItemId: z.number().int().positive(),
      slideId: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await applyTemplateAssetToDeck(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  setSlideAudio: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      audioTrack: audioTrackInputSchema.nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updateSlideAudioTrack(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  generateSlideAudioFromNote: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      slideId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      model: z.string().min(1).optional(),
      voice: z.string().min(1).optional(),
      apiConfig: z.record(z.string()).optional(),
      extraParams: z.record(z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const userToken = getPresentationToken(ctx, ["media:generate"]);
        return await generateSlideAudioFromSavedNote(
          {
            ...input,
            userToken,
            publicUrl: ctx.publicUrl ?? undefined,
          },
          toPresentationActor(ctx),
        );
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  setDeckAudio: protectedProcedure
    .input(z.object({
      deckId: z.number().int().positive(),
      expectedVersion: z.number().int().nonnegative(),
      projectAudioTrack: projectAudioTrackInputSchema.nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        return await updateDeckProjectAudioTrack(input, toPresentationActor(ctx));
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  getPlayDeck: protectedProcedure
    .input(z.object({ itemId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      try {
        ensureFeatureEnabled();
        const actor = toPresentationActor(ctx);
        const deck = await getPresentationDeckByLibraryItem(input.itemId, actor);
        if (!deck) {
          throw new PresentationServiceError(
            PRESENTATION_ERROR_CODE.NOT_FOUND,
            `${PRESENTATION_ERROR_CODE.NOT_FOUND}: no presentation deck for library item ${input.itemId}`,
          );
        }
        const slideshowPayload = buildSlideshowPayload(deck.slides, { deckId: deck.deck.id });
        return await buildPlayDeckPayload(deck, slideshowPayload);
      } catch (error) {
        if (error instanceof PresentationServiceError) {
          throw mapPresentationServiceError(error);
        }
        throw error;
      }
    }),

  guardEditorOpen: protectedProcedure
    .input(presentationRouteGuardInputSchema)
    .query(({ input }): PresentationRouteGuardResult => {
      const availability = getAvailability();
      if (!availability.enabled) {
        return presentationRouteGuardResultSchema.parse(
          buildFeatureDisabledGuard(input.itemId, input.itemType),
        );
      }

      if (!isPresentationItemType(input.itemType)) {
        return presentationRouteGuardResultSchema.parse(
          buildWrongTypeGuard(input.itemId, input.itemType),
        );
      }

      return presentationRouteGuardResultSchema.parse({
        allowed: true,
        itemId: input.itemId,
        editorRoute: `${PRESENTATION_EDITOR_ROUTE_BASE}/${input.itemId}`,
      });
    }),
});
