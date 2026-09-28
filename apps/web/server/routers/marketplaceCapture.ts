import crypto from "crypto";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { z } from "zod";
import { AutoReviewCreativePresetSelectionSchema } from "../../shared/hyperframes/autoReviewCreativePresets";
import { HyperframesFinalCompositeSubtitlePresetSchema } from "../../shared/hyperframes/runtimeApiSchemas";
import {
  MARKETPLACE_CHARACTER_CAST_ROLES,
  MarketplaceCharacterCastInputSchema,
} from "../../shared/hyperframes/characterCast";
import { MARKETPLACE_START_FRAME_PROMPT_STYLES } from "../../shared/marketplaceCapture/startFramePromptStyle";
import {
  GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES,
  GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES,
} from "../../shared/geminiOmni";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { signBearerToken } from "../_core/tokens";
import { assertR2StorageActive, storagePut } from "../storage";
import { STAGED_OVERLAY_ANCHORS } from "../services/marketplaceAutoReviewStagedRemotionRender";
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
  submitStagedAutoReviewFinalRender,
  approveMarketplaceAutoReviewPlanReview,
  cancelMarketplaceAutoReviewRun,
  getMarketplaceAutoReviewRun,
  listMarketplaceAutoReviewRuns,
  queueMarketplaceAutoReviewAdvance,
  regenerateMarketplaceAutoReviewSequentialShot,
  generateMarketplaceAutoReviewSequentialShotPrompt,
  saveMarketplaceAutoReviewSequentialLanguagePlan,
  editMarketplaceAutoReviewSequentialShotImage,
  acceptMarketplaceAutoReviewSequentialShotImageEdit,
  discardMarketplaceAutoReviewSequentialShotImageEdit,
  requestMarketplaceAutoReviewPlanRedraft,
  saveMarketplaceAutoReviewSequentialShotOverride,
  selectMarketplaceAutoReviewImageAttemptForStoryboardReview,
  selectMarketplaceAutoReviewSequentialShotAlternate,
  startMarketplaceAutoReviewRun,
  deleteMarketplaceAutoReviewRun,
  updateMarketplaceAutoReviewPlanShotDialogue,
  startMarketplaceAutoReviewDraftQualityQc,
  startMarketplaceAutoReviewDraftQualityQcRepair,
  selectMarketplaceAutoReviewDraftQualityQcRepair,
} from "../services/marketplaceAutoReviewService";
import {
  acceptStagedAutoReviewImage,
  approveStagedAutoReviewCheckpoint,
  editStagedAutoReviewAudioPlan,
  editStagedAutoReviewFinalAssembly,
  editStagedAutoReviewShot,
  generateStagedAutoReviewShotPrompt,
  getStagedAutoReviewCheckpointState,
  rejectStagedAutoReviewCheckpoint,
  redraftStagedAutoReviewPlan,
  retryStagedAutoReviewShot,
  retryStagedAutoReviewAudioPlan,
  retryStagedAutoReviewFinalAssembly,
  updateStagedAutoReviewFinalRenderSettings,
  updateStagedAutoReviewReferenceManifest,
  updateStagedAutoReviewShotCast,
  uploadStagedAutoReviewShotMedia,
} from "../services/marketplaceAutoReviewStagedCheckpointRouterService";
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
import { listDramaSeriesCharactersForPicker } from "../services/verticalDramaExtensionReadService";
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

const mcpTransportMetadataSchema = z
  .object({
    transport: z.enum(["gateway_api", "mcp"]),
    connectionId: z.string().max(64).optional(),
    mcpConnectionId: z.string().max(64).optional(),
    sharedGroupId: z.number().int().optional(),
    approvalId: z.string().max(128).optional(),
    mcpApprovalId: z.string().max(128).optional(),
    idempotencyKey: z.string().max(128).optional(),
  })
  .optional()
  .nullable();

function authFromCtx(ctx: any) {
  const userId = Number(ctx.user?.id);
  const tenantId =
    resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) ??
    undefined;
  return { userId, tenantId };
}

const VISUAL_SEARCH_MAX_BYTES = 5 * 1024 * 1024;
const visualSearchMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

function hasImageMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mimeType === "image/jpeg") {
    return buffer[0] === 0xff && buffer[1] === 0xd8;
  }
  if (mimeType === "image/webp") {
    return (
      buffer.slice(0, 4).toString("ascii") === "RIFF" &&
      buffer.slice(8, 12).toString("ascii") === "WEBP"
    );
  }
  return false;
}

function decodeVisualSearchImage(input: {
  imageBase64: string;
  mimeType: string;
}): Buffer {
  const mimeType = input.mimeType.trim().toLowerCase();
  if (!visualSearchMimeTypes.has(mimeType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "รองรับเฉพาะรูป PNG, JPEG หรือ WebP",
    });
  }
  const cleaned = input.imageBase64
    .replace(/^data:image\/(?:png|jpeg|jpg|webp);base64,/i, "")
    .replace(/\s+/g, "");
  if (!cleaned) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "ไม่พบข้อมูลรูปภาพ" });
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned) || cleaned.length % 4 !== 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ข้อมูลรูปภาพไม่ใช่ base64 ที่ถูกต้อง",
    });
  }
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ไม่สามารถอ่านรูปภาพได้",
    });
  }
  if (buffer.length > VISUAL_SEARCH_MAX_BYTES) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: "รูปภาพต้องมีขนาดไม่เกิน 5MB",
    });
  }
  if (!hasImageMagicBytes(buffer, mimeType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ชนิดไฟล์รูปภาพไม่ตรงกับข้อมูลจริง",
    });
  }
  return buffer;
}

export function decodeVisualSearchImageForTest(input: {
  imageBase64: string;
  mimeType: string;
}): Buffer {
  return decodeVisualSearchImage(input);
}

const editableProductDetailsSchema = z.object({
  productName: z.string().trim().min(1).max(500),
  descriptionText: z.string().max(80_000).optional().nullable(),
  priceCurrent: z
    .union([z.string().max(64), z.number()])
    .optional()
    .nullable(),
  commissionRatePercent: z
    .union([z.string().max(64), z.number()])
    .optional()
    .nullable(),
  productPageUrl: z.string().trim().max(4096).optional().nullable(),
  soldCountText: z.string().trim().max(128).optional().nullable(),
  capturedCategoryText: z.string().trim().max(300).optional().nullable(),
  shopName: z.string().trim().max(300).optional().nullable(),
  productCategory: productReferenceCategorySchema.optional().nullable(),
  ratingScore: z
    .union([z.string().max(64), z.number()])
    .optional()
    .nullable(),
  reviewCountText: z.string().trim().max(128).optional().nullable(),
  affiliateUrl: z.string().trim().max(4096).optional().nullable(),
});

const manualProductSchema = editableProductDetailsSchema.extend({
  platform: z.enum(["shopee", "tiktok_shop"]).default("shopee"),
  sourceUrl: z.string().trim().max(4096).optional().nullable(),
});

