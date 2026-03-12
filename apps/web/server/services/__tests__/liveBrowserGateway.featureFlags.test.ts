import { describe, expect, it } from "vitest";

import { FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";
import { validateFeatureFlags } from "../tenantFeatureFlagService";

describe("live browser feature flag registration", () => {
  it("accepts liveBrowser as a tenant feature flag", () => {
    expect(validateFeatureFlags({ liveBrowser: true })).toEqual({
      liveBrowser: true,
    });
  });

  it("defaults liveBrowser to false", () => {
    expect(FEATURE_FLAG_DEFAULTS.liveBrowser).toBe(false);
  });
});
