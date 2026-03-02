import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateFeatureFlags,
  resolveFeatureFlags,
  isFeatureEnabled,
} from "../tenantFeatureFlagService";
import { FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";

describe("validateFeatureFlags", () => {
  it("strips unrecognized keys from input", () => {
    const result = validateFeatureFlags({ canvas: true, hackerMode: true });
    expect(result).toEqual({ canvas: true });
    expect("hackerMode" in result).toBe(false);
  });

  it("preserves all recognized keys", () => {
    const allFlags = {
      multiChannel: true,
      chatWidget: false,
      browserTool: true,
      canvas: true,
      voiceChat: false,
      webhookTriggers: true,
      costDisplay: true,
      personaSystem: true,
      crossAgency: false,
      channelRouter: true,
    };
    const result = validateFeatureFlags(allFlags);
    expect(result).toEqual(allFlags);
  });

  it("rejects non-boolean values", () => {
    const result = validateFeatureFlags({ canvas: "yes" as unknown as boolean });
    expect(result).toEqual({});
  });

  it("rejects null values", () => {
    const result = validateFeatureFlags({ canvas: null as unknown as boolean });
    expect(result).toEqual({});
  });

  it("rejects numeric values", () => {
    const result = validateFeatureFlags({ canvas: 1 as unknown as boolean });
    expect(result).toEqual({});
  });
});

describe("resolveFeatureFlags", () => {
  it("returns correct defaults for all 10 flags when null", () => {
    const result = resolveFeatureFlags(null);
    expect(result).toEqual(FEATURE_FLAG_DEFAULTS);
    expect(result.costDisplay).toBe(true);
    expect(result.personaSystem).toBe(true);
    expect(result.canvas).toBe(false);
    expect(result.multiChannel).toBe(false);
  });

  it("returns defaults when empty object provided", () => {
    const result = resolveFeatureFlags({});
    expect(result).toEqual(FEATURE_FLAG_DEFAULTS);
  });

  it("merges stored flags with defaults", () => {
    const result = resolveFeatureFlags({ canvas: true });
    expect(result.canvas).toBe(true);
    expect(result.costDisplay).toBe(true); // default
    expect(result.multiChannel).toBe(false); // default
  });

  it("allows disabling flags that default to true", () => {
    const result = resolveFeatureFlags({ costDisplay: false, personaSystem: false });
    expect(result.costDisplay).toBe(false);
    expect(result.personaSystem).toBe(false);
  });
});

describe("isFeatureEnabled", () => {
  it("returns stored boolean when available", () => {
    expect(isFeatureEnabled({ canvas: true }, "canvas")).toBe(true);
    expect(isFeatureEnabled({ canvas: false }, "canvas")).toBe(false);
  });

  it("returns default when flag is missing from stored flags", () => {
    expect(isFeatureEnabled({}, "costDisplay")).toBe(true); // default true
    expect(isFeatureEnabled({}, "canvas")).toBe(false); // default false
  });

  it("returns default when stored flags is null", () => {
    expect(isFeatureEnabled(null, "costDisplay")).toBe(true);
    expect(isFeatureEnabled(null, "canvas")).toBe(false);
  });

  it("returns default when stored flags is undefined", () => {
    expect(isFeatureEnabled(undefined, "personaSystem")).toBe(true);
    expect(isFeatureEnabled(undefined, "channelRouter")).toBe(false);
  });
});
