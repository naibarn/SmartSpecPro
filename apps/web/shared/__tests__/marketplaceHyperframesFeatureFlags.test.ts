import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";

const MARKETPLACE_HYPERFRAMES_FLAGS: (keyof TenantFeatureFlags)[] = [
  "marketplaceHyperframesEnabled",
  "marketplaceHyperframesWorkerEnabled",
  "marketplaceHyperframesLibrarySaveEnabled",
  "marketplaceHyperframesOperatorEnabled",
];

describe("Marketplace HyperFrames tenant feature flags", () => {
  it("declares all Marketplace HyperFrames tenant flags", () => {
    const flags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS };

    for (const flag of MARKETPLACE_HYPERFRAMES_FLAGS) {
      expect(typeof flags[flag]).toBe("boolean");
    }
  });

  it("defaults all Marketplace HyperFrames flags off", () => {
    for (const flag of MARKETPLACE_HYPERFRAMES_FLAGS) {
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });

  it("allows only the exact Marketplace HyperFrames flag keys", () => {
    for (const flag of MARKETPLACE_HYPERFRAMES_FLAGS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    }
    expect(ALLOWED_FEATURE_FLAGS.has("marketplaceHyperframes")).toBe(false);
  });
});
