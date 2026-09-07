import { describe, expect, it } from "vitest";
import {
  advancePlayableTimeMs,
  getNoiseThresholdDb,
  getPlayableTimeMs,
  getWaveformThresholdTopPercent,
  normalizeSilenceRanges,
} from "../../src/screens/media-workspace/mediaWorkspaceTimeline";

describe("media workspace dead-air timeline", () => {
  const cuts = [{ startMs: 1_000, endMs: 2_000 }, { startMs: 4_000, endMs: 5_000 }];

  it("merges overlapping ranges and seeks past a cut", () => {
    expect(normalizeSilenceRanges([{ startMs: 1_000, endMs: 1_500 }, { startMs: 1_520, endMs: 2_000 }], 6_000))
      .toEqual([{ startMs: 1_000, endMs: 2_000 }]);
    expect(getPlayableTimeMs(1_500, cuts, 6_000)).toBe(2_001);
  });

  it("advances over multiple dead-air ranges without changing playable duration", () => {
    expect(advancePlayableTimeMs(900, 2_200, cuts, 6_000)).toBe(5_102);
  });

  it("keeps the visual threshold tied to the profile mapping", () => {
    expect(getNoiseThresholdDb(30)).toBeCloseTo(-39.5, 5);
    expect(getWaveformThresholdTopPercent(30)).toBe(70);
  });
});
