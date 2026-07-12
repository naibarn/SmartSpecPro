import { describe, expect, it } from "vitest";
import {
  resolveEffectiveShotLocationKey,
  type VerticalDramaStoryboardDistinctLocationView,
} from "@/components/verticalDramaSeries/VerticalDramaStoryboardPanel";

/**
 * Coverage for the per-shot location chip's pure resolution function (Phase
 * D, `planning/polished-toasting-gadget.md` — location visual bible) —
 * client-side mirror of the server's own `resolveEffectiveShotLocationKey`
 * (`server/routers/verticalDramaEpisodes.ts`). Precedence: the shot's own
 * per-shot override first, else the storyboard's `distinct_locations[]`
 * grouping (whichever group's `shot_numbers` contains this shot).
 */
describe("resolveEffectiveShotLocationKey", () => {
  it("returns the override key when present, even if a distinct_locations group also matches this shot", () => {
    const groups: VerticalDramaStoryboardDistinctLocationView[] = [
      { location_key: "cafe", location_name: "Cafe", shot_numbers: [1, 2] },
    ];
    expect(resolveEffectiveShotLocationKey(groups, 1, "office")).toBe(
      "office"
    );
  });

  it("falls back to the matching distinct_locations group's location_key when there is no override", () => {
    const groups: VerticalDramaStoryboardDistinctLocationView[] = [
      { location_key: "cafe", location_name: "Cafe", shot_numbers: [1, 2] },
      { location_key: "office", location_name: "Office", shot_numbers: [3] },
    ];
    expect(resolveEffectiveShotLocationKey(groups, 3)).toBe("office");
  });

  it("returns undefined when there is no override and no group's shot_numbers contains this shot", () => {
    const groups: VerticalDramaStoryboardDistinctLocationView[] = [
      { location_key: "cafe", location_name: "Cafe", shot_numbers: [1, 2] },
    ];
    expect(resolveEffectiveShotLocationKey(groups, 5)).toBeUndefined();
  });

  it("returns undefined for an empty distinct_locations list with no override", () => {
    expect(resolveEffectiveShotLocationKey([], 1)).toBeUndefined();
  });

  it("treats an empty-string override as absent and falls back to group matching", () => {
    const groups: VerticalDramaStoryboardDistinctLocationView[] = [
      { location_key: "cafe", location_name: "Cafe", shot_numbers: [1] },
    ];
    expect(resolveEffectiveShotLocationKey(groups, 1, "")).toBe("cafe");
  });

  it("returns undefined when a matching group has no location_key of its own (defensive)", () => {
    const groups: VerticalDramaStoryboardDistinctLocationView[] = [
      { location_name: "Cafe", shot_numbers: [1] },
    ];
    expect(resolveEffectiveShotLocationKey(groups, 1)).toBeUndefined();
  });

  it("matches shot_numbers defensively via Number() coercion, mirroring the server-side resolver", () => {
    const groups: VerticalDramaStoryboardDistinctLocationView[] = [
      {
        location_key: "cafe",
        location_name: "Cafe",
        shot_numbers: ["1" as unknown as number, 2],
      },
    ];
    expect(resolveEffectiveShotLocationKey(groups, 1)).toBe("cafe");
  });

  it("treats a group with an absent/empty shot_numbers list as never matching", () => {
    const groups: VerticalDramaStoryboardDistinctLocationView[] = [
      { location_key: "cafe", location_name: "Cafe" },
      { location_key: "office", location_name: "Office", shot_numbers: [] },
    ];
    expect(resolveEffectiveShotLocationKey(groups, 1)).toBeUndefined();
  });
});
