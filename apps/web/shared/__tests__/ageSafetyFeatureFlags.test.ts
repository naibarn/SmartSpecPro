import { describe, expect, it } from "vitest";

import {
  AGE_SAFETY_FEATURE_FLAG_KEYS,
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  areAgeSafetyFeatureFlagsRegistered,
  type TenantFeatureFlags,
} from "../featureFlags";

describe("age safety feature flags", () => {
  it("registers every Feature 128 flag as default-off", () => {
    expect(areAgeSafetyFeatureFlagsRegistered()).toBe(true);
    for (const flag of AGE_SAFETY_FEATURE_FLAG_KEYS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("exposes the flags on TenantFeatureFlags", () => {
    const flags: TenantFeatureFlags = {
      ...FEATURE_FLAG_DEFAULTS,
      ageSafetyPolicyEnabled: true,
      ageSafetyObserveMode: true,
      ageSafetyProfileCompletionGate: true,
      ageSafetyChatEnforcement: true,
      ageSafetyMediaEnforcement: true,
      ageSafetyProtectedSurfaceUnlock: true,
      ageSafetyGeneratedAssetViewerPolicy: true,
      ageSafetyEmergencyChildSafeMode: true,
    };

    expect(flags.ageSafetyPolicyEnabled).toBe(true);
  });
});
