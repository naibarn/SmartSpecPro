import { describe, expect, it } from "vitest";
import { FEATURE_FLAG_DEFAULTS } from "@shared/featureFlags";
import {
  buildTenantFeatureFlagGroups,
  getUngroupedTenantFeatureFlagKeys,
} from "./tenantFeatureFlagGroups";

describe("tenantFeatureFlagGroups", () => {
  it("includes the local client llm feature flag in grouped admin flags", () => {
    const allKeys = buildTenantFeatureFlagGroups().flatMap((group) =>
      group.flags.map((flag) => flag.key),
    );

    expect(allKeys).toContain("localClientLlmMode");
  });

  it("covers every declared tenant feature flag", () => {
    const groupedKeys = new Set(
      buildTenantFeatureFlagGroups().flatMap((group) => group.flags.map((flag) => flag.key)),
    );
    const declaredKeys = Object.keys(FEATURE_FLAG_DEFAULTS);

    expect(getUngroupedTenantFeatureFlagKeys()).toEqual([]);
    expect(groupedKeys.size).toBe(declaredKeys.length);
    expect([...groupedKeys].sort()).toEqual([...declaredKeys].sort());
  });
});
