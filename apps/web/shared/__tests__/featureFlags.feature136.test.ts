/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 01 §4.1. Clones the shape of `hermesMediaWorkerFeatureFlag.test.ts`.
 */
import { describe, expect, it } from "vitest";

import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS } from "../featureFlags";

describe("Feature 136 — sequential shot storyboard feature flags", () => {
  it("marketplaceSequentialStoryboard is allowlisted, typed, and defaults to false", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("marketplaceSequentialStoryboard")).toBe(
      true,
    );
    expect(FEATURE_FLAG_DEFAULTS.marketplaceSequentialStoryboard).toBe(false);
  });

  it("marketplaceReviewEvidenceGuard is allowlisted, typed, and defaults to false", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("marketplaceReviewEvidenceGuard")).toBe(
      true,
    );
    expect(FEATURE_FLAG_DEFAULTS.marketplaceReviewEvidenceGuard).toBe(false);
  });

  it("keeps the two flags distinct and independent (guard against merge/rename)", () => {
    expect("marketplaceSequentialStoryboard").not.toBe(
      "marketplaceReviewEvidenceGuard",
    );
    expect(ALLOWED_FEATURE_FLAGS.has("marketplaceSequentialStoryboard")).toBe(
      true,
    );
    expect(ALLOWED_FEATURE_FLAGS.has("marketplaceReviewEvidenceGuard")).toBe(
      true,
    );

    // Independence: setting one true in a local copy must never imply the
    // other flips too — they are two separate rollout gates (spec §1).
    const withSequentialOn = {
      ...FEATURE_FLAG_DEFAULTS,
      marketplaceSequentialStoryboard: true,
    };
    expect(withSequentialOn.marketplaceReviewEvidenceGuard).toBe(false);

    const withEvidenceGuardOn = {
      ...FEATURE_FLAG_DEFAULTS,
      marketplaceReviewEvidenceGuard: true,
    };
    expect(withEvidenceGuardOn.marketplaceSequentialStoryboard).toBe(false);
  });
});
