import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  type TenantFeatureFlags,
} from "../featureFlags";
import { BASE_TENANT_FLAG_GROUPS } from "@/components/admin/tenantFeatureFlagGroups";

describe("SPEC-308 tenant feature flag", () => {
  const flag: keyof TenantFeatureFlags = "livingMascotDualSurface";

  it("is explicitly allowlisted and defaults off", () => {
    expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
  });

  it("is exposed exactly once in the existing Notifications admin group", () => {
    const occurrences = BASE_TENANT_FLAG_GROUPS.flatMap((group) =>
      group.flags.filter((entry) => entry.key === flag),
    );
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0]?.description).toMatch(/presentation/i);
  });
});
