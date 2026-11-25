import { describe, expect, it } from "vitest";

import { defaultJobExecutorRegistry } from "../jobExecutorRegistry";
import {
  composeFacebookReelsDescription,
  hashFacebookReelsContentSnapshot,
  marketplaceAutoReviewReelsWorkerInputSchema,
} from "../marketplaceAutoReviewReelsService";

describe("Marketplace Auto Review Facebook Reels contract", () => {
  it("registers the publisher in the canonical worker executor registry", () => {
    expect(defaultJobExecutorRegistry.resolve("social.facebook.reels.publish", "feature-186-v1")).toBeDefined();
  });

  it("preserves the complete canonical affiliate URL and edited text in the publish snapshot", () => {
    const affiliateUrl = "https://shop.example/item?aff_id=ab%2Fcd&campaign=x%20y&sub=1";
    const description = composeFacebookReelsDescription({
      caption: "User edited caption",
      hashtags: ["#review", "#dailydeal"],
      commercialDisclosure: "โฆษณา มีลิงก์ Affiliate",
      affiliateUrl,
    });
    expect(description).toContain(affiliateUrl);
    expect(description).toContain("User edited caption");
    expect(description).toContain("#review #dailydeal");
    expect(hashFacebookReelsContentSnapshot({ description })).toMatch(/^[a-f0-9]{64}$/);
    expect(hashFacebookReelsContentSnapshot({ description: `${description} ` })).not.toBe(
      hashFacebookReelsContentSnapshot({ description }),
    );
  });

  it("accepts only reference-based worker inputs and rejects client media URLs", () => {
    expect(marketplaceAutoReviewReelsWorkerInputSchema.safeParse({
      postId: 1,
      runId: "mar_example",
      intentHash: "a".repeat(64),
    }).success).toBe(true);
    expect(marketplaceAutoReviewReelsWorkerInputSchema.safeParse({
      postId: 1,
      runId: "mar_example",
      intentHash: "a".repeat(64),
      mediaUrl: "https://attacker.example/video.mp4",
    }).success).toBe(false);
  });
});
