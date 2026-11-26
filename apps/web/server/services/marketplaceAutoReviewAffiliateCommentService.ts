import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import {
  marketplaceProductAffiliateLinks,
  socialPages,
  socialPosts,
  socialProviderConnections,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { decrypt } from "./crypto";
import { publishAffiliateCommentOnce } from "./marketplaceAutoReviewAffiliateComment";

type PublicationFormat = "reels" | "photo_post";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function fail(
  code: ConstructorParameters<typeof TRPCError>[0]["code"],
  message: string
): never {
  throw new TRPCError({ code, message });
}

export async function postAffiliateCommentOnPublishedAutoReview(input: {
  tenantId: string;
  userId: number;
  postId: number;
  format: PublicationFormat;
  confirmNoExistingComment?: boolean;
}) {
  const db = await getDb();
  if (!db) fail("INTERNAL_SERVER_ERROR", "Database not available");

  const [row] = await db
    .select({
      post: socialPosts,
      page: socialPages,
      connection: socialProviderConnections,
    })
    .from(socialPosts)
    .innerJoin(socialPages, eq(socialPosts.pageId, socialPages.id))
    .innerJoin(
      socialProviderConnections,
      eq(socialPages.connectionId, socialProviderConnections.id)
    )
    .where(
      and(
        eq(socialPosts.id, input.postId),
        eq(socialPosts.tenantId, input.tenantId),
        eq(socialPosts.createdByUserId, input.userId),
        eq(socialPages.tenantId, input.tenantId),
        eq(socialProviderConnections.tenantId, input.tenantId),
        eq(socialProviderConnections.userId, input.userId)
      )
    )
    .limit(1);
  if (!row) fail("NOT_FOUND", "โพสต์นี้ไม่พร้อมใช้งาน");

  const metadata = record(row.post.metadata);
  const expectedSource =
    input.format === "reels"
      ? "marketplace_auto_review_reels"
      : "marketplace_auto_review_photo_post";
  const snapshot = record(metadata.snapshot);
  if (metadata.source !== expectedSource)
    fail("BAD_REQUEST", "รายการนี้ไม่ใช่โพสต์ Auto Review ที่รองรับ");
  if (row.post.status !== "published" || !row.post.providerPostId)
    fail("PRECONDITION_FAILED", "Facebook ยังไม่ยืนยันโพสต์นี้");
  const retryingUncertain =
    metadata.affiliateCommentStatus === "uncertain" &&
    input.confirmNoExistingComment === true;
  const confirmingPending = metadata.affiliateCommentStatus === "pending_confirmation" &&
    input.confirmPendingConfirmation === true;
  const preparing = input.prepareConfirmation === true;
  if (
    !["none", "first_comment"].includes(String(snapshot.affiliateMode)) ||
    (metadata.affiliateLinkStatus !== "none" && metadata.affiliateLinkStatus !== "pending_first_comment" &&
      !(confirmingPending && metadata.affiliateLinkStatus === "comment_pending_confirmation") &&
      !(preparing && ["comment_permission_missing", "manual_handoff"].includes(String(metadata.affiliateLinkStatus))) &&
      !(retryingUncertain &&
        metadata.affiliateLinkStatus === "comment_outcome_uncertain"))
  ) {
    fail(
      "PRECONDITION_FAILED",
      "โพสต์นี้มีการจัดการ Affiliate Link แล้ว หรือไม่เข้าเงื่อนไขการเพิ่มคอมเมนต์"
    );
  }
  if (metadata.affiliateCommentStatus && !retryingUncertain && !confirmingPending &&
      !(preparing && ["needs_user_action", "comment_permission_missing"].includes(String(metadata.affiliateCommentStatus))))
    fail(
      "PRECONDITION_FAILED",
      "คอมเมนต์ Affiliate สำหรับโพสต์นี้ถูกดำเนินการไปแล้ว กรุณาตรวจสอบสถานะก่อน"
    );

  let affiliateUrl = text(snapshot.affiliateUrl);
  const productId = text(metadata.productId);
  if (!affiliateUrl && productId) {
    const [affiliate] = await db
      .select({ affiliateUrl: marketplaceProductAffiliateLinks.affiliateUrl })
      .from(marketplaceProductAffiliateLinks)
      .where(
        and(
          eq(marketplaceProductAffiliateLinks.productId, productId),
          eq(marketplaceProductAffiliateLinks.userId, input.userId),
          eq(marketplaceProductAffiliateLinks.tenantId, input.tenantId),
          isNotNull(marketplaceProductAffiliateLinks.affiliateUrl),
          sql`length(trim(${marketplaceProductAffiliateLinks.affiliateUrl})) > 0`
        )
      )
      .orderBy(desc(marketplaceProductAffiliateLinks.updatedAt))
      .limit(1);
    affiliateUrl = text(affiliate?.affiliateUrl);
  }
  if (!affiliateUrl)
    fail(
      "PRECONDITION_FAILED",
      "ไม่พบ Affiliate URL ที่บันทึกไว้สำหรับสินค้านี้"
    );
  try {
    const parsed = new URL(affiliateUrl);
    if (
      !["https:", "http:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw new Error("invalid URL");
  } catch {
    fail("PRECONDITION_FAILED", "Affiliate URL ที่บันทึกไว้ไม่ถูกต้อง");
  }

  if (preparing) {
    const pendingMetadata = {
      ...metadata,
      affiliateCommentStatus: "pending_confirmation",
      affiliateCommentQueuedAt: new Date().toISOString(),
      affiliateLinkStatus: "comment_pending_confirmation",
    };
    const [queued] = await db.update(socialPosts).set({ metadata: pendingMetadata, updatedAt: new Date() }).where(and(
      eq(socialPosts.id, input.postId),
      eq(socialPosts.tenantId, input.tenantId),
      eq(socialPosts.createdByUserId, input.userId),
      eq(socialPosts.status, "published"),
      sql`${socialPosts.metadata}->>'affiliateCommentStatus' IS DISTINCT FROM 'published'`,
    )).returning({ id: socialPosts.id });
    if (!queued) fail("PRECONDITION_FAILED", "สถานะคอมเมนต์เปลี่ยนไปแล้ว กรุณาโหลดประวัติใหม่ก่อน");
    return { status: "pending_confirmation", postId: input.postId };
  }

  if (
    row.connection.provider !== "meta" ||
    row.page.status !== "active" ||
    !row.page.selectedForPublishing ||
    !row.page.encryptedPageAccessToken ||
    (row.page.tokenExpiresAt && row.page.tokenExpiresAt.getTime() <= Date.now())
  ) {
    fail(
      "PRECONDITION_FAILED",
      "Facebook Page ไม่พร้อมใช้งาน กรุณาเชื่อมต่อใหม่และเปิดสิทธิ์เผยแพร่"
    );
  }
  const connectionMetadata = record(row.connection.metadata);
  const scopes = Array.isArray(row.connection.grantedScopes)
    ? row.connection.grantedScopes
    : [];
  if (
    row.connection.status !== "active" ||
    connectionMetadata.permissionVerificationStatus !== "verified" ||
    !scopes.includes("pages_manage_engagement")
  ) {
    fail(
      "PRECONDITION_FAILED",
      "Facebook Page ยังไม่มีสิทธิ์ pages_manage_engagement กรุณาเชื่อมต่อเพจใหม่"
    );
  }
  const accessToken = decrypt(row.page.encryptedPageAccessToken);
  if (!accessToken)
    fail(
      "PRECONDITION_FAILED",
      "ไม่พบ token ของ Facebook Page กรุณาเชื่อมต่อเพจใหม่"
    );

  const commentObjectId =
    input.format === "reels"
      ? text(metadata.externalVideoId)
      : row.post.providerPostId;
  if (!commentObjectId)
    fail(
      "PRECONDITION_FAILED",
      "ไม่พบ Video ID ของ Reel สำหรับโพสต์คอมเมนต์ กรุณาตรวจสอบสถานะโพสต์"
    );

  if (retryingUncertain) {
    const retryMetadata = { ...metadata, affiliateLinkStatus: "none" };
    delete retryMetadata.affiliateCommentStatus;
    delete retryMetadata.affiliateCommentRequestedAt;
    const [reset] = await db
      .update(socialPosts)
      .set({ metadata: retryMetadata, updatedAt: new Date() })
      .where(
        and(
          eq(socialPosts.id, input.postId),
          eq(socialPosts.tenantId, input.tenantId),
          eq(socialPosts.createdByUserId, input.userId),
          sql`${socialPosts.metadata}->>'affiliateCommentStatus' = 'uncertain'`
        )
      )
      .returning({ id: socialPosts.id });
    if (!reset)
      fail(
        "PRECONDITION_FAILED",
        "สถานะคอมเมนต์เปลี่ยนไปแล้ว กรุณาโหลดประวัติใหม่ก่อน"
      );
    Object.assign(metadata, retryMetadata);
    delete metadata.affiliateCommentStatus;
    delete metadata.affiliateCommentRequestedAt;
  }

  const nextMetadata = { ...metadata };
  const state = await publishAffiliateCommentOnce({
    metadata,
    pageId: row.page.providerPageId,
    objectId: commentObjectId,
    accessToken,
    affiliateUrl,
    claimRequest: async requestedAt => {
      const [claimed] = await db
        .update(socialPosts)
        .set({
          metadata: {
            ...metadata,
            affiliateCommentStatus: "requesting",
            affiliateCommentRequestedAt: requestedAt,
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(socialPosts.id, input.postId),
            eq(socialPosts.tenantId, input.tenantId),
            eq(socialPosts.createdByUserId, input.userId),
            eq(socialPosts.status, "published"),
            sql`(${socialPosts.metadata}->>'affiliateCommentStatus' IS NULL OR ${socialPosts.metadata}->>'affiliateCommentStatus' = 'pending_confirmation')`,
            sql`${socialPosts.metadata}->'snapshot'->>'affiliateMode' IN ('none', 'first_comment')`,
            sql`${socialPosts.metadata}->>'affiliateLinkStatus' IN ('none', 'pending_first_comment', 'comment_pending_confirmation')`
          )
        )
        .returning({ id: socialPosts.id });
      if (!claimed) return false;
      Object.assign(nextMetadata, {
        affiliateCommentStatus: "requesting",
        affiliateCommentRequestedAt: requestedAt,
      });
      return true;
    },
    persist: async patch => {
      Object.assign(nextMetadata, patch);
      await db
        .update(socialPosts)
        .set({ metadata: nextMetadata, updatedAt: new Date() })
        .where(
          and(
            eq(socialPosts.id, input.postId),
            eq(socialPosts.tenantId, input.tenantId),
            eq(socialPosts.createdByUserId, input.userId)
          )
        );
    },
  });

  return { status: state, postId: input.postId };
}
