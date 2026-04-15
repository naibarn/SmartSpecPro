/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS, type TenantFeatureFlags } from "../featureFlags";

describe("workpack feature flags", () => {
  it("includes workpack flags in the allowlist", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("workpacksEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("workpackAutonomousPilot")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("workpackOpsConsole")).toBe(true);
  });

  it("sets safe defaults for workpack flags", () => {
    expect(FEATURE_FLAG_DEFAULTS.workpacksEnabled).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.workpackAutonomousPilot).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.workpackOpsConsole).toBe(true);
  });

  it("accepts workpack flags on tenant feature shapes", () => {
    const flags: TenantFeatureFlags = {
      ...FEATURE_FLAG_DEFAULTS,
      workpacksEnabled: true,
      workpackAutonomousPilot: false,
      workpackOpsConsole: true,
    };

    expect(flags.workpackOpsConsole).toBe(true);
  });
});
