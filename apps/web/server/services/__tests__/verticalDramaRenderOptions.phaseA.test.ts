/**
 * Phase A render-options quick wins — pure-helper coverage.
 *
 * Covers the two pure helpers introduced for the episode final-render
 * quick wins: the subtitle font-size scale map and the missing-shot-number
 * derivation used in the friendlier assembly error message. (The age-badge
 * label map is covered in shared/verticalDramaSeries/__tests__/audienceAgeRating.test.ts.)
 */
import { describe, it, expect } from "vitest";
import { deriveMissingShotNumbers } from "../verticalDramaEpisodeVideoAssembly";
import { SUBTITLE_FONT_SIZE_SCALE } from "../verticalDramaFinalRenderGraph";

describe("SUBTITLE_FONT_SIZE_SCALE (Phase A subtitle font size)", () => {
  it("medium is exactly 1.0 (byte-identical to the pre-Phase-A render)", () => {
    expect(SUBTITLE_FONT_SIZE_SCALE.medium).toBe(1.0);
  });

  it("maps each tier to its intended multiplier", () => {
    expect(SUBTITLE_FONT_SIZE_SCALE.small).toBe(0.8);
    expect(SUBTITLE_FONT_SIZE_SCALE.large).toBe(1.25);
    expect(SUBTITLE_FONT_SIZE_SCALE.xlarge).toBe(1.5);
  });

  it("is strictly increasing small < medium < large < xlarge", () => {
    const { small, medium, large, xlarge } = SUBTITLE_FONT_SIZE_SCALE;
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
    expect(large).toBeLessThan(xlarge);
  });
});

describe("deriveMissingShotNumbers (Phase A friendlier assembly error)", () => {
  it("collapses a sub-shot clipNumber (parentShot*100 + sub) to its parent shot", () => {
    // 301 = shot 3 sub-shot 01 -> shot 3
    expect(deriveMissingShotNumbers([{ clipNumber: 301 }])).toEqual([3]);
  });

  it("passes an unsplit shot's clipNumber (< 100) through unchanged", () => {
    expect(deriveMissingShotNumbers([{ clipNumber: 3 }, { clipNumber: 10 }])).toEqual([3, 10]);
  });

  it("de-duplicates multiple missing sub-shots of the same parent shot", () => {
    // 301, 302, 303 all belong to shot 3 -> one entry
    expect(
      deriveMissingShotNumbers([{ clipNumber: 301 }, { clipNumber: 302 }, { clipNumber: 303 }]),
    ).toEqual([3]);
  });

  it("sorts ascending regardless of input clip order (story order in the message)", () => {
    expect(
      deriveMissingShotNumbers([{ clipNumber: 1001 }, { clipNumber: 301 }, { clipNumber: 2 }]),
    ).toEqual([2, 3, 10]);
  });

  it("mixes split and unsplit, dedupes across both, stays sorted", () => {
    // shot 3 (from 301) + bare shot 3 -> single 3; plus shot 10 (from 1002)
    expect(
      deriveMissingShotNumbers([{ clipNumber: 301 }, { clipNumber: 3 }, { clipNumber: 1002 }]),
    ).toEqual([3, 10]);
  });

  it("returns an empty array for no missing clips", () => {
    expect(deriveMissingShotNumbers([])).toEqual([]);
  });
});
