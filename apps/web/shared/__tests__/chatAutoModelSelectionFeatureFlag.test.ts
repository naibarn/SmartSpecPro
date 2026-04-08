import { describe, expect, it } from "vitest";

import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
} from "../featureFlags";

describe("chatAutoModelSelection feature flag", () => {
  it("defaults to true so chat shows auto/provider-auto selection by default", () => {
    expect(FEATURE_FLAG_DEFAULTS.chatAutoModelSelection).toBe(true);
  });

  it("is included in the allowlist", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("chatAutoModelSelection")).toBe(true);
  });
});
