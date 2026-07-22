import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AutoReviewCreativePresetSelectionSchema } from "../../shared/hyperframes/autoReviewCreativePresets";
import { MARKETPLACE_START_FRAME_PROMPT_STYLES } from "../../shared/marketplaceCapture/startFramePromptStyle";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { signBearerToken } from "../_core/tokens";
import { issueMarketplaceExtensionToken } from "../services/marketplaceExtensionAuthService";
import {
  getMarketplaceCaptureForUser,
  getMarketplaceCandidateBatchForUser,
  listMarketplaceCandidateBatchesForUser,
  listMarketplaceCapturesForUser,
  saveMarketplaceCaptureDraftEdits,
  discardMarketplaceCapture,
  getMarketplaceCaptureAdminOverview,
} from "../services/marketplaceCaptureService";
import { analyzeMarketplaceCapture } from "../services/marketplaceExtractionService";
import {
  addMarketplaceProductImageFromUrl,
  confirmMarketplaceCapture,
  createManualMarketplaceProduct,
  deleteMarketplaceProduct,
  getMarketplaceProductWithAccess,
  getMarketplaceShareSettings,
  listMarketplaceProductImagesForMediaStudio,
  listMarketplaceProductsWithAccess,
  removeMarketplaceProductImage,
  saveMarketplaceShareSetting,
  searchSimilarMarketplaceProductsByImage,
  setMarketplaceProductHeroImage,
  updateMarketplaceProductDetails,
} from "../services/marketplaceProductService";
import {
  advanceMarketplaceAutoReviewRun,
  cancelMarketplaceAutoReviewRun,
  getMarketplaceAutoReviewRun,
  listMarketplaceAutoReviewRuns,
  queueMarketplaceAutoReviewAdvance,
  regenerateMarketplaceAutoReviewSequentialShot,
  saveMarketplaceAutoReviewSequentialShotOverride,
  selectMarketplaceAutoReviewImageAttemptForStoryboardReview,
  startMarketplaceAutoReviewRun,
} from "../services/marketplaceAutoReviewService";
import {
  applyMarketplaceClaimResolution,
  analyzeMarketplaceProductInsights,
  buildBasicStorytellingHandoffFromCapture,
  enhanceMarketplaceProductDescription,
  generateMarketplaceServerInsight,
  getMarketplaceInsightReadableForUser,
  getMarketplaceInsightForUser,
  listMarketplaceInsightsByCapture,
  listMarketplaceInsightsByProduct,
  syncMarketplaceInsight,
} from "../services/marketplaceInsightService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  analyzeMarketplaceCaptureSchema,
  marketplaceCaptureInsightSyncSchema,
  marketplaceClaimResolutionSchema,
  marketplaceConfirmProductSchema,
  productReferenceCategorySchema,
  marketplaceServerInsightGenerationSchema,
} from "@shared/marketplaceCapture";
import {
  CancelHyperframesRenderJobInputSchema,
  CancelHyperframesRenderJobOutputSchema,
  CreateHyperframesFinalCompositeInputSchema,
  CreateHyperframesFinalCompositeOutputSchema,
  CreateHyperframesPreviewInputSchema,
  CreateHyperframesPreviewOutputSchema,
  GetAutoStoryboardReviewPlanInputSchema,
  GetAutoStoryboardReviewPlanOutputSchema,
  GetVideoSegmentPlanPreviewInputSchema,
  GetVideoSegmentPlanPreviewOutputSchema,
  GetHyperframesRenderJobInputSchema,
  GetHyperframesRenderJobOutputSchema,
  ListHyperframesCreativePresetsInputSchema,
  ListHyperframesCreativePresetsOutputSchema,
  ListHyperframesTemplatesInputSchema,
  ListHyperframesTemplatesOutputSchema,
  RepairHyperframesRenderJobInputSchema,
  RepairHyperframesRenderJobOutputSchema,
  SaveHyperframesRenderToLibraryInputSchema,
  SaveHyperframesRenderToLibraryOutputSchema,
  StartAutoStoryboardReviewInputSchema,
  StartAutoStoryboardReviewOutputSchema,
} from "@shared/hyperframes/runtimeApiSchemas";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesRenderStatusProjectionSchema,
} from "@shared/hyperframes/contracts";
import {
  cancelPreviewMatchCaptureJobInputSchema,
  createPreviewMatchFinalCompositeCaptureInputSchema,
  getPreviewMatchCaptureJobInputSchema,
  previewMatchCaptureJobOutputSchema,
} from "@shared/storyboardPreviewMatchCapture";
import {
  cancelHyperframesRenderJobForApi,
  createHyperframesFinalCompositeForApi,
  createHyperframesPreviewForApi,
  getAutoStoryboardReviewPlanForApi,
  getVideoSegmentPlanPreviewForApi,
  getHyperframesRenderJobForApi,
  listHyperframesCreativePresetsForApi,
  listHyperframesTemplatesForApi,
  repairHyperframesRenderJobForApi,
  saveHyperframesRenderToLibraryForApi,
  startAutoStoryboardReviewForApi,
} from "../services/hyperframesRuntimeApiService";
import {
  cancelPreviewMatchCaptureJobForApi,
  createPreviewMatchFinalCompositeCaptureForApi,
  getPreviewMatchCaptureJobForApi,
} from "../services/storyboardPreviewMatchCaptureService";
import {
  defaultHyperframesOperatorAuditSink,
  cancelHyperframesRenderAsOperator,
  disableHyperframesTemplateWithAuditAsOperator,
  enableHyperframesTemplateWithAuditAsOperator,
  inspectHyperframesRenderAsOperator,
  replayHyperframesDeadLetterByIdAsOperator,
} from "../services/hyperframesOperatorService";
import { readHyperframesFeatureFlagsForTenant } from "../services/hyperframesFeatureAccessService";

