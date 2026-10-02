import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  isDesignProviderEnabled,
  type TenantFeatureFlags,
} from "../featureFlags";

const designKeys = [
  "smartAiHubDesignIntelligence",
  "smartAiHubDesignNative",
  "smartAiHubDesignResolver",
  "smartAiHubDesignProviders",
  "smartAiHubGoogleStitch",
  "smartAiHubDesignVisualVerify",
  "smartAiHubDesignCoreSelfDesign",
] as const satisfies readonly (keyof TenantFeatureFlags)[];

describe("SmartAIHub design feature gates", () => {
  it("registers all design gates as default-off tenant flags", () => {
    for (const key of designKeys) {
      expect(ALLOWED_FEATURE_FLAGS.has(key)).toBe(true);
      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(false);
    }
  });

  it("requires every parent gate before using a provider", () => {
    const flags = { ...FEATURE_FLAG_DEFAULTS };
    flags.smartAiHubDesignIntelligence = true;
    flags.smartAiHubDesignNative = true;
    flags.smartAiHubDesignResolver = true;
    flags.smartAiHubDesignProviders = true;
    expect(isDesignProviderEnabled(flags, "stitch")).toBe(false);
    flags.smartAiHubGoogleStitch = true;
    flags.smartAiHubDesignVisualVerify = true;
    expect(isDesignProviderEnabled(flags, "stitch")).toBe(true);
    flags.smartAiHubDesignNative = false;
    expect(isDesignProviderEnabled(flags, "stitch")).toBe(false);
  });

  it("keeps the checked-in JavaScript feature flags aligned", async () => {
    const runtime = await import("../featureFlags.js");
    for (const key of designKeys) {
      expect(runtime.ALLOWED_FEATURE_FLAGS.has(key)).toBe(true);
      expect(runtime.FEATURE_FLAG_DEFAULTS[key]).toBe(false);
    }
  });
});
