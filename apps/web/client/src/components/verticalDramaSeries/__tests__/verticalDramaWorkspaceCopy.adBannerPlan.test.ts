import { describe, expect, it } from "vitest";

import {
  vdCopy,
  vdCopyWithParams,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";

/**
 * Ad Banner Overlay — per-episode banner selection copy (F131W, task
 * #30-A2, plan.md §6 episode side) — `VerticalDramaEpisodeWorkspace.tsx`'s
 * `VerticalDramaAdBannerPlanSection`. Mirrors
 * `verticalDramaWorkspaceCopy.episodeBeyondPlan.test.ts`'s exact convention.
 */
describe("Ad Banner Overlay section copy (F131W, task #30-A2)", () => {
  const keys = [
    "adBannerSectionTitle",
    "adBannerEnableLabel",
    "adBannerNoDesigns",
    "adBannerPlacementBottomBand",
    "adBannerPlacementSideVertical",
    "adBannerPlacementFullscreen",
    "adBannerApprovalRequiredBadge",
    "adBannerTimingEntire",
    "adBannerTimingWindow",
    "adBannerStartSecLabel",
    "adBannerDurationSecLabel",
    "adBannerTooManyError",
    "adBannerFullscreenOverlapError",
    "adBannerSave",
    "adBannerSaving",
  ] as const;

  it("has a non-empty entry for every new key in both locales", () => {
    for (const key of keys) {
      expect(vdCopy("th")[key].length).toBeGreaterThan(0);
      expect(vdCopy("en")[key].length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings (Thai)", () => {
    expect(vdCopy("th").adBannerSectionTitle).toBe("แบนเนอร์ในวิดีโอนี้");
    expect(vdCopy("th").adBannerEnableLabel).toBe("เปิดใช้แบนเนอร์โฆษณา");
    expect(vdCopy("th").adBannerApprovalRequiredBadge).toBe(
      "ต้องอนุมัติก่อนใช้ในวิดีโอ"
    );
    expect(vdCopy("th").adBannerTimingEntire).toBe("ทั้งคลิป");
    expect(vdCopy("th").adBannerTimingWindow).toBe("ช่วงเวลา");
  });

  it("interpolates the too-many-selections template correctly (Thai)", () => {
    const text = vdCopyWithParams(vdCopy("th").adBannerTooManyError, { n: 5 });
    expect(text).toBe("เลือกแบนเนอร์ได้สูงสุด 5 รายการ");
  });

  it("interpolates the too-many-selections template correctly (English)", () => {
    const text = vdCopyWithParams(vdCopy("en").adBannerTooManyError, { n: 5 });
    expect(text).toBe("You can select at most 5 ad banners.");
  });
});
