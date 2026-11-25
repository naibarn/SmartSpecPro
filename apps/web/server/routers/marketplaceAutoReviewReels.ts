import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AUTO_REVIEW_PUBLISH_HASHTAG, AUTO_REVIEW_PUBLISH_MAX_HASHTAGS } from "../../shared/marketplaceAutoReview/publishingHashtags";

import { protectedProcedure, router } from "../_core/trpc";
import { socialPosts } from "../../drizzle/schema";
import { getTenantFeatureFlag } from "../services/featureFlags";
import {
  getMarketplaceAutoReviewReelsReadiness,
  reconcileMarketplaceAutoReviewReelsPublication,
  resumeMarketplaceAutoReviewReelsUpload,
  startMarketplaceAutoReviewReelsPublish,
} from "../services/marketplaceAutoReviewReelsService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getDb } from "../db";

const reelsProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
  if (!await getTenantFeatureFlag("META_CHANNELS_ENABLED", tenantId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Meta Channels are disabled for this tenant" });
  }
  return next({ ctx: { ...ctx, tenantId } });
});

const snapshotSchema = z.object({
  caption: z.string().trim().max(2000),
  hashtags: z.array(z.string().trim().regex(AUTO_REVIEW_PUBLISH_HASHTAG)).max(AUTO_REVIEW_PUBLISH_MAX_HASHTAGS),
  affiliateMode: z.enum(["description", "first_comment", "manual_native", "none"]),
  aiGenerated: z.boolean(),
  commercialDisclosure: z.string().trim().max(500),
  allowNoAffiliate: z.boolean().optional(),
}).strict();

export const marketplaceAutoReviewReelsRouter = router({
  readiness: reelsProcedure.input(z.object({ runId: z.string().trim().min(1).max(64) }).strict())
    .query(({ ctx, input }) => getMarketplaceAutoReviewReelsReadiness({ tenantId: ctx.tenantId, userId: ctx.user.id, runId: input.runId })),

  publish: reelsProcedure.input(z.object({
    runId: z.string().trim().min(1).max(64),
    pageId: z.number().int().positive(),
    snapshot: snapshotSchema,
  }).strict()).mutation(({ ctx, input }) => startMarketplaceAutoReviewReelsPublish({
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    runId: input.runId,
    pageId: input.pageId,
    snapshot: input.snapshot,
  })),

  reconcile: reelsProcedure.input(z.object({ postId: z.number().int().positive() }).strict())
    .mutation(({ ctx, input }) => reconcileMarketplaceAutoReviewReelsPublication({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      postId: input.postId,
    })),

  resume: reelsProcedure.input(z.object({ postId: z.number().int().positive() }).strict())
    .mutation(({ ctx, input }) => resumeMarketplaceAutoReviewReelsUpload({
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      postId: input.postId,
    })),

  history: reelsProcedure.input(z.object({ runId: z.string().trim().min(1).max(64) }).strict())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const rows = await db.select({
        id: socialPosts.id,
        status: socialPosts.status,
        contentText: socialPosts.contentText,
        providerPostId: socialPosts.providerPostId,
        publishedAt: socialPosts.publishedAt,
        errorMessage: socialPosts.errorMessage,
        metadata: socialPosts.metadata,
        createdAt: socialPosts.createdAt,
        updatedAt: socialPosts.updatedAt,
      }).from(socialPosts).where(and(
        eq(socialPosts.tenantId, ctx.tenantId),
        eq(socialPosts.createdByUserId, ctx.user.id),
        sql`${socialPosts.metadata}->>'source' = 'marketplace_auto_review_reels'`,
        sql`${socialPosts.metadata}->>'autoReviewRunId' = ${input.runId}`,
      )).orderBy(desc(socialPosts.createdAt)).limit(20);
      return rows.map(row => {
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
        return {
          id: row.id,
          status: metadata.videoPublicationStatus ?? row.status,
          affiliateLinkStatus: metadata.affiliateLinkStatus ?? "unknown",
          commercialDisclosureStatus: metadata.commercialDisclosureStatus ?? "unknown",
          attributionVerificationStatus: metadata.attributionVerificationStatus ?? "unverified",
          providerPostId: row.providerPostId,
          permalink: typeof metadata.permalink === "string" ? metadata.permalink : null,
          canReconcile: typeof metadata.externalVideoId === "string",
          canResume: typeof metadata.uploadUrl === "string" && typeof metadata.externalVideoId === "string" && !metadata.finishRequestedAt,
          manualHandoff: metadata.manualHandoff ?? null,
          errorMessage: row.errorMessage,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          publishedAt: row.publishedAt,
        };
      });
    }),
});