const mcpTransportMetadataSchema = z.object({
  transport: z.enum(["gateway_api", "mcp"]),
  connectionId: z.string().max(64).optional(),
  mcpConnectionId: z.string().max(64).optional(),
  sharedGroupId: z.number().int().optional(),
  approvalId: z.string().max(128).optional(),
  mcpApprovalId: z.string().max(128).optional(),
  idempotencyKey: z.string().max(128).optional(),
}).optional().nullable();

function authFromCtx(ctx: any) {
  const userId = Number(ctx.user?.id);
  const tenantId =
    resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) ??
    undefined;
  return { userId, tenantId };
}

const VISUAL_SEARCH_MAX_BYTES = 5 * 1024 * 1024;
const visualSearchMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function hasImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (mimeType === "image/webp") {
    return buffer.slice(0, 4).toString("ascii") === "RIFF" && buffer.slice(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

function decodeVisualSearchImage(input: { imageBase64: string; mimeType: string }): Buffer {
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!visualSearchMimeTypes.has(mimeType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "รองรับเฉพาะรูป PNG, JPEG หรือ WebP" });
  }
  const cleaned = input.imageBase64.replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/i, "").replace(/\s+/g, "");
  if (!cleaned) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่พบข้อมูลรูปภาพ" });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ข้อมูลรูปภาพไม่ใช่ base64 ที่ถูกต้อง" });
  }
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่สามารถอ่านรูปภาพได้" });
  }
  if (buffer.length > VISUAL_SEARCH_MAX_BYTES) {
    throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "รูปภาพต้องมีขนาดไม่เกิน 5MB" });
  }
  if (!hasImageMagicBytes(buffer, mimeType)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ชนิดไฟล์รูปภาพไม่ตรงกับข้อมูลจริง" });
  }
  return buffer;
}

export function decodeVisualSearchImageForTest(input: { imageBase64: string; mimeType: string }): Buffer {
  return decodeVisualSearchImage(input);
}

const editableProductDetailsSchema = z.object({
  productName: z.string().trim().min(1).max(500),
  descriptionText: z.string().max(80_000).optional().nullable(),
  priceCurrent: z.union([z.string().max(64), z.number()]).optional().nullable(),
  commissionRatePercent: z.union([z.string().max(64), z.number()]).optional().nullable(),
  productPageUrl: z.string().trim().max(4096).optional().nullable(),
  soldCountText: z.string().trim().max(128).optional().nullable(),
  capturedCategoryText: z.string().trim().max(300).optional().nullable(),
  shopName: z.string().trim().max(300).optional().nullable(),
  productCategory: productReferenceCategorySchema.optional().nullable(),
  ratingScore: z.union([z.string().max(64), z.number()]).optional().nullable(),
  reviewCountText: z.string().trim().max(128).optional().nullable(),
  affiliateUrl: z.string().trim().max(4096).optional().nullable(),
});

const manualProductSchema = editableProductDetailsSchema.extend({
  platform: z.enum(["shopee", "tiktok_shop"]).default("shopee"),
  sourceUrl: z.string().trim().max(4096).optional().nullable(),
});

const visualProductSearchSchema = z.object({
  imageBase64: z.string().min(1).max(Math.ceil(VISUAL_SEARCH_MAX_BYTES * 1.4)),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  limit: z.number().int().min(1).max(50).optional().default(24),
  ownerOnly: z.boolean().optional().default(false),
  platform: z.enum(["all", "shopee", "tiktok_shop"]).optional().default("all"),
});

async function operatorAuthFromCtx(ctx: any) {
  const auth = authFromCtx(ctx);
  const flags = await readHyperframesFeatureFlagsForTenant(auth);
  return {
    ...auth,
    role: typeof ctx.user?.role === "string" ? ctx.user.role : undefined,
    operatorEnabled: flags.operatorEnabled,
  };
}

const hyperframesDelegatedOperatorRoles = new Set([
  "owner",
  "operator",
  "support",
]);

const hyperframesOperatorProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    const role = typeof ctx.user?.role === "string" ? ctx.user.role : "";
    const adminLike = role === "admin" || role === "system_agent";
    const flags = await readHyperframesFeatureFlagsForTenant(authFromCtx(ctx));
    const delegated =
      flags.operatorEnabled &&
      hyperframesDelegatedOperatorRoles.has(role);

    if (!adminLike && !delegated) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "HyperFrames operator permission required",
      });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }
);

