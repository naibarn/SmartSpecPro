import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AUTO_REVIEW_PUBLISH_HASHTAG, AUTO_REVIEW_PUBLISH_MAX_HASHTAGS } from "../../shared/marketplaceAutoReview/publishingHashtags";

import { protectedProcedure, router } from "../_core/trpc";
import { socialPosts } from "../../drizzle/schema";
import { getTenantFeatureFlag } from "../services/featureFlags";
import {
  getMarketplaceAutoReviewPhotoPostReadiness,
  reconcileMarketplaceAutoReviewPhotoPost,
  startMarketplaceAutoReviewPhotoPost,
} from "../services/marketplaceAutoReviewPhotoPostService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getDb } from "../db";
import { postAffiliateCommentOnPublishedAutoReview } from "../services/marketplaceAutoReviewAffiliateCommentService";

const tenantPhotoPostProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
  return next({ ctx: { ...ctx, tenantId } });
});

const photoPostPublishProcedure = tenantPhotoPostProcedure.use(async ({ ctx, next }) => {
  if (!await getTenantFeatureFlag("META_CHANNELS_ENABLED", ctx.tenantId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Meta Channels are disabled for this tenant" });
  }
  return next({ ctx });
});

const publishSnapshotSchema = z.object({
  variant: z.enum(["caption_source", "character_reference", "product_reference"]),
  caption: z.string().trim().max(2000),
  hashtags: z.array(z.string().trim().regex(AUTO_REVIEW_PUBLISH_HASHTAG)).max(AUTO_REVIEW_PUBLISH_MAX_HASHTAGS),
  affiliateMode: z.enum(["description", "first_comment", "manual_native", "none"]),
  commercialDisclosure: z.string().trim().max(500).default(""),
  allowNoAffiliate: z.boolean().optional(),
}).strict();

export const marketplaceAutoReviewPhotoPostsRouter = router({
  readiness: tenantPhotoPostProcedure.input(z.object({ runId: z.string().trim().min(1).max(64) }).strict())
    .query(async ({ ctx, input }) => ({
      ...await getMarketplaceAutoReviewPhotoPostReadiness({ tenantId: ctx.tenantId, userId: ctx.user.id, runId: input.runId }),
      featureEnabled: await getTenantFeatureFlag("META_CHANNELS_ENABLED", ctx.tenantId),
    })),

  publish: photoPostPublishProcedure.input(z.object({
    runId: z.string().trim().min(1).max(64),
    pageId: z.number().int().positive(),
    snapshot: publishSnapshotSchema,
  }).strict()).mutation(({ ctx, input }) => startMarketplaceAutoReviewPhotoPost({
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    runId: input.runId,
    pageId: input.pageId,
    snapshot: input.snapshot,
  })),

  reconcile: photoPostPublishProcedure.input(z.object({ postId: z.number().int().positive() }).strict())
    .mutation(({ ctx, input }) => reconcileMarketplaceAutoReviewPhotoPost({ tenantId: ctx.tenantId, userId: ctx.user.id, postId: input.postId })),

  postAffiliateComment: photoPostPublishProcedure.input(z.object({ postId: z.number().int().positive() }).strict())
    .mutation(({ ctx, input }) => postAffiliateCommentOnPublishedAutoReview({ tenantId: ctx.tenantId, userId: ctx.user.id, postId: input.postId, format: "photo_post" })),

  history: tenantPhotoPostProcedure.input(z.object({ runId: z.string().trim().min(1).max(64) }).strict())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const rows = await db.select({
        id: socialPosts.id,
        status: socialPosts.status,
        providerPostId: socialPosts.providerPostId,
        publishedAt: socialPosts.publishedAt,
        errorMessage: socialPosts.errorMessage,
        metadata: socialPosts.metadata,
        createdAt: socialPosts.createdAt,
        updatedAt: socialPosts.updatedAt,
      }).from(socialPosts).where(and(
        eq(socialPosts.tenantId, ctx.tenantId),
        eq(socialPosts.createdByUserId, ctx.user.id),
        sql`${socialPosts.metadata}->>'source' = 'marketplace_auto_review_photo_post'`,
        sql`${socialPosts.metadata}->>'autoReviewRunId' = ${input.runId}`,
      )).orderBy(desc(socialPosts.createdAt)).limit(20);
      return rows.map(row => {
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
        return {
          id: row.id,
          status: metadata.photoPublicationStatus ?? row.status,
          selectedVariant: metadata.selectedPhotoVariant ?? null,
          affiliateLinkStatus: metadata.affiliateLinkStatus ?? "unknown",
          affiliateCommentStatus: metadata.affiliateCommentStatus ?? null,
          commercialDisclosureStatus: metadata.commercialDisclosureStatus ?? "unknown",
          attributionVerificationStatus: metadata.attributionVerificationStatus ?? "unverified",
          providerPostId: row.providerPostId,
          permalink: typeof metadata.permalink === "string" ? metadata.permalink : null,
          canReconcile: typeof metadata.externalPhotoId === "string",
          manualHandoff: metadata.manualHandoff ?? null,
          errorMessage: row.errorMessage,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          publishedAt: row.publishedAt,
        };
      });
    }),
});
