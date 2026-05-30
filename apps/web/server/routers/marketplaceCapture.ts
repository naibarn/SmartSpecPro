import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
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
  deleteMarketplaceProduct,
  getMarketplaceProductWithAccess,
  getMarketplaceShareSettings,
  listMarketplaceProductImagesForMediaStudio,
  listMarketplaceProductsWithAccess,
  removeMarketplaceProductImage,
  saveMarketplaceShareSetting,
} from "../services/marketplaceProductService";
import {
  applyMarketplaceClaimResolution,
  buildBasicStorytellingHandoffFromCapture,
  generateMarketplaceServerInsight,
  getMarketplaceInsightForUser,
  listMarketplaceInsightsByCapture,
  listMarketplaceInsightsByProduct,
  syncMarketplaceInsight,
} from "../services/marketplaceInsightService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { analyzeMarketplaceCaptureSchema, marketplaceCaptureInsightSyncSchema, marketplaceClaimResolutionSchema, marketplaceConfirmProductSchema, marketplaceServerInsightGenerationSchema } from "@shared/marketplaceCapture";

function authFromCtx(ctx: any) {
  const userId = Number(ctx.user?.id);
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId) ?? undefined;
  return { userId, tenantId };
}

export const marketplaceCaptureRouter = router({
  adminOverview: adminProcedure
    .query(async () => getMarketplaceCaptureAdminOverview()),

  issueExtensionToken: protectedProcedure
    .input(z.object({
      origin: z.string().max(300).optional(),
      extensionId: z.string().max(160).optional(),
      deviceId: z.string().max(80).optional(),
    }).optional().default({}))
    .mutation(async ({ input, ctx }) => {
      return issueMarketplaceExtensionToken({
        ...authFromCtx(ctx),
        origin: input.origin ?? null,
        extensionId: input.extensionId ?? null,
        deviceId: input.deviceId ?? null,
      });
    }),

  listCaptures: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional().default(30) }).optional().default({}))
    .query(async ({ input, ctx }) => listMarketplaceCapturesForUser(authFromCtx(ctx), input.limit)),

  getCapture: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => getMarketplaceCaptureForUser(input.captureId, authFromCtx(ctx))),

  listInsightsByCapture: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => listMarketplaceInsightsByCapture(input.captureId, authFromCtx(ctx))),

  listInsightsByProduct: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => listMarketplaceInsightsByProduct(input.productId, authFromCtx(ctx))),

  getInsight: protectedProcedure
    .input(z.object({ insightId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => getMarketplaceInsightForUser(input.insightId, authFromCtx(ctx))),

  syncInsight: protectedProcedure
    .input(marketplaceCaptureInsightSyncSchema)
    .mutation(async ({ input, ctx }) => syncMarketplaceInsight(input, authFromCtx(ctx))),

  generateServerInsight: protectedProcedure
    .input(marketplaceServerInsightGenerationSchema)
    .mutation(async ({ input, ctx }) => generateMarketplaceServerInsight(input, authFromCtx(ctx))),

  resolveInsightClaim: protectedProcedure
    .input(marketplaceClaimResolutionSchema)
    .mutation(async ({ input, ctx }) => applyMarketplaceClaimResolution(input, authFromCtx(ctx))),

  getStorytellingHandoff: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => {
      const auth = authFromCtx(ctx);
      const insights = await listMarketplaceInsightsByCapture(input.captureId, auth);
      const syncedHandoff = insights.find((insight) => insight.insightType === "storytelling_handoff");
      return syncedHandoff?.payloadJson ?? buildBasicStorytellingHandoffFromCapture(input.captureId, auth);
    }),

  analyzeCapture: protectedProcedure
    .input(z.object({
      captureId: z.string().min(1).max(64),
      analyze: analyzeMarketplaceCaptureSchema.optional().default({}),
    }))
    .mutation(async ({ input, ctx }) => analyzeMarketplaceCapture(input.captureId, input.analyze, authFromCtx(ctx))),

  confirmCapture: protectedProcedure
    .input(z.object({
      captureId: z.string().min(1).max(64),
      data: marketplaceConfirmProductSchema,
    }))
    .mutation(async ({ input, ctx }) => confirmMarketplaceCapture(input.captureId, input.data, authFromCtx(ctx))),

  saveDraftEdits: protectedProcedure
    .input(z.object({
      captureId: z.string().min(1).max(64),
      data: marketplaceConfirmProductSchema,
    }))
    .mutation(async ({ input, ctx }) => saveMarketplaceCaptureDraftEdits(input.captureId, input.data, authFromCtx(ctx))),

  discardCapture: protectedProcedure
    .input(z.object({ captureId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => discardMarketplaceCapture(input.captureId, authFromCtx(ctx))),

  listProducts: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).optional().default(30),
      ownerOnly: z.boolean().optional().default(false),
      platform: z.enum(["all", "shopee", "tiktok_shop"]).optional().default("all"),
      query: z.string().trim().max(160).optional(),
    }).optional().default({}))
    .query(async ({ input, ctx }) => listMarketplaceProductsWithAccess(authFromCtx(ctx), input)),

  listProductImages: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(30).optional().default(30),
      cursor: z.string().optional().nullable(),
      ownerOnly: z.boolean().optional().default(false),
      platform: z.enum(["all", "shopee", "tiktok_shop"]).optional().default("all"),
      query: z.string().trim().max(160).optional(),
      productId: z.string().min(1).max(64).optional().nullable(),
    }).optional().default({}))
    .query(async ({ input, ctx }) => listMarketplaceProductImagesForMediaStudio(authFromCtx(ctx), input)),

  getShareSettings: protectedProcedure
    .query(async ({ ctx }) => getMarketplaceShareSettings(authFromCtx(ctx))),

  saveShareSetting: protectedProcedure
    .input(z.object({
      platform: z.enum(["shopee", "tiktok_shop"]),
      enabled: z.boolean().default(true),
      groupIds: z.array(z.number().int().positive()).max(20).default([]),
      permission: z.enum(["read", "read_update"]).default("read_update"),
    }))
    .mutation(async ({ input, ctx }) => saveMarketplaceShareSetting(input, authFromCtx(ctx))),

  listCandidateBatches: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional().default(30) }).optional().default({}))
    .query(async ({ input, ctx }) => listMarketplaceCandidateBatchesForUser(authFromCtx(ctx), input.limit)),

  getCandidateBatch: protectedProcedure
    .input(z.object({ batchId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => getMarketplaceCandidateBatchForUser(input.batchId, authFromCtx(ctx))),

  getProduct: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .query(async ({ input, ctx }) => getMarketplaceProductWithAccess(input.productId, authFromCtx(ctx))),

  addProductImageFromUrl: protectedProcedure
    .input(z.object({
      productId: z.string().min(1).max(64),
      url: z.string().min(1).max(4096),
      type: z.enum(["main", "description", "review", "related_excluded"]).optional().default("main"),
      title: z.string().max(255).optional().nullable(),
      source: z.string().max(128).optional().nullable(),
      originalSourceUrl: z.string().max(4096).optional().nullable(),
      metadata: z.record(z.unknown()).optional(),
    }))
    .mutation(async ({ input, ctx }) => addMarketplaceProductImageFromUrl(input, authFromCtx(ctx))),

  removeProductImage: protectedProcedure
    .input(z.object({
      productId: z.string().min(1).max(64),
      imageId: z.string().min(1).max(64),
    }))
    .mutation(async ({ input, ctx }) => removeMarketplaceProductImage(input, authFromCtx(ctx))),

  deleteProduct: protectedProcedure
    .input(z.object({ productId: z.string().min(1).max(64) }))
    .mutation(async ({ input, ctx }) => deleteMarketplaceProduct(input.productId, authFromCtx(ctx))),
});
