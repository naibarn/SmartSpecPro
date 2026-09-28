import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

describe("Feature 141 staged Marketplace Auto Review flags", () => {
  it("registers both rollout flags and keeps them disabled by default", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("marketplaceStagedSequentialStoryboardV2")).toBe(
      true
    );
    expect(
      ALLOWED_FEATURE_FLAGS.has("marketplaceStagedSequentialStoryboardLiveSmoke")
    ).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.marketplaceStagedSequentialStoryboardV2).toBe(
      false
    );
    expect(
      FEATURE_FLAG_DEFAULTS.marketplaceStagedSequentialStoryboardLiveSmoke
    ).toBe(false);
  });

  it("keeps the legacy sequential flag independent from the v2 rollout flag", () => {
    const flags: TenantFeatureFlags = {
      ...FEATURE_FLAG_DEFAULTS,
      marketplaceSequentialStoryboard: true,
      marketplaceStagedSequentialStoryboardV2: false,
    };
    expect(flags.marketplaceSequentialStoryboard).toBe(true);
    expect(flags.marketplaceStagedSequentialStoryboardV2).toBe(false);
  });
});
