import { publishFacebookPageComment } from "./facebookCommentsPublishGateway";

type AffiliateCommentState = "published" | "uncertain" | "not_applicable";

export async function queueAffiliateCommentForConfirmation(input: {
  metadata: Record<string, unknown>;
  affiliateUrl: string | null;
  persist: (patch: Record<string, unknown>) => Promise<void>;
}) {
  if (!input.affiliateUrl) return "not_applicable" as const;
  if (input.metadata.affiliateCommentStatus === "published") return "published" as const;
  if (input.metadata.affiliateCommentStatus === "pending_confirmation") return "pending_confirmation" as const;
  if (input.metadata.affiliateCommentStatus === "requesting" || input.metadata.affiliateCommentStatus === "uncertain") return "uncertain" as const;
  await input.persist({
    affiliateCommentStatus: "pending_confirmation",
    affiliateCommentQueuedAt: new Date().toISOString(),
    affiliateLinkStatus: "comment_pending_confirmation",
  });
  return "pending_confirmation" as const;
}

export async function publishAffiliateCommentOnce(input: {
  metadata: Record<string, unknown>;
  pageId: string;
  objectId: string | null;
  accessToken: string;
  affiliateUrl: string | null;
  claimRequest?: (requestedAt: string) => Promise<boolean>;
  publishComment?: typeof publishFacebookPageComment;
  persist: (patch: Record<string, unknown>) => Promise<void>;
}): Promise<AffiliateCommentState> {
  if (!input.affiliateUrl) return "not_applicable";
  const state = input.metadata.affiliateCommentStatus;
  if (state === "published") return "published";
  if (state === "requesting" || state === "uncertain" || state === "needs_user_action") return "uncertain";
  if (!input.objectId) {
    await input.persist({ affiliateCommentStatus: "needs_user_action", affiliateLinkStatus: "comment_target_missing" });
    return "uncertain";
  }

  const requestedAt = new Date().toISOString();
  if (input.claimRequest) {
    if (!await input.claimRequest(requestedAt)) return "uncertain";
  } else {
    await input.persist({ affiliateCommentStatus: "requesting", affiliateCommentRequestedAt: requestedAt });
  }
  try {
    const result = await (input.publishComment ?? publishFacebookPageComment)({
      pageId: input.pageId,
      objectId: input.objectId,
      accessToken: input.accessToken,
      message: input.affiliateUrl,
    });
    if (!result.providerCommentId) {
      await input.persist({ affiliateCommentStatus: "uncertain", affiliateLinkStatus: "comment_outcome_uncertain" });
      return "uncertain";
    }
    await input.persist({ affiliateCommentStatus: "published", affiliateCommentId: result.providerCommentId, affiliateCommentPublishedAt: new Date().toISOString(), affiliateLinkStatus: "included_in_first_comment" });
    return "published";
  } catch {
    await input.persist({ affiliateCommentStatus: "uncertain", affiliateLinkStatus: "comment_outcome_uncertain" });
    return "uncertain";
  }
}
