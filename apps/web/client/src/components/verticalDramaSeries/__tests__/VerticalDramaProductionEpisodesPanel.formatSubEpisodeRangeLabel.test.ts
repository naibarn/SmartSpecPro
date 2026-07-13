import { describe, expect, it } from "vitest";
import { formatSubEpisodeRangeLabel } from "@/components/verticalDramaSeries/VerticalDramaProductionEpisodesPanel";

/**
 * Unit coverage for `formatSubEpisodeRangeLabel` — the Production Episode
 * group card's Sub-Episode range label formatter (Phase D′-1,
 * `planning/vertical-drama-production-episodes/plan.md`). Same "test the
 * extracted pure helper, not a full component render" convention as this
 * feature's other panel tests (e.g.
 * `VerticalDramaLocationStockPanel.guessLocationImageMimeTypeFromUrl.test.ts`).
 */
describe("formatSubEpisodeRangeLabel", () => {
  it("returns a single number for a one-member group", () => {
    expect(formatSubEpisodeRangeLabel([7])).toBe("7");
  });

  it("returns a first–last range for a contiguous run of several members", () => {
    expect(formatSubEpisodeRangeLabel([1, 2, 3, 4, 5])).toBe("1–5");
    expect(formatSubEpisodeRangeLabel([6, 7, 8, 9, 10, 11, 12, 13, 14, 15])).toBe("6–15");
  });

  it("uses only the first and last elements (does not require every intermediate number)", () => {
    // A short last group (e.g. only 3 members) is still a valid contiguous
    // range even though it is shorter than a full groupSize batch.
    expect(formatSubEpisodeRangeLabel([21, 22, 23])).toBe("21–23");
  });

  it("returns an empty string for an empty array (defensive; should not occur for a real group)", () => {
    expect(formatSubEpisodeRangeLabel([])).toBe("");
  });
});
