import { describe, expect, it } from "vitest";

import { resolveInitialSeriesTab } from "@/pages/VerticalDramaSeriesDetailPage";

/**
 * Unit coverage for `resolveInitialSeriesTab` (W12-B voice chain wave) — the
 * pure "which tab does `?tab=` deep-link to" decision, extracted so the
 * Dialogue/Audio panel's missing-casting banner (episode surface) can send
 * users straight to the Characters tab. Exported/unit-testable, same
 * convention as `VerticalDramaEpisodePage.tsx`'s `shouldResumeVideoClipPoll`.
 */
describe("resolveInitialSeriesTab", () => {
  it("defaults to 'overview' when there is no search string at all", () => {
    expect(resolveInitialSeriesTab("")).toBe("overview");
  });

  it("defaults to 'overview' when `tab` is absent from the query string", () => {
    expect(resolveInitialSeriesTab("foo=bar")).toBe("overview");
  });

  it("resolves a recognized tab id, with or without a leading '?'", () => {
    expect(resolveInitialSeriesTab("tab=characters")).toBe("characters");
    expect(resolveInitialSeriesTab("?tab=characters")).toBe("characters");
    expect(resolveInitialSeriesTab("?tab=planning")).toBe("planning");
  });

  it("resolves every canonical tab id", () => {
    const tabs = [
      "planning",
      "overview",
      "episodes",
      "bible",
      "characters",
      "memory",
      "product",
      "assets",
      "settings",
    ];
    for (const tab of tabs) {
      expect(resolveInitialSeriesTab(`tab=${tab}`)).toBe(tab);
    }
  });

  it("falls back to 'overview' for an unrecognized tab id, never throws", () => {
    expect(resolveInitialSeriesTab("tab=not-a-real-tab")).toBe("overview");
  });

  it("falls back to 'overview' for an empty `tab` value", () => {
    expect(resolveInitialSeriesTab("tab=")).toBe("overview");
  });
});
