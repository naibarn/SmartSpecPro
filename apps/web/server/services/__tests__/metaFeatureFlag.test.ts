import { describe, expect, it } from "vitest";
import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS } from "../../../shared/featureFlags";
import { defaultMenuItems, getVisibleMenuItems } from "@smartspec/shared";

describe("META_CHANNELS_ENABLED feature flag", () => {
  it("is registered in ALLOWED_FEATURE_FLAGS", () => {
    expect(ALLOWED_FEATURE_FLAGS.has("META_CHANNELS_ENABLED")).toBe(true);
  });

  it("defaults to true", () => {
    expect(FEATURE_FLAG_DEFAULTS.META_CHANNELS_ENABLED).toBe(true);
  });

  it("has exactly five social menu items gated by the feature", () => {
    const socialItems = defaultMenuItems.filter(
      (item) => item.requiresFeature === "META_CHANNELS_ENABLED",
    );

    expect(socialItems).toHaveLength(5);
    expect(socialItems.map((item) => item.path)).toEqual([
      "/social/channels",
      "/social/inbox",
      "/social/publishing",
      "/social/moderation",
      "/social/automation",
    ]);
  });

  it("hides social menu items when the flag is disabled", () => {
    const items = getVisibleMenuItems("web", "user", undefined, {
      META_CHANNELS_ENABLED: false,
    });
    expect(items.some((item) => item.path.startsWith("/social/"))).toBe(false);
  });

  it("shows social menu items when the flag is enabled", () => {
    const items = getVisibleMenuItems("web", "user", undefined, {
      META_CHANNELS_ENABLED: true,
    });

    const socialPaths = items
      .filter((item) => item.path.startsWith("/social/"))
      .map((item) => item.path);

    expect(socialPaths).toEqual([
      "/social/channels",
      "/social/inbox",
      "/social/publishing",
      "/social/moderation",
      "/social/automation",
    ]);
  });
});
