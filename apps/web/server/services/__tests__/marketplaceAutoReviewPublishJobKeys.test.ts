import { describe, expect, it } from "vitest";

import { buildMarketplaceAutoReviewPublishJobKeys, toFacebookScheduledPublishTime } from "../marketplaceAutoReviewPublishJobKeys";

describe("Marketplace Auto Review publish job keys", () => {
  it("keeps publish, retry and resume keys within control-plane limits", () => {
    const intentHash = "a".repeat(64);
    const reels = buildMarketplaceAutoReviewPublishJobKeys({ format: "reels", intentHash, attempt: 1, purpose: "publish" });
    const photo = buildMarketplaceAutoReviewPublishJobKeys({ format: "photo", intentHash, attempt: 10, purpose: "publish" });
    const resume = buildMarketplaceAutoReviewPublishJobKeys({ format: "reels", intentHash, attempt: 10, purpose: "resume" });

    for (const keys of [reels, photo, resume]) {
      expect(keys.idempotencyKey.length).toBeLessThanOrEqual(128);
      expect(keys.activeDedupeKey.length).toBeLessThanOrEqual(160);
    }
    expect(reels.idempotencyKey).not.toBe(resume.idempotencyKey);
    expect(reels.activeDedupeKey).toBe(resume.activeDedupeKey);
  });

  it("rejects malformed intent hashes and attempts", () => {
    expect(() => buildMarketplaceAutoReviewPublishJobKeys({ format: "reels", intentHash: "bad", attempt: 1, purpose: "publish" })).toThrow("MARKETPLACE_PUBLISH_JOB_KEY_INPUT_INVALID");
    expect(() => buildMarketplaceAutoReviewPublishJobKeys({ format: "photo", intentHash: "a".repeat(64), attempt: 0, purpose: "publish" })).toThrow("MARKETPLACE_PUBLISH_JOB_KEY_INPUT_INVALID");
  });

  it("converts the stored UTC schedule to Facebook Unix seconds without shifting the instant", () => {
    const scheduledAt = "2026-11-26T09:05:00.000Z";
    expect(toFacebookScheduledPublishTime(scheduledAt)).toBe(Date.parse(scheduledAt) / 1000);
    expect(toFacebookScheduledPublishTime()).toBeUndefined();
  });
});
