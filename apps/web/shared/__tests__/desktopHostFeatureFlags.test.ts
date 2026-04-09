import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";

describe("desktop host feature flags", () => {
  it("defaults desktop-host rollout flags to false", () => {
    expect(FEATURE_FLAG_DEFAULTS.desktopHostEnabled).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.desktopAdvancedLocalMode).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.desktopPackageSync).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.desktopAgencyRuntime).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.desktopWorkerProjection).toBe(false);
  });

  it("includes desktop-host rollout flags in the allowlist", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("desktopHostEnabled")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("desktopAdvancedLocalMode")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("desktopPackageSync")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("desktopAgencyRuntime")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("desktopWorkerProjection")).toBe(true);
  });
});
