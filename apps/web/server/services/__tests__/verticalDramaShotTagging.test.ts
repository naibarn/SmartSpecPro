/**
 * Vertical Drama shot-image provenance tagging (2026-07-06, orphaned-task
 * recovery groundwork — see `verticalDramaEpisodes.ts`'s
 * `generateStartFrameImage` / `generateStartFrameAngleVariations` /
 * `repairShotImage`). Verifies `__vd_shot_number` and `__vd_purpose` survive
 * `stripProviderInternalExtraParams`'s `__`-prefixed-key filter alongside the
 * pre-existing `__vd_series_id`/`__vd_episode_id` tags, and that an
 * untagged/unknown internal key is still stripped (regression guard against
 * accidentally widening the allowlist too far).
 */
import { describe, expect, it } from "vitest";
import { stripProviderInternalExtraParams } from "../mediaGenerationService";

describe("stripProviderInternalExtraParams — Vertical Drama shot tags", () => {
  it("keeps __vd_shot_number and __vd_purpose for an angle-grid submission", () => {
    const result = stripProviderInternalExtraParams({
      __vd_series_id: "series-1",
      __vd_episode_id: "episode-6",
      __vd_shot_number: "3",
      __vd_purpose: "angle_grid",
    });
    expect(result).toEqual({
      __vd_series_id: "series-1",
      __vd_episode_id: "episode-6",
      __vd_shot_number: "3",
      __vd_purpose: "angle_grid",
    });
  });

  it("keeps the tags for a start_frame submission", () => {
    const result = stripProviderInternalExtraParams({
      __vd_series_id: "series-1",
      __vd_episode_id: "episode-6",
      __vd_shot_number: "1",
      __vd_purpose: "start_frame",
    });
    expect(result.__vd_purpose).toBe("start_frame");
    expect(result.__vd_shot_number).toBe("1");
  });

  it("keeps the tags for a repair submission", () => {
    const result = stripProviderInternalExtraParams({
      __vd_series_id: "series-1",
      __vd_episode_id: "episode-6",
      __vd_shot_number: "9",
      __vd_purpose: "repair",
    });
    expect(result.__vd_purpose).toBe("repair");
  });

  it("still strips an unrelated/unknown double-underscore internal key", () => {
    const result = stripProviderInternalExtraParams({
      __vd_shot_number: "3",
      __some_future_internal_key: "should-not-survive",
    });
    expect(result).toEqual({ __vd_shot_number: "3" });
    expect(result.__some_future_internal_key).toBeUndefined();
  });

  it("passes through ordinary (non-underscore-prefixed) provider params untouched", () => {
    const result = stripProviderInternalExtraParams({
      __vd_shot_number: "3",
      __vd_purpose: "angle_grid",
      seed: 12345,
      guidance_scale: 7.5,
    });
    expect(result).toEqual({
      __vd_shot_number: "3",
      __vd_purpose: "angle_grid",
      seed: 12345,
      guidance_scale: 7.5,
    });
  });
});
