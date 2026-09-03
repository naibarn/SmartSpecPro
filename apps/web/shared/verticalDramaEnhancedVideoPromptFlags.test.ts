import { describe, expect, it } from "vitest";
import {
  ALLOWED_FEATURE_FLAGS,
  FEATURE_FLAG_DEFAULTS,
  VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS,
} from "./featureFlags";

describe("Feature 173 rollout registration", () => {
  it("registers all switches and keeps every default off", () => {
    for (const key of [
      "verticalDramaEnhancedVideoPromptUi",
      "verticalDramaEnhancedVideoPromptJobs",
      "verticalDramaEnhancedVideoPromptApply",
    ] as const) {
      expect(ALLOWED_FEATURE_FLAGS.has(key)).toBe(true);
      expect(VERTICAL_DRAMA_SERIES_FEATURE_FLAG_KEYS).toContain(key);
      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(false);
    }
  });
});
