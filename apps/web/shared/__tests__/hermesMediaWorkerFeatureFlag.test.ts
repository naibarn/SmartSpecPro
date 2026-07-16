import { describe, expect, it } from "vitest";

import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS } from "../featureFlags";

describe("hermesMediaWorker feature flag (Feature 135)", () => {
  it("is allowlisted, typed, and defaults to false", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("hermesMediaWorker")).toBe(true);
    expect(FEATURE_FLAG_DEFAULTS.hermesMediaWorker).toBe(false);
  });

  it("is a distinct key from hermesAgentRuntime (guard against accidental rename/merge)", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("hermesAgentRuntime")).toBe(true);
    expect(ALLOWED_FEATURE_FLAGS.has("hermesMediaWorker")).toBe(true);
    expect("hermesMediaWorker").not.toBe("hermesAgentRuntime");
    expect(FEATURE_FLAG_DEFAULTS.hermesAgentRuntime).toBe(false);
    expect(FEATURE_FLAG_DEFAULTS.hermesMediaWorker).toBe(false);
  });
});
