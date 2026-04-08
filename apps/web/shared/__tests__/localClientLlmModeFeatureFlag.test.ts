import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";

describe("localClientLlmMode feature flag", () => {
  it("defaults to false so tenants stay cloud-only until explicitly enabled", () => {
    expect(FEATURE_FLAG_DEFAULTS.localClientLlmMode).toBe(false);
  });

  it("is included in the allowlist", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("localClientLlmMode")).toBe(true);
  });
});
