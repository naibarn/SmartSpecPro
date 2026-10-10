import { describe, expect, it } from "vitest";

import {
  DEFAULT_MOLI_FEATURE_FLAGS,
  readMoliFeatureFlags,
  selectBrowserEngine,
} from "../computerUseCapabilityRouting";

describe("Moli browser engine rollout gates", () => {
  it("defaults to disabled Moli, shadow mode, and Chromium production", () => {
    expect(DEFAULT_MOLI_FEATURE_FLAGS).toEqual({
      moli_enabled: false,
      moli_shadow_mode: true,
      moli_production_enabled: false,
    });
    expect(readMoliFeatureFlags({})).toEqual(DEFAULT_MOLI_FEATURE_FLAGS);
    expect(selectBrowserEngine({ moliEligible: true })).toMatchObject({ engine: "chromium" });
  });

  it("does not select Moli while the enable flag is off", () => {
    expect(selectBrowserEngine({
      moliEligible: true,
      flags: { moli_enabled: false, moli_shadow_mode: false, moli_production_enabled: true },
    })).toMatchObject({ engine: "chromium", reason: "MOLI_ROLLOUT_DISABLED" });
  });

  it("keeps Chromium as the execution engine in shadow mode", () => {
    expect(selectBrowserEngine({
      moliEligible: true,
      flags: { moli_enabled: true, moli_shadow_mode: true, moli_production_enabled: true },
    })).toEqual({ engine: "chromium", shadowCandidate: "moli", reason: "MOLI_SHADOW_ONLY" });
  });

  it("requires explicit capability certification before selecting Moli", () => {
    expect(selectBrowserEngine({
      moliEligible: false,
      flags: { moli_enabled: true, moli_shadow_mode: false, moli_production_enabled: true },
    })).toMatchObject({ engine: "chromium", reason: "MOLI_CAPABILITY_NOT_CERTIFIED" });
  });

  it("selects Moli only when all rollout gates are open", () => {
    expect(selectBrowserEngine({
      moliEligible: true,
      flags: { moli_enabled: true, moli_shadow_mode: false, moli_production_enabled: true },
    })).toEqual({ engine: "moli", reason: "MOLI_EXPLICITLY_ENABLED" });
  });

  it("hard-pins production selection to Chromium for Phase 1", () => {
    expect(selectBrowserEngine({
      moliEligible: true,
      environment: "production",
      flags: { moli_enabled: true, moli_shadow_mode: false, moli_production_enabled: true },
    })).toEqual({ engine: "chromium", reason: "MOLI_PRODUCTION_DISABLED_PHASE1" });
  });

  it("parses only explicit truthy flag values", () => {
    expect(readMoliFeatureFlags({
      moli_enabled: "TRUE",
      moli_shadow_mode: "off",
      moli_production_enabled: "1",
    })).toEqual({ moli_enabled: true, moli_shadow_mode: false, moli_production_enabled: true });
    expect(readMoliFeatureFlags({ moli_enabled: "unexpected" }).moli_enabled).toBe(false);
  });
});
