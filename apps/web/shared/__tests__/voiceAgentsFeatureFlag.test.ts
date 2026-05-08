import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

describe("voice agents feature flag", () => {
  it("is part of the tenant feature flag contract and defaults off", () => {
    const flags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS };

    expect(typeof flags.voiceAgents).toBe("boolean");
    expect(FEATURE_FLAG_DEFAULTS.voiceAgents).toBe(false);
    expect(ALLOWED_FEATURE_FLAGS.has("voiceAgents")).toBe(true);
  });
});