const HyperframesOperatorAuditEventSchema = z
  .object({
    action: z.string().min(1).max(160),
    userId: z.number().int(),
    tenantId: z.string().min(1).max(160),
    renderJobId: z.string().min(1).max(160).nullable().optional(),
    productId: z.string().min(1).max(160).nullable().optional(),
    runId: z.string().min(1).max(160).nullable().optional(),
    templateId: z.string().min(1).max(160).nullable().optional(),
    reason: z.string().max(1200).nullable().optional(),
    redacted: z.literal(true),
  })
  .strict();

const HyperframesOperatorAuditPersistenceSchema = z
  .object({
    persisted: z.boolean(),
    auditLoggerPersisted: z.boolean(),
    dbPersisted: z.boolean(),
    errorMessage: z.string().max(1200).optional(),
    audit: HyperframesOperatorAuditEventSchema,
  })
  .strict();

const HyperframesOperatorInspectOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    render: HyperframesRenderStatusProjectionSchema,
    diagnostics: z.array(z.string().max(1200)).default([]),
    redacted: z.literal(true),
    operatorReplayToken: z.string().min(8).max(160).nullable().optional(),
    auditPersistence: HyperframesOperatorAuditPersistenceSchema,
  })
  .strict();

const HyperframesOperatorCancelOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    render: HyperframesRenderStatusProjectionSchema,
    auditPersistence: HyperframesOperatorAuditPersistenceSchema,
  })
  .strict();

const HyperframesDeadLetterReplayOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    replayable: z.literal(true),
    nextStatus: z.literal("queued"),
    replayGuard: z
      .object({
        compositionInputHashCurrent: z.literal(true),
        replayTokenVerified: z.literal(true),
        templateEnabled: z.literal(true),
        templateApproved: z.literal(true),
        featureAccessReady: z.literal(true).nullable(),
        reasonCaptured: z.literal(true),
      })
      .strict(),
    transition: z.object({ updated: z.boolean() }).strict(),
    audit: HyperframesOperatorAuditEventSchema,
    auditPersistence: HyperframesOperatorAuditPersistenceSchema,
  })
  .strict();

const HyperframesTemplateOperatorOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    templateId: z.string().min(1).max(160),
    disabled: z.boolean().optional(),
    enabled: z.boolean().optional(),
    audit: HyperframesOperatorAuditEventSchema,
    auditPersistence: HyperframesOperatorAuditPersistenceSchema,
  })
  .strict();

