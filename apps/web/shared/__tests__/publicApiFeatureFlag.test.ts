import { describe, it, expect } from "vitest";
import {
  type TenantFeatureFlags,
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";

describe("publicApi feature flag", () => {
  it("TenantFeatureFlags interface includes publicApi", () => {
    // TypeScript compile-time check — if publicApi is not in the interface, this line fails to compile
    const flags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS };
    expect(typeof flags.publicApi).toBe("boolean");
  });

  it("publicApi defaults to false", () => {
    expect(FEATURE_FLAG_DEFAULTS.publicApi).toBe(false);
  });

  it("ALLOWED_FEATURE_FLAGS set includes publicApi", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("publicApi")).toBe(true);
  });
});
