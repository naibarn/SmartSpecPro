import { describe, expect, it, vi } from "vitest";

import { publishAffiliateCommentOnce } from "../marketplaceAutoReviewAffiliateComment";

describe("publishAffiliateCommentOnce", () => {
  it("publishes the affiliate URL once and records the Meta comment id", async () => {
    const metadata: Record<string, unknown> = {};
    const publishComment = vi.fn().mockResolvedValue({ providerCommentId: "comment-1" });

    const result = await publishAffiliateCommentOnce({
      metadata,
      pageId: "123",
      objectId: "123_456",
      accessToken: "token",
      affiliateUrl: "https://example.com/item",
      publishComment,
      persist: async patch => { Object.assign(metadata, patch); },
    });

    expect(result).toBe("published");
    expect(publishComment).toHaveBeenCalledOnce();
    expect(metadata).toMatchObject({ affiliateCommentStatus: "published", affiliateCommentId: "comment-1", affiliateLinkStatus: "included_in_first_comment" });
  });

  it("does not retry an ambiguous comment request", async () => {
    const metadata: Record<string, unknown> = {};
    const publishComment = vi.fn().mockRejectedValue(new Error("FACEBOOK_COMMENT_OUTCOME_UNCERTAIN"));
    const input = {
      metadata,
      pageId: "123",
      objectId: "123_456",
      accessToken: "token",
      affiliateUrl: "https://example.com/item",
      publishComment,
      persist: async (patch: Record<string, unknown>) => { Object.assign(metadata, patch); },
    };

    expect(await publishAffiliateCommentOnce(input)).toBe("uncertain");
    expect(await publishAffiliateCommentOnce(input)).toBe("uncertain");
    expect(publishComment).toHaveBeenCalledOnce();
  });
});
