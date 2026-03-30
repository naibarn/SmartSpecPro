import { describe, it, expect } from "vitest";
import {
  type TenantFeatureFlags,
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";

describe("Upload-Post feature flag", () => {
  it("TenantFeatureFlags interface includes UPLOAD_POST_GATEWAY_ENABLED", () => {
    const flags: TenantFeatureFlags = { ...FEATURE_FLAG_DEFAULTS };
    expect(typeof flags.UPLOAD_POST_GATEWAY_ENABLED).toBe("boolean");
  });

  it("UPLOAD_POST_GATEWAY_ENABLED defaults to false", () => {
    expect(FEATURE_FLAG_DEFAULTS.UPLOAD_POST_GATEWAY_ENABLED).toBe(false);
  });

  it("ALLOWED_FEATURE_FLAGS set includes UPLOAD_POST_GATEWAY_ENABLED", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("UPLOAD_POST_GATEWAY_ENABLED")).toBe(true);
  });
});
