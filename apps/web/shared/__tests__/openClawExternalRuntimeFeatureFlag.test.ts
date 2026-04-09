import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";

describe("openClawExternalRuntime feature flag", () => {
  it("defaults to false so external worker rollout stays opt-in", () => {
    expect(FEATURE_FLAG_DEFAULTS.openClawExternalRuntime).toBe(false);
  });

  it("is included in the allowlist", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("openClawExternalRuntime")).toBe(true);
  });

  it("keeps non-openclaw runtime families rollout-gated too", () => {
    expect(FEATURE_FLAG_DEFAULTS.desktopZeroClawWorker).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.nemoClawSecureWorkerPool).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.hiClawClusterRuntime).toBe(false);
    expect(ALLOWED_FEATURE_FLAGS.has("desktopZeroClawWorker")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("nemoClawSecureWorkerPool")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("hiClawClusterRuntime")).toBe(true);
  });
});
