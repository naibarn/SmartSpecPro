import { describe, expect, it } from "vitest";
import {
  SPECIAL_EPISODE_NUMBER_START,
  highestNormalEpisodeNumber,
  nextNormalEpisodeNumber,
  nextSpecialEpisodeNumber,
} from "../episodeNumbering";

describe("vertical drama episode numbering", () => {
  it("continues normal episodes from normal rows only", () => {
    expect(
      nextNormalEpisodeNumber([
        { episodeNumber: 20, episodeKind: "normal" },
        { episodeNumber: 51, episodeKind: "special_tie_in" },
      ])
    ).toBe(21);
  });

  it("allocates special episodes from the dedicated 501+ range", () => {
    expect(
      nextSpecialEpisodeNumber([
        { episodeNumber: 50, episodeKind: "normal" },
        { episodeNumber: 51, episodeKind: "special_tie_in" },
      ])
    ).toBe(SPECIAL_EPISODE_NUMBER_START);
  });

  it("skips occupied numbers regardless of episode kind", () => {
    expect(
      nextSpecialEpisodeNumber([
        { episodeNumber: 501, episodeKind: "normal" },
        { episodeNumber: 502, episodeKind: "special_tie_in" },
      ])
    ).toBe(503);
    expect(
      nextNormalEpisodeNumber([
        { episodeNumber: 500, episodeKind: "normal" },
        { episodeNumber: 501, episodeKind: "special_tie_in" },
      ])
    ).toBe(502);
  });

  it("treats legacy rows without episodeKind as normal", () => {
    expect(highestNormalEpisodeNumber([{ episodeNumber: 7 }])).toBe(7);
    expect(nextNormalEpisodeNumber([{ episodeNumber: 7 }])).toBe(8);
  });
});