const visualProductSearchSchema = z.object({
  imageBase64: z
    .string()
    .min(1)
    .max(Math.ceil(VISUAL_SEARCH_MAX_BYTES * 1.4)),
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
      flags.operatorEnabled && hyperframesDelegatedOperatorRoles.has(role);

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
          sortMode: z
            .enum(["recommended", "sold", "rating", "updated"])
            .optional()
            .default("updated"),
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
    .input(
      z.object({
        productId: z.string().min(1).max(64),
        data: editableProductDetailsSchema,
      })
    )
    .mutation(async ({ input, ctx }) =>
      updateMarketplaceProductDetails(
        input.productId,
        input.data,
        authFromCtx(ctx)
      )
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
        workflowMode: z.enum(["standard", "job_workbench"]).optional(),
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
        summaryLanguage: z.enum(["th", "en"]).optional(),
        dialogueLanguage: z.enum(["th", "en"]).optional(),
        promptLanguage: z.enum(["th", "en"]).optional(),
        shotCount: z.number().int().min(7).max(9).optional().default(9),
        overlayTextMode: z
          .enum(["no_text", "allow_text"])
          .optional()
          .default("no_text"),
        imageModel: z
          .string()
          .min(1)
          .max(120)
          .optional()
          .default("google-banana-2"),
        qualityMode: z
          .enum(["fast_draft", "balanced", "premium_strict_qa"])
          .optional()
          .nullable(),
        visionQaModel: z.string().min(1).max(120).optional().nullable(),
        motionDirection: z.string().trim().min(1).max(2000).optional(),
        characterPresenceMode: z
          .enum(["auto", "every_frame", "most_frames"])
          .optional(),
        // Creation-time drama casting (planning/marketplace-flexible-shots-
        // and-creation-casting/plan.md, W2). Top-level, same convention as
        // `characterPresenceMode`/`motionDirection` above. Absent = today's
        // byte-identical behavior (no manifest seeding at all).
        characterCast: MarketplaceCharacterCastInputSchema,
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
            // Staged pipeline only. User-chosen per-shot video duration
            // (seconds); the pipeline still snaps this to whatever the
            // selected video model actually supports at dispatch time via
            // `resolveStagedVideoDuration`, but this value is what
            // `buildStagedStoryArcPlan` uses to write the plan's own camera
            // beats/prompt text, so the two stay consistent. Omitted =
            // today's default of 10. Extended to 30s (feature/marketplace-
            // flexible-shots) for newer video models that support longer
            // single clips (e.g. 24/30s).
            shotDurationSeconds: z.number().int().min(4).max(30).optional(),
            // Staged pipeline only (feature/marketplace-flexible-shots). A
            // fixed shot count (7..30), or "auto" to let the story-arc LLM
            // planner decide the shot count itself based on how much content
            // the product needs (using shotDurationSeconds as the pacing
            // criterion). Omitted = today's fixed default of 9 shots,
            // byte-compatible with every existing persisted run. Legacy
            // (non-staged) runs ignore this field entirely and are clamped
            // to 9 server-side — see `shouldDispatchStagedMarketplaceAutoReview`.
            shotCount: z
              .union([z.literal("auto"), z.number().int().min(7).max(30)])
              .optional(),
            // Staged pipeline only — the LLM that authors the story plan and
            // runs the storyboard skill. Omitted = "อัตโนมัติ", which resolves
            // from the admin-curated RECOMMENDED set server-side
            // (`planning/marketplace-four-character-cast/plan.md`).
            storyPlanningModel: z.string().min(1).max(120).optional(),
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
                  // Optional (checkbox-selection UX): a selected image with
                  // NO label is a normal supporting angle (attached to the
                  // provider like any other), not evidence-only. Only
                  // "package" / "parts_diagram" stay evidence-only, and only
                  // when the label is explicitly set to one of those values.
                  angleLabel: z
                    .enum([
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
                    ])
                    .optional(),
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
        workflowMode: input.workflowMode,
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
        workflowMode: input.workflowMode,
        summaryLanguage: input.summaryLanguage,
        dialogueLanguage: input.dialogueLanguage,
        promptLanguage: input.promptLanguage,
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
      return getMarketplaceAutoReviewRun(input.runId, auth);
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
      return listMarketplaceAutoReviewRuns(input, auth);
    }),

  advanceAutoReviewRun: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => {
      void advanceMarketplaceAutoReviewRun(
        input.runId,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      ).catch((err) => {
        console.error("[marketplaceCapture] background advanceAutoReviewRun error", err);
      });
      return { success: true, runId: input.runId, status: "running" };
    }),

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
        visualSummary: z.string().trim().max(2000).optional(),
        startFrameImagePrompt: z.string().trim().max(4000).optional(),
        videoPrompt: z.string().trim().max(2000).optional(),
        cameraBeats: z
          .array(
            z.object({
              beatId: z.number().int().positive(),
              durationSeconds: z.number().positive().max(10),
              camera: z.string().trim().min(1).max(500),
              movement: z.string().trim().min(1).max(800),
              action: z.string().trim().min(1).max(1200),
              transition: z.string().trim().max(160),
            })
          )
          .max(4)
          .optional(),
        clear: z.boolean().optional().default(false),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      saveMarketplaceAutoReviewSequentialShotOverride(input, authFromCtx(ctx))
    ),

  // Prompt-only repair for a legacy or staged sequential run. This calls the
  // single-shot prompt skill and persists only the selected prompt field; it
  // never submits an image/video provider job or spends media credits.
  generateAutoReviewSequentialShotPrompt: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        stage: z.enum(["image", "video", "summary", "dialogue"]),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      generateMarketplaceAutoReviewSequentialShotPrompt(
        input,
        authFromCtx(ctx),
        { publicUrl: ctx.publicUrl }
      )
    ),

  saveAutoReviewSequentialLanguagePlan: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        summaryLanguage: z.enum(["th", "en"]),
        dialogueLanguage: z.enum(["th", "en"]),
        promptLanguage: z.enum(["th", "en"]),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      saveMarketplaceAutoReviewSequentialLanguagePlan(input, authFromCtx(ctx))
    ),

  editAutoReviewSequentialShotImage: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        instruction: z.string().trim().min(1).max(2000),
        idempotencyKey: z.string().trim().min(8).max(200),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      editMarketplaceAutoReviewSequentialShotImage(
        input,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      )
    ),

  acceptAutoReviewSequentialShotImageEdit: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      acceptMarketplaceAutoReviewSequentialShotImageEdit(
        input,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      )
    ),

  discardAutoReviewSequentialShotImageEdit: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      discardMarketplaceAutoReviewSequentialShotImageEdit(
        input,
        authFromCtx(ctx)
      )
    ),

  // Marketplace spare-image repair — swaps a sequential shot's live frame
  // URL to an already-generated, already-paid-for alternate from a
  // non-selected image-attempt wave (surfaced via `getAutoReviewRun`'s
  // `metadataJson.sequentialShotAlternates`). No provider call, no credit
  // spend. Same ownership/tenant-flag/run-status guard as the neighbouring
  // regenerate/save procedures above.
  selectAutoReviewSequentialShotAlternate: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        attempt: z.number().int().positive().max(20),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      selectMarketplaceAutoReviewSequentialShotAlternate(
        input,
        authFromCtx(ctx)
      )
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

  // Marketplace text-plan review gate (planning/marketplace-storyboard-text-
  // gate) — "ยืนยัน สร้างภาพ". Releases the mandatory awaiting_plan_review
  // hold and lets the existing background advance loop schedule the first
  // image attempt. Same ownership/tenant guard as the neighbouring
  // regenerate/save/select procedures above (via `reloadRun` inside the
  // service function); the media `userToken` is required to actually submit
  // once released, so runtime is threaded through like `advanceAutoReviewRun`.
  approveAutoReviewPlanReview: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      approveMarketplaceAutoReviewPlanReview(
        input,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      )
    ),

  startAutoReviewDraftQualityQc: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        maxImprovementRounds: z.number().int().min(0).max(5).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      startMarketplaceAutoReviewDraftQualityQc(input, authFromCtx(ctx))
    ),

  startAutoReviewDraftQualityQcRepair: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      startMarketplaceAutoReviewDraftQualityQcRepair(
        input,
        authFromCtx(ctx),
      )
    ),

  selectAutoReviewDraftQualityQcRepair: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      selectMarketplaceAutoReviewDraftQualityQcRepair(
        input,
        authFromCtx(ctx),
      )
    ),

  // Marketplace text-plan review gate — "ให้ AI ร่างใหม่". Text cost only:
  // re-authors concept_story + prompt_plan (see
  // `requestMarketplaceAutoReviewPlanRedraft` for why prompt_plan cannot be
  // re-run standalone), folds `notes` in as correction guidance, then
  // re-enters the same hold with the fresh plan. Never touches
  // image_generation or image credits.
  requestAutoReviewPlanRedraft: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        notes: z.string().trim().max(2000).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      requestMarketplaceAutoReviewPlanRedraft(
        input,
        authFromCtx(ctx),
        autoReviewRuntimeFromCtx(ctx)
      )
    ),

  // Marketplace text-plan review gate — inline per-shot DIALOGUE correction
  // while the run holds at `awaiting_plan_review` (design item 2,
  // planning/marketplace-storyboard-text-gate/plan.md). Edits
  // `metadataJson.sequentialStoryboard.shots[shotId-1].dialogue` directly —
  // NOT `shotOverrides` (that slot is the separate POST-approval per-shot
  // regeneration mechanism and is unreachable while this gate holds). Same
  // ownership/precondition guard as `approveAutoReviewPlanReview` /
  // `requestAutoReviewPlanRedraft` (`assertMarketplaceAutoReviewAwaitingPlan
  // Review`, checked inside the service function), so an edit after
  // approval — or on a non-sequential run — fails closed with BAD_REQUEST.
  // No provider/credit call, so — like `saveAutoReviewSequentialShotOverride`
  // — no runtime threading is needed.
  updateAutoReviewPlanShotDialogue: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        dialogue: z.string().trim().max(2000),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      updateMarketplaceAutoReviewPlanShotDialogue(input, authFromCtx(ctx))
    ),

  getStagedAutoReviewCheckpointState: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .output(z.any())
    .query(async ({ input, ctx }) =>
      getStagedAutoReviewCheckpointState(input.runId, authFromCtx(ctx))
    ),

  approveStagedAutoReviewCheckpoint: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        checkpointId: z.string().min(1).max(128),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        expected: z.object({
          revision: z.number().int().positive(),
          contentHash: z.string().min(1).max(256),
          model: z.string().min(1).max(160),
          provider: z.string().min(1).max(160),
          safetyVerdict: z.string().min(1).max(160),
          referenceManifestHash: z.string().min(1).max(256),
          estimatedCredits: z.number().finite().nonnegative(),
        }),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      approveStagedAutoReviewCheckpoint({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  rejectStagedAutoReviewCheckpoint: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        checkpointId: z.string().min(1).max(128),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        reasonCode: z.string().min(1).max(160),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      rejectStagedAutoReviewCheckpoint({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  editStagedAutoReviewShot: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9).optional(),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        storySummary: z.string().trim().max(600).optional(),
        dialogue: z.string().trim().max(320).optional(),
        imagePrompt: z.string().trim().max(4000).optional(),
        videoPrompt: z.string().trim().max(2000).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      editStagedAutoReviewShot({ ...input, auth: authFromCtx(ctx) })
    ),

  generateStagedAutoReviewShotPrompt: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        stage: z.enum(["image", "video"]),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        // New capability — optional free-text per-shot instruction for
        // AI-assisted prompt adjustment. Frontend dialog wiring is a
        // separate task; the backend accepts and threads it through now.
        instruction: z.string().trim().max(2000).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      generateStagedAutoReviewShotPrompt({
        ...input,
        auth: authFromCtx(ctx),
        runtime: { publicUrl: ctx.publicUrl },
      })
    ),

  acceptStagedAutoReviewImage: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        checkpointId: z.string().min(1).max(128),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        expected: z.object({
          revision: z.number().int().positive(),
          contentHash: z.string().min(1).max(256),
          model: z.string().min(1).max(160),
          provider: z.string().min(1).max(160),
          safetyVerdict: z.string().min(1).max(160),
          referenceManifestHash: z.string().min(1).max(256),
          estimatedCredits: z.number().finite().nonnegative(),
        }),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      acceptStagedAutoReviewImage({ ...input, auth: authFromCtx(ctx) })
    ),

  retryStagedAutoReviewShot: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().min(1).max(9),
        stage: z.enum(["image", "video"]),
        autoApprove: z.boolean().optional(),
        model: z.string().trim().min(1).max(200).optional(),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      retryStagedAutoReviewShot({ ...input, auth: authFromCtx(ctx) })
    ),

  uploadStagedAutoReviewShotMedia: protectedProcedure
    .input(
      z
        .object({
          runId: z.string().min(1).max(64),
          shotId: z.number().int().min(1).max(9),
          stage: z.enum(["image", "video"]),
          fileName: z.string().min(1).max(255),
          fileType: z.string().min(1).max(100),
          fileBase64: z.string().min(1),
          expectedStateDigest: z.string().min(1).max(256),
          idempotencyKey: z.string().min(8).max(200),
        })
        .refine(
          v =>
            v.stage === "image"
              ? v.fileType.toLowerCase().startsWith("image/")
              : v.fileType.toLowerCase().startsWith("video/"),
          {
            message:
              "File type must match the target slot (image/* for the image slot, video/* for the video slot)",
          }
        )
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      // Belt-and-suspenders: the zod .refine above already rejects a
      // mismatched file-type/stage combination before this handler runs
      // (BAD_REQUEST via tRPC's own input-validation error), but re-check
      // explicitly so this procedure never depends solely on that refine
      // wording for its safety guarantee.
      const expectedPrefix = input.stage === "image" ? "image/" : "video/";
      if (!input.fileType.toLowerCase().startsWith(expectedPrefix)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            input.stage === "image"
              ? "Only image/* uploads are supported for the image slot"
              : "Only video/* uploads are supported for the video slot",
        });
      }

      const parts = input.fileBase64.split(",", 2);
      const b64 = parts.length === 2 ? parts[1] : input.fileBase64;
      const buf = Buffer.from(b64, "base64");
      const isVideoUpload = input.stage === "video";
      const max = isVideoUpload
        ? GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES
        : GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES;
      if (buf.length > max) {
        const maxMb = Math.round(max / 1024 / 1024);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File too large (max ${maxMb}MB)`,
        });
      }

      // Whitelist allowed extensions (mirrors ai.upload in ../../routers.ts)
      const ALLOWED_EXTENSIONS = new Set([
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "svg",
        "mp4",
        "webm",
        "mov",
        "avi",
      ]);
      const ext = (input.fileName.split(".").pop() || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
      if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File extension .${ext} is not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
        });
      }

      // Validate magic bytes match claimed MIME type (mirrors ai.upload)
      const magicBytes = buf.slice(0, 12);
      const isValidImage =
        (magicBytes[0] === 0xff && magicBytes[1] === 0xd8) || // JPEG
        (magicBytes[0] === 0x89 && magicBytes[1] === 0x50) || // PNG
        (magicBytes[0] === 0x47 && magicBytes[1] === 0x49) || // GIF
        (magicBytes[0] === 0x52 &&
          magicBytes[1] === 0x49 &&
          magicBytes[2] === 0x46 &&
          magicBytes[3] === 0x46) || // WEBP (RIFF)
        magicBytes[0] === 0x3c; // SVG (<)
      const isValidVideo =
        (magicBytes[4] === 0x66 &&
          magicBytes[5] === 0x74 &&
          magicBytes[6] === 0x79 &&
          magicBytes[7] === 0x70) || // MP4/MOV (ftyp)
        (magicBytes[0] === 0x1a &&
          magicBytes[1] === 0x45 &&
          magicBytes[2] === 0xdf &&
          magicBytes[3] === 0xa3) || // WEBM (EBML)
        (magicBytes[0] === 0x52 &&
          magicBytes[1] === 0x49 &&
          magicBytes[2] === 0x46 &&
          magicBytes[3] === 0x46); // AVI (RIFF)

      if (input.stage === "image" && !isValidImage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File content does not match claimed image type",
        });
      }
      if (input.stage === "video" && !isValidVideo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File content does not match claimed video type",
        });
      }

      const auth = authFromCtx(ctx);
      const id = nanoid(10);
      const key = `marketplace-auto-review/${input.runId}/manual-uploads/${input.shotId}-${input.stage}-${id}${ext ? "." + ext : ""}`;
      await assertR2StorageActive();
      const { url } = await storagePut(key, buf, input.fileType);

      return uploadStagedAutoReviewShotMedia({
        runId: input.runId,
        shotId: input.shotId,
        stage: input.stage,
        url,
        expectedStateDigest: input.expectedStateDigest,
        idempotencyKey: input.idempotencyKey,
        auth,
      });
    }),

  editStagedAutoReviewAudioPlan: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        text: z.string().trim().min(1).max(4000),
        language: z.string().trim().min(1).max(12).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      editStagedAutoReviewAudioPlan({ ...input, auth: authFromCtx(ctx) })
    ),

  redraftStagedAutoReviewPlan: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        notes: z.string().trim().max(1200).optional(),
        model: z.string().trim().max(128).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      redraftStagedAutoReviewPlan({ ...input, auth: authFromCtx(ctx) })
    ),

  editStagedAutoReviewFinalAssembly: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        shotOrder: z.array(z.number().int().min(1).max(9)).length(9),
        includeAudio: z.boolean(),
        subtitlePresetId: HyperframesFinalCompositeSubtitlePresetSchema.optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      editStagedAutoReviewFinalAssembly({ ...input, auth: authFromCtx(ctx) })
    ),

  retryStagedAutoReviewAudioPlan: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      retryStagedAutoReviewAudioPlan({ ...input, auth: authFromCtx(ctx) })
    ),

  /**
   * Drag-and-drop / file-picker upload for the final-render image overlay.
   * Returns ONLY a storage URL — it deliberately does not touch run metadata,
   * so the client drops the URL into the settings form and the user still has
   * to press "บันทึกการตั้งค่า render". Mirrors
   * `uploadStagedAutoReviewShotMedia`'s validation (size cap, extension
   * allowlist, magic-byte check) rather than trusting the browser's
   * `fileType`.
   */
  uploadStagedAutoReviewOverlayImage: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        fileName: z.string().min(1).max(255),
        fileType: z.string().min(1).max(100),
        fileBase64: z.string().min(1),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) => {
      if (!input.fileType.toLowerCase().startsWith("image/")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "overlay_upload_not_an_image",
        });
      }
      const parts = input.fileBase64.split(",", 2);
      const buf = Buffer.from(
        parts.length === 2 ? parts[1] : input.fileBase64,
        "base64"
      );
      if (buf.length > GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `overlay_upload_too_large:${Math.round(GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024)}MB`,
        });
      }
      const ext = (input.fileName.split(".").pop() || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .toLowerCase();
      const ALLOWED = new Set(["jpg", "jpeg", "png", "webp", "svg"]);
      if (ext && !ALLOWED.has(ext)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `overlay_upload_bad_extension:${ext}`,
        });
      }
      const magic = buf.slice(0, 12);
      const isValidImage =
        (magic[0] === 0xff && magic[1] === 0xd8) || // JPEG
        (magic[0] === 0x89 && magic[1] === 0x50) || // PNG
        (magic[0] === 0x52 &&
          magic[1] === 0x49 &&
          magic[2] === 0x46 &&
          magic[3] === 0x46) || // WEBP (RIFF)
        magic[0] === 0x3c; // SVG (<)
      if (!isValidImage) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "overlay_upload_content_mismatch",
        });
      }
      const key = `marketplace-auto-review/${input.runId}/overlay/${nanoid(10)}${ext ? "." + ext : ""}`;
      await assertR2StorageActive();
      const { url } = await storagePut(key, buf, input.fileType);
      return { url };
    }),

  updateStagedAutoReviewFinalRenderSettings: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
        settings: z.object({
          subtitlePresetId:
            HyperframesFinalCompositeSubtitlePresetSchema.optional(),
          aiDisclosureEnabled: z.boolean().optional(),
          overlayText: z
            .object({
              content: z.string().max(2000),
              position: z.enum(STAGED_OVERLAY_ANCHORS).default("top_center"),
              fontSizePx: z.number().int().min(12).max(200).default(56),
              color: z.string().trim().min(1).max(32).default("#ffffff"),
              fontWeight: z.enum(["normal", "bold"]).default("bold"),
              opacity: z.number().min(0.05).max(1).default(1),
            })
            .nullable()
            .optional(),
          overlayImage: z
            .object({
              url: z.string().trim().max(4096),
              position: z.enum(STAGED_OVERLAY_ANCHORS).default("bottom_right"),
              widthPercent: z.number().min(5).max(60).default(22),
              opacity: z.number().min(0.05).max(1).default(1),
              fit: z.enum(["contain", "cover"]).default("contain"),
            })
            .nullable()
            .optional(),
        }),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      updateStagedAutoReviewFinalRenderSettings({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  submitStagedAutoReviewFinalRender: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      submitStagedAutoReviewFinalRender({
        runId: input.runId,
        auth: authFromCtx(ctx),
        runtime: { publicUrl: (await getAppRuntimeConfig()).publicUrl },
      })
    ),

  retryStagedAutoReviewFinalAssembly: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        expectedStateDigest: z.string().min(1).max(256),
        idempotencyKey: z.string().min(8).max(200),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      retryStagedAutoReviewFinalAssembly({ ...input, auth: authFromCtx(ctx) })
    ),

  /**
   * Per-shot cast presence + look overrides
   * (`planning/marketplace-four-character-cast/plan.md` §6). Free, no credits —
   * a plain data patch on one shot's persisted state, mirroring Vertical
   * Drama's own `setShotCharacterReference`. Both fields are optional so the
   * caller can change presence and looks independently.
   */
  updateStagedAutoReviewShotCast: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        shotId: z.number().int().positive(),
        castInShot: z.array(z.string().min(1).max(32)).max(16).optional(),
        castLooks: z
          .record(
            z.object({
              url: z.string().min(1).max(2048),
              portraitAssetId: z.string().max(64).optional(),
              vdCharacterId: z.string().max(64).optional(),
              variantLabel: z.string().max(64).optional(),
            })
          )
          .optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      updateStagedAutoReviewShotCast({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  updateStagedAutoReviewReferenceManifest: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(64),
        referenceManifest: z.array(
          z.object({
            index: z.number().optional(),
            url: z.string().min(1),
            role: z.string().optional(),
            label: z.string().optional(),
            active: z.boolean().optional(),
            characterName: z.string().max(120).optional(),
            characterRole: z.enum(MARKETPLACE_CHARACTER_CAST_ROLES).optional(),
            vdCharacterId: z.string().max(64).optional(),
            // Look-family root + label, so a per-shot look switcher can find a
            // character's sibling looks (planning/marketplace-four-character-
            // cast/plan.md §4). Absent for uploaded characters, which have no
            // looks at all.
            vdBaseCharacterId: z.string().max(64).optional(),
            variantLabel: z.string().max(64).optional(),
            vdSeriesId: z.string().max(64).optional(),
            portraitAssetId: z.string().max(64).optional(),
            ageRange: z.string().max(64).nullable().optional(),
            depictsMinor: z.boolean().optional(),
            descriptor: z.string().max(400).optional(),
          })
        ),
      })
    )
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      updateStagedAutoReviewReferenceManifest({
        ...input,
        auth: authFromCtx(ctx),
      })
    ),

  listDramaCharactersForPicker: protectedProcedure
    .input(z.object({ seriesId: z.string().min(1).max(64) }))
    .output(z.any())
    .query(async ({ input, ctx }) =>
      listDramaSeriesCharactersForPicker(
        authFromCtx(ctx) as { userId: number; tenantId: string },
        { seriesId: input.seriesId }
      )
    ),

  /**
   * Delete one Auto Review job. Ownership-scoped; dependent rows cascade in
   * the schema. Media already generated stays in the user's Media library.
   */
  deleteAutoReviewRun: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(64) }))
    .output(z.any())
    .mutation(async ({ input, ctx }) =>
      deleteMarketplaceAutoReviewRun(input.runId, authFromCtx(ctx))
    ),

  deleteProduct: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) =>
      deleteMarketplaceProduct(input.productId, authFromCtx(ctx))
    ),

  listQualityPlanningModels: protectedProcedure.query(async () => {
    const { getDb } = await import("../db");
    const { eq, inArray } = await import("drizzle-orm");
    const { llmProviders, modelProviderMap } = await import("../../drizzle/schema");
    const { loadEnabledLlmModelRows } = await import("../services/enabledLlmModels");
    const { selectQualityLargeContextEligibleModels } = await import(
      "../services/verticalDramaImproveScript"
    );

    const db = await getDb();
    if (!db) return [];

    const rows = await loadEnabledLlmModelRows({ autoSelectionOnly: true });
    const eligible = selectQualityLargeContextEligibleModels(rows);
    if (eligible.length === 0) {
      return [] as Array<{ modelId: string; label: string }>;
    }

    type QualityPlanningModelLabelRow = {
      modelId: string;
      modelName: string;
      providerName: string;
      providerDisplayName: string;
    };
    const modelIds = eligible.map(row => row.modelId);
    const labelRows: QualityPlanningModelLabelRow[] = await db
      .select({
        modelId: modelProviderMap.modelId,
        modelName: modelProviderMap.modelName,
        providerName: llmProviders.providerName,
        providerDisplayName: llmProviders.displayName,
      })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(inArray(modelProviderMap.modelId, modelIds));

    const labelByModelId = new Map<string, QualityPlanningModelLabelRow>(
      labelRows.map(row => [row.modelId, row])
    );

    return eligible.map(row => {
      const labelRow = labelByModelId.get(row.modelId);
      const providerLabel =
        labelRow?.providerDisplayName ||
        labelRow?.providerName ||
        row.providerName;
      const modelLabel = labelRow?.modelName || row.modelId;
      return {
        modelId: row.modelId,
        label: `${providerLabel} — ${modelLabel}`,
      };
    });
  }),
});
