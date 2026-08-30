import { describe, expect, it } from "vitest";
import {
  inspectVerticalDramaCompletionSet,
  inspectVerticalDramaEpisodeCompletion,
} from "../verticalDramaCompletionContract";

function shots(dialogue = "พูดจริง") {
  return Array.from({ length: 9 }, (_, index) => ({
    shot_number: index + 1,
    summary: "scene",
    dialogue_lines: index === 0 ? [{ speaker: "A", line: dialogue }] : [],
  }));
}

describe("verticalDramaCompletionContract", () => {
  it("does not treat an existing empty deep draft as complete", () => {
    expect(
      inspectVerticalDramaEpisodeCompletion({
        episodeNumber: 4,
        shotDrafts: shots("   "),
      }),
    ).toEqual({
      episodeNumber: 4,
      codes: ["missing_dialogue"],
    });
  });

  it("reports only incomplete episodes in a mixed target set", () => {
    expect(
      inspectVerticalDramaCompletionSet({
        targetEpisodeNumbers: [1, 2, 3],
        items: [
          { episodeNumber: 1, shotDrafts: shots() },
          { episodeNumber: 2, shotDrafts: shots(" ") },
        ],
      }),
    ).toMatchObject({
      completeEpisodeNumbers: [1],
      missingEpisodeNumbers: [2, 3],
    });
  });
});
