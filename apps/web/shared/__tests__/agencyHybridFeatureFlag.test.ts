import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";
import { workerRuntimeTypeValues } from "../workerRuntime";

describe("agencyHybridAdk feature flags", () => {
  it("defaults hybrid runtime and kill switch flags to false/false", () => {
    expect(FEATURE_FLAG_DEFAULTS.agencyHybridAdk).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.agencyHybridAdkKillSwitch).toBe(false);
  });

  it("registers both flags in the shared allowlist", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("agencyHybridAdk")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("agencyHybridAdkKillSwitch")).toBe(true);
  });

  it("does not mutate the generic worker runtime family catalog", () => {
    expect(workerRuntimeTypeValues).toEqual([
      "openclaw_gateway",
      "desktop_zeroclaw_managed",
      "nemoclaw_sandbox",
      "hiclaw_cluster",
    ]);
  });
});