function autoReviewRuntimeFromCtx(ctx: any) {
  const userId = Number(ctx.user?.id);
  const tenantId =
    resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) ??
    undefined;
  const fallbackToken =
    Number.isFinite(userId) && userId > 0
      ? signBearerToken(
          {
            sub: String(userId),
            type: "access",
            userId,
            tenantId,
            scopes: ["media:generate"],
            jti: `marketplace_auto_review_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
          },
          "6h"
        )
      : undefined;
  return {
    userToken: ctx.userToken || fallbackToken,
    publicUrl: ctx.publicUrl,
    externalOperationalRecoveryEvidence:
      ctx.externalOperationalRecoveryEvidence ??
      ctx.autoReviewOperationalRecoveryEvidence ??
      null,
  };
}

export const marketplaceCaptureRouter = router({
  adminOverview: adminProcedure.query(async () =>
    getMarketplaceCaptureAdminOverview()
  ),

  issueExtensionToken: protectedProcedure
    .input(
      z
        .object({
          origin: z.string().max(300).optional(),
          extensionId: z.string().max(160).optional(),
          deviceId: z.string().max(80).optional(),
        })
        .optional()
        .default({})
    )
    .mutation(async ({ input, ctx }) => {
      return issueMarketplaceExtensionToken({
        ...authFromCtx(ctx),
        origin: input.origin ?? null,
        extensionId: input.extensionId ?? null,
        deviceId: input.deviceId ?? null,
      });
    }),

  listCaptures: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional().default(30),
        })
        .optional()
        .default({})
    )
    .query(async ({ input, ctx }) =>
      listMarketplaceCapturesForUser(authFromCtx(ctx), input.limit)
    ),

  getCapture: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) =>
      getMarketplaceCaptureForUser(input.captureId, authFromCtx(ctx))
    ),

  listInsightsByCapture: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) =>
      listMarketplaceInsightsByCapture(input.captureId, authFromCtx(ctx))
    ),

  listInsightsByProduct: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) =>
      listMarketplaceInsightsByProduct(input.productId, authFromCtx(ctx))
    ),

  getInsight: protectedProcedure
    .input(z.object({ insightId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) =>
      getMarketplaceInsightReadableForUser(input.insightId, authFromCtx(ctx))
    ),

  syncInsight: protectedProcedure
    .input(marketplaceCaptureInsightSyncSchema)
    .mutation(async ({ input, ctx }) =>
      syncMarketplaceInsight(input, authFromCtx(ctx))
    ),

  generateServerInsight: protectedProcedure
    .input(marketplaceServerInsightGenerationSchema)
    .mutation(async ({ input, ctx }) =>
      generateMarketplaceServerInsight(input, authFromCtx(ctx))
    ),

  resolveInsightClaim: protectedProcedure
    .input(marketplaceClaimResolutionSchema)
    .mutation(async ({ input, ctx }) =>
      applyMarketplaceClaimResolution(input, authFromCtx(ctx))
    ),

  getStorytellingHandoff: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => {
      const auth = authFromCtx(ctx);
      const insights = await listMarketplaceInsightsByCapture(
        input.captureId,
        auth
      );
      const syncedHandoff = insights.find(
        insight => insight.insightType === "storytelling_handoff"
      );
      return (
        syncedHandoff?.payloadJson ??
        buildBasicStorytellingHandoffFromCapture(input.captureId, auth)
      );
    }),

  analyzeCapture: protectedProcedure
    .input(
      z.object({
        captureId: z.string().min(1).max(64),
        analyze: analyzeMarketplaceCaptureSchema.optional().default({}),
      })
    )
    .mutation(async ({ input, ctx }) =>
      analyzeMarketplaceCapture(
        input.captureId,
        input.analyze,
        authFromCtx(ctx)
      )
    ),

  confirmCapture: protectedProcedure
    .input(
      z.object({
        captureId: z.string().min(1).max(64),
        data: marketplaceConfirmProductSchema,
      })
    )
    .mutation(async ({ input, ctx }) =>
      confirmMarketplaceCapture(input.captureId, input.data, authFromCtx(ctx))
    ),

  saveDraftEdits: protectedProcedure
    .input(
      z.object({
        captureId: z.string().min(1).max(64),
        data: marketplaceConfirmProductSchema,
      })
    )
    .mutation(async ({ input, ctx }) =>
      saveMarketplaceCaptureDraftEdits(
        input.captureId,
        input.data,
        authFromCtx(ctx)
      )
    ),

  discardCapture: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) =>
      discardMarketplaceCapture(input.captureId, authFromCtx(ctx))
    ),

  listProducts: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional().default(30),
          cursor: z.string().optional().nullable(),
          ownerOnly: z.boolean().optional().default(false),
          platform: z
            .enum(["all", "shopee", "tiktok_shop"])
            .optional()
            .default("all"),
          query: z.string().trim().max(160).optional(),
          category: z.string().trim().max(160).optional(),
          sortMode: z.enum(["recommended", "sold", "rating", "updated"]).optional().default("updated"),
        })
        .optional()
        .default({})
    )
    .query(async ({ input, ctx }) =>
      listMarketplaceProductsWithAccess(authFromCtx(ctx), input)
    ),

  searchSimilarProductsByImage: protectedProcedure
    .input(visualProductSearchSchema)
    .mutation(async ({ input, ctx }) => {
      const imageBuffer = decodeVisualSearchImage(input);
      return searchSimilarMarketplaceProductsByImage(authFromCtx(ctx), {
        imageBuffer,
        limit: input.limit,
        ownerOnly: input.ownerOnly,
        platform: input.platform,
      });
    }),

  listProductImages: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(30).optional().default(30),
          cursor: z.string().optional().nullable(),
          ownerOnly: z.boolean().optional().default(false),
          platform: z
            .enum(["all", "shopee", "tiktok_shop"])
            .optional()
            .default("all"),
          query: z.string().trim().max(160).optional(),
          productId: z.string().min(1).max(64).optional().nullable(),
        })
        .optional()
        .default({})
    )
    .query(async ({ input, ctx }) =>
      listMarketplaceProductImagesForMediaStudio(authFromCtx(ctx), input)
    ),

  getShareSettings: protectedProcedure.query(async ({ ctx }) =>
    getMarketplaceShareSettings(authFromCtx(ctx))
  ),

  saveShareSetting: protectedProcedure
    .input(
      z.object({
        platform: z.enum(["shopee", "tiktok_shop"]),
        enabled: z.boolean().default(true),
        groupIds: z.array(z.number().int().positive()).max(20).default([]),
        permission: z.enum(["read", "read_update"]).default("read_update"),
      })
    )
    .mutation(async ({ input, ctx }) =>
      saveMarketplaceShareSetting(input, authFromCtx(ctx))
    ),

  listCandidateBatches: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).optional().default(30),
        })
        .optional()
        .default({})
    )
    .query(async ({ input, ctx }) =>
      listMarketplaceCandidateBatchesForUser(authFromCtx(ctx), input.limit)
    ),

  getCandidateBatch: protectedProcedure
    .input(z.object({ batchId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) =>
      getMarketplaceCandidateBatchForUser(input.batchId, authFromCtx(ctx))
    ),

  getProduct: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) =>
      getMarketplaceProductWithAccess(input.productId, authFromCtx(ctx))
    ),

  createManualProduct: protectedProcedure
    .input(manualProductSchema)
    .mutation(async ({ input, ctx }) =>
      createManualMarketplaceProduct(input, authFromCtx(ctx))
    ),

  updateProductDetails: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64), data: editableProductDetailsSchema }))
    .mutation(async ({ input, ctx }) =>
      updateMarketplaceProductDetails(input.productId, input.data, authFromCtx(ctx))
    ),

  enhanceProductDescription: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) =>
      enhanceMarketplaceProductDescription(input.productId, authFromCtx(ctx))
    ),

  analyzeProductInsights: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) =>
      analyzeMarketplaceProductInsights(input.productId, authFromCtx(ctx))
    ),

  addProductImageFromUrl: protectedProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        url: z.string().min(1).max(4096),
        type: z
          .enum(["main", "description", "review", "related_excluded"])
          .optional()
          .default("main"),
        title: z.string().max(255).optional().nullable(),
        source: z.string().max(128).optional().nullable(),
        originalSourceUrl: z.string().max(4096).optional().nullable(),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) =>
      addMarketplaceProductImageFromUrl(input, authFromCtx(ctx))
    ),

  removeProductImage: protectedProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        imageId: z.string().min(1).max(64),
      })
    )
    .mutation(async ({ input, ctx }) =>
      removeMarketplaceProductImage(input, authFromCtx(ctx))
    ),

  setProductHeroImage: protectedProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        imageId: z.string().min(1).max(64),
      })
    )
    .mutation(async ({ input, ctx }) =>
      setMarketplaceProductHeroImage(input, authFromCtx(ctx))
    ),

  startAutoReview: protectedProcedure
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        creationIntent: z
          .enum(["storyboard", "video", "auto_review_video"])
          .optional()
          .nullable(),
        outputMode: z
          .enum(["storyboard_images", "full_video"])
          .default("storyboard_images"),
        frameStrategy: z
          .enum([
            "auto",
            "storyboard_3x3_split",
            "video_shot_start_stop",
            "sequential_shot_storyboard",
          ])
          .optional()
          .default("auto"),
        // Feature 136 section 13 (§4 deliverable 2) — optional cinematic
        // prompt style layer for the sequential storyboard's start-frame /
        // video prompts (section-01 `frameStrategy` precedent: additive,
        // nothing else in this procedure changes). No `.default()` — an
        // absent value keeps today's `evidence_product` behavior with zero
        // wire-shape change for every existing caller.
        startFramePromptStyle: z
          .enum(MARKETPLACE_START_FRAME_PROMPT_STYLES)
          .optional(),
        audioStrategy: z
          .enum([
            "auto",
            "native_video_audio",
            "separate_tts_voiceover",
            "silent",
          ])
          .optional()
          .default("auto"),
        shotCount: z.number().int().min(7).max(9).optional().default(9),
        overlayTextMode: z
          .enum(["no_text", "allow_text"])
          .optional()
          .default("no_text"),
        imageModel: z.string().min(1).max(120).optional().default("google-banana-2"),
        qualityMode: z
          .enum(["fast_draft", "balanced", "premium_strict_qa"])
          .optional()
          .nullable(),
        visionQaModel: z.string().min(1).max(120).optional().nullable(),
        motionDirection: z.string().trim().min(1).max(2000).optional(),
        characterPresenceMode: z
          .enum(["auto", "every_frame", "most_frames"])
          .optional(),
        transportMetadata: mcpTransportMetadataSchema,
        referenceAnchors: z
          .object({
            schemaVersion: z.number().int().positive().optional(),
            creationIntent: z
              .enum(["storyboard", "video", "auto_review_video"])
              .optional()
              .nullable(),
            characterMode: z
              .enum([
                "product_only",
                "hands_only",
                "described_character",
                "uploaded_reference",
              ])
              .optional(),
            characterBrief: z.string().min(1).max(2000).optional(),
            characterPreset: z
              .union([
                z.string().max(4000),
                z.record(z.unknown()),
                z.array(z.unknown()),
              ])
              .optional(),
            reviewTone: z
              .enum([
                "warm_honest",
                "funny_light",
                "irritated_problem",
                "energetic_excited",
                "empathetic_soft",
                "expert_confident",
                "straight_serious",
              ])
              .optional()
              .nullable(),
            storytellingStructure: z
              .enum([
                "hook_problem_emotion_insight_solution_result_cta",
                "hook_problem_insight_proof_cta",
                "product_review_situation_problem_try_result_fit",
                "before_after_bridge",
                "pas",
                "aida",
                "relatable_story",
                "problem_struggle_solution_transformation",
              ])
              .optional()
              .nullable(),
            creativePresets: z
              .array(AutoReviewCreativePresetSelectionSchema)
              .max(8)
              .optional(),
            requiredRoles: z
              .array(z.enum(["product", "character", "environment"]))
              .optional(),
            lockPolicy: z.record(z.unknown()).optional(),
            productImageUrl: z.string().min(1).max(4096),
            productImageId: z.string().max(160).optional().nullable(),
            productImageRef: z.string().max(512).optional().nullable(),
            productImageSource: z.string().max(128).optional().nullable(),
            productImageSourceUrl: z.string().max(4096).optional().nullable(),
            productImageStorageKey: z.string().max(1024).optional().nullable(),
            productImageHash: z.string().max(256).optional().nullable(),
            productImageIndex: z.number().int().optional().nullable(),
            characterImageUrl: z
              .string()
              .min(1)
              .max(4096)
              .optional()
              .nullable(),
            characterImageRef: z.string().max(512).optional().nullable(),
            characterImageSource: z.string().max(128).optional().nullable(),
            characterImageUploadKey: z.string().max(1024).optional().nullable(),
            characterImageHash: z.string().max(256).optional().nullable(),
            characterImageFileName: z.string().max(512).optional().nullable(),
            characterImageFileType: z.string().max(160).optional().nullable(),
            characterImageFileSizeBytes: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .nullable(),
            environmentImageUrl: z
              .string()
              .min(1)
              .max(4096)
              .optional()
              .nullable(),
            environmentImageRef: z.string().max(512).optional().nullable(),
            environmentImageSource: z.string().max(128).optional().nullable(),
            environmentImageUploadKey: z
              .string()
              .max(1024)
              .optional()
              .nullable(),
            environmentImageHash: z.string().max(256).optional().nullable(),
            environmentImageFileName: z.string().max(512).optional().nullable(),
            environmentImageFileType: z.string().max(160).optional().nullable(),
            environmentImageFileSizeBytes: z
              .number()
              .int()
              .nonnegative()
              .optional()
              .nullable(),
            auditMetadata: z.record(z.unknown()).optional(),
            fileEvidence: z.record(z.unknown()).optional(),
            sourceRefs: z.array(z.string().max(512)).max(50).optional(),
            // Feature 136 (section 02, §5.2) — multi-angle product reference
            // layer for the `sequential_shot_storyboard` strategy. Additive
            // and optional; unrelated to (and never written into) the
            // existing single-anchor `productReferenceAssetPack`.
            productAngleImages: z
              .array(
                z.object({
                  url: z.string().min(1).max(4096),
                  ref: z.string().max(512),
                  hash: z.string().max(256).optional().nullable(),
                  storageKey: z.string().max(1024).optional().nullable(),
                  source: z.enum([
                    "marketplace_product_image",
                    "upload",
                    "library",
                  ]),
                  angleLabel: z.enum([
                    "front",
                    "back",
                    "side",
                    "top",
                    "base",
                    "detail",
                    "package",
                    "parts_diagram",
                    "scale",
                    "other",
                  ]),
                })
              )
              .max(8)
              .optional(),
          })
          .passthrough()
          .optional()
          .nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const auth = authFromCtx(ctx);
      return startMarketplaceAutoReviewRun(
        input,
        auth,
        autoReviewRuntimeFromCtx(ctx)
      );
    }),

  getAutoStoryboardReviewPlan: protectedProcedure
    .input(GetAutoStoryboardReviewPlanInputSchema)
    .output(GetAutoStoryboardReviewPlanOutputSchema)
    .query(async ({ input, ctx }) =>
      getAutoStoryboardReviewPlanForApi({
        productId: input.productId,
        includeTemplates: input.includeTemplates,
        overrides: input.overrides,
        auth: authFromCtx(ctx),
      })
    ),

  getVideoSegmentPlanPreview: protectedProcedure
    .input(GetVideoSegmentPlanPreviewInputSchema)
    .output(GetVideoSegmentPlanPreviewOutputSchema)
    .query(async ({ input, ctx }) =>
      getVideoSegmentPlanPreviewForApi({
        productId: input.productId,
        overrides: input.overrides,
        transportMetadata: input.transportMetadata,
        referenceAnchors: input.referenceAnchors,
        auth: authFromCtx(ctx),
      })
    ),

  startAutoStoryboardReview: protectedProcedure
    .input(StartAutoStoryboardReviewInputSchema)
    .output(StartAutoStoryboardReviewOutputSchema)
    .mutation(async ({ input, ctx }) =>
      startAutoStoryboardReviewForApi({
        productId: input.productId,
        expectedPlanHash: input.expectedPlanHash,
        idempotencyKey: input.idempotencyKey,
        overrides: input.overrides,
        transportMetadata: input.transportMetadata,
        referenceAnchors: input.referenceAnchors,
        auth: authFromCtx(ctx),
        runtime: autoReviewRuntimeFromCtx(ctx),
      })
    ),

  createHyperframesPreview: protectedProcedure
    .input(CreateHyperframesPreviewInputSchema)
    .output(CreateHyperframesPreviewOutputSchema)
    .mutation(async ({ input, ctx }) =>
      createHyperframesPreviewForApi({
        productId: input.productId,
        runId: input.runId,
        expectedCompositionInputHash: input.expectedCompositionInputHash,
        auth: authFromCtx(ctx),
      })
    ),

  createHyperframesFinalComposite: protectedProcedure
    .input(CreateHyperframesFinalCompositeInputSchema)
    .output(CreateHyperframesFinalCompositeOutputSchema)
    .mutation(async ({ input, ctx }) =>
      createHyperframesFinalCompositeForApi({
        productId: input.productId,
        runId: input.runId,
        expectedCompositionInputHash: input.expectedCompositionInputHash,
        renderIntent: input.renderIntent,
        compositionMode: input.compositionMode,
        config: input.config,
        auth: authFromCtx(ctx),
      })
    ),

  createPreviewMatchFinalCompositeCapture: protectedProcedure
    .input(createPreviewMatchFinalCompositeCaptureInputSchema)
    .output(previewMatchCaptureJobOutputSchema)
    .mutation(async ({ input, ctx }) =>
      createPreviewMatchFinalCompositeCaptureForApi({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  getPreviewMatchCaptureJob: protectedProcedure
    .input(getPreviewMatchCaptureJobInputSchema)
    .output(previewMatchCaptureJobOutputSchema)
    .query(async ({ input, ctx }) =>
      getPreviewMatchCaptureJobForApi({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  cancelPreviewMatchCaptureJob: protectedProcedure
    .input(cancelPreviewMatchCaptureJobInputSchema)
    .output(previewMatchCaptureJobOutputSchema)
    .mutation(async ({ input, ctx }) =>
      cancelPreviewMatchCaptureJobForApi({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  getHyperframesRenderJob: protectedProcedure
    .input(GetHyperframesRenderJobInputSchema)
    .output(GetHyperframesRenderJobOutputSchema)
    .query(async ({ input, ctx }) =>
      getHyperframesRenderJobForApi({
        renderJobId: input.renderJobId,
        productId: input.productId,
        runId: input.runId,
        auth: authFromCtx(ctx),
      })
    ),

  repairHyperframesRenderJob: protectedProcedure
    .input(RepairHyperframesRenderJobInputSchema)
    .output(RepairHyperframesRenderJobOutputSchema)
    .mutation(async ({ input, ctx }) =>
      repairHyperframesRenderJobForApi({
        renderJobId: input.renderJobId,
        productId: input.productId,
        runId: input.runId,
        actionId: input.actionId,
        actionType: input.actionType,
        expectedCompositionInputHash: input.expectedCompositionInputHash,
        auth: authFromCtx(ctx),
      })
    ),

  listHyperframesTemplates: protectedProcedure
    .input(ListHyperframesTemplatesInputSchema)
    .output(ListHyperframesTemplatesOutputSchema)
    .query(async ({ input, ctx }) =>
      listHyperframesTemplatesForApi({
        includeDisabled: input.includeDisabled,
        compositionMode: input.compositionMode,
        renderIntent: input.renderIntent,
        auth: authFromCtx(ctx),
      })
    ),

  listHyperframesCreativePresets: protectedProcedure
    .input(ListHyperframesCreativePresetsInputSchema)
    .output(ListHyperframesCreativePresetsOutputSchema)
    .query(async ({ input, ctx }) =>
      listHyperframesCreativePresetsForApi({
        includeDisabled: input.includeDisabled,
        includeCandidate: input.includeCandidate,
        category: input.category,
        auth: authFromCtx(ctx),
      })
    ),

  cancelHyperframesRenderJob: protectedProcedure
    .input(CancelHyperframesRenderJobInputSchema)
    .output(CancelHyperframesRenderJobOutputSchema)
    .mutation(async ({ input, ctx }) =>
      cancelHyperframesRenderJobForApi({
        renderJobId: input.renderJobId,
        productId: input.productId,
        runId: input.runId,
        auth: authFromCtx(ctx),
      })
    ),

  saveHyperframesRenderToLibrary: protectedProcedure
    .input(SaveHyperframesRenderToLibraryInputSchema)
    .output(SaveHyperframesRenderToLibraryOutputSchema)
    .mutation(async ({ input, ctx }) =>
      saveHyperframesRenderToLibraryForApi({
        productId: input.productId,
        runId: input.runId,
        renderJobId: input.renderJobId,
        idempotencyKey: input.idempotencyKey,
        auth: authFromCtx(ctx),
      })
    ),

  inspectHyperframesRenderDiagnostics: hyperframesOperatorProcedure
    .input(
      z.object({
        renderJobId: z.string().min(1).max(128),
        productId: z.string().min(1).max(64).optional(),
        runId: z.string().min(1).max(64).optional(),
      })
    )
    .output(HyperframesOperatorInspectOutputSchema as z.ZodTypeAny)
    .query(async ({ input, ctx }) =>
      inspectHyperframesRenderAsOperator({
        auth: await operatorAuthFromCtx(ctx),
        renderJobId: input.renderJobId,
        productId: input.productId,
        runId: input.runId,
        auditSink: defaultHyperframesOperatorAuditSink,
      })
    ),

  cancelHyperframesRenderJobAsOperator: hyperframesOperatorProcedure
    .input(
      z.object({
        renderJobId: z.string().min(1).max(128),
        productId: z.string().min(1).max(64).optional(),
        runId: z.string().min(1).max(64).optional(),
        reason: z.string().trim().min(6).max(500).optional(),
      })
    )
    .output(HyperframesOperatorCancelOutputSchema as z.ZodTypeAny)
    .mutation(async ({ input, ctx }) =>
      cancelHyperframesRenderAsOperator({
        auth: await operatorAuthFromCtx(ctx),
        renderJobId: input.renderJobId,
        productId: input.productId,
        runId: input.runId,
        reason: input.reason,
        auditSink: defaultHyperframesOperatorAuditSink,
      })
    ),

  replayHyperframesDeadLetter: hyperframesOperatorProcedure
    .input(
      z.object({
        renderJobId: z.string().min(1).max(128),
        productId: z.string().min(1).max(64).optional(),
        runId: z.string().min(1).max(64).optional(),
        currentCompositionInputHash: z.string().min(6).max(128),
        replayToken: z.string().min(8).max(160),
        reason: z.string().trim().min(6).max(500),
      })
    )
    .output(HyperframesDeadLetterReplayOutputSchema as z.ZodTypeAny)
    .mutation(async ({ input, ctx }) => {
      const auth = await operatorAuthFromCtx(ctx);
      const flags = await readHyperframesFeatureFlagsForTenant(auth);
      return replayHyperframesDeadLetterByIdAsOperator({
        auth,
        renderJobId: input.renderJobId,
        productId: input.productId,
        runId: input.runId,
        currentCompositionInputHash: input.currentCompositionInputHash,
        replayToken: input.replayToken,
        reason: input.reason,
        access: {
          featureEnabled: flags.enabled,
          tenantAllowed: flags.tenantAllowed,
          workerEnabled: flags.workerEnabled,
          operatorEnabled: flags.operatorEnabled,
          canReplayAsOperator: true,
          complianceBlocked: false,
        },
        auditSink: defaultHyperframesOperatorAuditSink,
      });
    }),

  disableHyperframesTemplate: hyperframesOperatorProcedure
    .input(
      z.object({
        templateId: z.string().min(1).max(160),
        reason: z.string().min(1).max(500),
      })
    )
    .output(HyperframesTemplateOperatorOutputSchema as z.ZodTypeAny)
    .mutation(async ({ input, ctx }) =>
      disableHyperframesTemplateWithAuditAsOperator({
        auth: await operatorAuthFromCtx(ctx),
        templateId: input.templateId,
        reason: input.reason,
        auditSink: defaultHyperframesOperatorAuditSink,
      })
    ),

  enableHyperframesTemplate: hyperframesOperatorProcedure
    .input(z.object({ templateId: z.string().min(1).max(160) }))
    .output(HyperframesTemplateOperatorOutputSchema as z.ZodTypeAny)
    .mutation(async ({ input, ctx }) =>
      enableHyperframesTemplateWithAuditAsOperator({
        auth: await operatorAuthFromCtx(ctx),
        templateId: input.templateId,
        auditSink: defaultHyperframesOperatorAuditSink,
      })
    ),

  getAutoReviewRun: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .output(z.any())
    .query(async ({ input, ctx }) => {
      const auth = authFromCtx(ctx);
      const result = await getMarketplaceAutoReviewRun(input.runId, auth);
      if (
        ["queued", "running", "waiting_provider"].includes(
          String(result.status)
        )
      ) {
        queueMarketplaceAutoReviewAdvance(
          input.runId,
          auth,
          {
            ...autoReviewRuntimeFromCtx(ctx),
          },
          1_000
        );
      }
      return result;
    }),

  listAutoReviewRuns: protectedProcedure
    .input(
      z
        .object({
          productId: z.string().min(1).max(64).optional(),
          limit: z.number().int().min(1).max(50).optional().default(10),
          summary: z.boolean().optional().default(false),
        })
        .optional()
        .default({})
    )
    .output(z.array(z.any()))
    .query(async ({ input, ctx }) => {
      const auth = authFromCtx(ctx);
      const runs = await listMarketplaceAutoReviewRuns(input, auth);
      for (const run of runs) {
        if (
          ["queued", "running", "waiting_provider"].includes(String(run.status))
        ) {
          queueMarketplaceAutoReviewAdvance(
            String(run.id),
            auth,
            {
              ...autoReviewRuntimeFromCtx(ctx),
            },
            1_000
          );
        }
      }
      return runs;
    }),

  advanceAutoReviewRun: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) =>
      advanceMarketplaceAutoReviewRun(
        input.runId,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      )
    ),

  selectAutoReviewImageAttemptForStoryboardReview: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        attempt: z.number().int().positive().max(20),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      selectMarketplaceAutoReviewImageAttemptForStoryboardReview(
        input,
        authFromCtx(ctx)
      )
    ),

  // Feature 136 (section 08, §6.1) — additive, sequential-shot-storyboard
  // only. Re-runs exactly one of the 9 sequential units through the
  // existing image submit -> QA -> repair machinery; the media `userToken`
  // is required to submit, so runtime is threaded through like `advanceAuto
  // ReviewRun`.
  regenerateAutoReviewSequentialShot: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        refreshPrompt: z.boolean().optional().default(false),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      regenerateMarketplaceAutoReviewSequentialShot(
        input,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      )
    ),

  // Feature 136 (section 08, §6.1) — additive. Validates and persists a user
  // edit (dialogue / image prompt / video prompt) at
  // `metadataJson.sequentialStoryboard.shotOverrides[shotId]`; no provider
  // spend, so no runtime/userToken needed.
  saveAutoReviewSequentialShotOverride: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        dialogue: z.string().trim().max(2000).optional(),
        startFrameImagePrompt: z.string().trim().max(4000).optional(),
        videoPrompt: z.string().trim().max(2000).optional(),
        clear: z.boolean().optional().default(false),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      saveMarketplaceAutoReviewSequentialShotOverride(input, authFromCtx(ctx))
    ),

  cancelAutoReviewRun: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) =>
      cancelMarketplaceAutoReviewRun(
        input.runId,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      )
    ),

  deleteProduct: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) =>
      deleteMarketplaceProduct(input.productId, authFromCtx(ctx))
    ),
});
