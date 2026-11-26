import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { AUTO_REVIEW_PUBLISH_HASHTAG, AUTO_REVIEW_PUBLISH_MAX_HASHTAGS } from "../../shared/marketplaceAutoReview/publishingHashtags";

import { protectedProcedure, router } from "../_core/trpc";
import { socialPosts, workerJobs } from "../../drizzle/schema";
import { getTenantFeatureFlag } from "../services/featureFlags";
import {
  getMarketplaceAutoReviewPhotoPostReadiness,
  reconcileMarketplaceAutoReviewPhotoPost,
  resolveUnstartedPhotoPublicationStatus,
  startMarketplaceAutoReviewPhotoPost,
  MARKETPLACE_AUTO_REVIEW_PHOTO_POST_JOB_TYPE,
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
    scheduledAt: z.string().datetime().optional(),
    snapshot: publishSnapshotSchema,
  }).strict()).mutation(({ ctx, input }) => startMarketplaceAutoReviewPhotoPost({
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    runId: input.runId,
    pageId: input.pageId,
    scheduledAt: input.scheduledAt,
    snapshot: input.snapshot,
  })),

  reconcile: photoPostPublishProcedure.input(z.object({ postId: z.number().int().positive() }).strict())
    .mutation(({ ctx, input }) => reconcileMarketplaceAutoReviewPhotoPost({ tenantId: ctx.tenantId, userId: ctx.user.id, postId: input.postId })),

  postAffiliateComment: photoPostPublishProcedure.input(z.object({
    postId: z.number().int().positive(),
    confirmNoExistingComment: z.boolean().optional(),
    confirmPendingConfirmation: z.boolean().optional(),
    prepareConfirmation: z.boolean().optional(),
  }).strict())
    .mutation(({ ctx, input }) => postAffiliateCommentOnPublishedAutoReview({ tenantId: ctx.tenantId, userId: ctx.user.id, postId: input.postId, format: "photo_post", confirmNoExistingComment: input.confirmNoExistingComment, confirmPendingConfirmation: input.confirmPendingConfirmation, prepareConfirmation: input.prepareConfirmation })),

  history: tenantPhotoPostProcedure.input(z.object({ runId: z.string().trim().min(1).max(64) }).strict())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const rows = await db.select({
        id: socialPosts.id,
        status: socialPosts.status,
        scheduledAt: socialPosts.scheduledAt,
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
      const postIds = rows.map(row => String(row.id));
      const linkedJobIds = rows.flatMap(row => {
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
        return typeof metadata.publishingWorkerJobId === "string" ? [metadata.publishingWorkerJobId] : [];
      });
      const jobLookup = postIds.length ? await db.select({
        id: workerJobs.id,
        status: workerJobs.status,
        startedAt: workerJobs.startedAt,
        inputPostId: sql<string | null>`${workerJobs.inputJson}->>'postId'`,
      }).from(workerJobs).where(and(
        eq(workerJobs.tenantId, ctx.tenantId),
        eq(workerJobs.requestedByUserId, ctx.user.id),
        eq(workerJobs.jobType, MARKETPLACE_AUTO_REVIEW_PHOTO_POST_JOB_TYPE),
        linkedJobIds.length
          ? or(inArray(workerJobs.id, linkedJobIds), inArray(sql<string>`${workerJobs.inputJson}->>'postId'`, postIds))
          : inArray(sql<string>`${workerJobs.inputJson}->>'postId'`, postIds),
      )).orderBy(desc(workerJobs.createdAt)) : [];
      const jobById = new Map(jobLookup.map(job => [job.id, job]));
      const jobByPostId = new Map<string, typeof jobLookup[number]>();
      for (const job of jobLookup) {
        if (job.inputPostId && !jobByPostId.has(job.inputPostId)) jobByPostId.set(job.inputPostId, job);
      }
      return rows.map(row => {
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
        const linkedJob = typeof metadata.publishingWorkerJobId === "string"
          ? jobById.get(metadata.publishingWorkerJobId) ?? jobByPostId.get(String(row.id))
          : jobByPostId.get(String(row.id));
        const publicationStatus = String(metadata.photoPublicationStatus ?? row.status);
        const recoveredStatus = linkedJob ? resolveUnstartedPhotoPublicationStatus({
          publicationStatus,
          jobStatus: String(linkedJob.status),
          jobStartedAt: linkedJob.startedAt,
          hasExternalPhotoAttempt: Boolean(metadata.photoPublishRequestedAt || metadata.externalPhotoId || publicationStatus === "published"),
        }) : null;
        return {
          id: row.id,
          status: recoveredStatus ?? publicationStatus,
          scheduledAt: row.scheduledAt,
          selectedVariant: metadata.selectedPhotoVariant ?? null,
          affiliateLinkStatus: metadata.affiliateLinkStatus ?? "unknown",
          affiliateCommentStatus: metadata.affiliateCommentStatus ?? null,
          commercialDisclosureStatus: metadata.commercialDisclosureStatus ?? "unknown",
          attributionVerificationStatus: metadata.attributionVerificationStatus ?? "unverified",
          providerPostId: row.providerPostId,
          permalink: typeof metadata.permalink === "string" ? metadata.permalink : null,
          canReconcile: typeof metadata.externalPhotoId === "string",
          manualHandoff: metadata.manualHandoff ?? null,
          errorMessage: recoveredStatus === "failed"
            ? "งานเผยแพร่หมดอายุก่อนเริ่มส่งรูปไป Facebook รูปยังไม่ถูกส่ง และสามารถลองเผยแพร่ใหม่ได้"
            : recoveredStatus === "needs_user_action"
              ? "งานเผยแพร่หยุดหลังอาจเริ่มส่งรูปแล้ว กรุณาตรวจสอบ Facebook ก่อนลองอีกครั้ง"
              : row.errorMessage,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          publishedAt: row.publishedAt,
        };
      });
    }),
});
