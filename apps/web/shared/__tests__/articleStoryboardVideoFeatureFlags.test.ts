import { describe, expect, it } from "vitest";
import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS } from "../featureFlags";
import { ARTICLE_STORYBOARD_VIDEO_FLAG_KEYS, areArticleStoryboardVideoFlagsRegistered } from "../articleStoryboardVideo";

describe("article storyboard video feature flags", () => {
  it("registers every Feature 127 flag as default-off", () => {
    expect(areArticleStoryboardVideoFlagsRegistered()).toBe(true);
    for (const flag of ARTICLE_STORYBOARD_VIDEO_FLAG_KEYS) {
      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
    }
  });
});
