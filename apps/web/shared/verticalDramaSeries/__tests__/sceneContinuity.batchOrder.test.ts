import { describe, expect, it } from "vitest";
import {
  planSceneOrderedBatch,
  type VdSceneShotGroup,
} from "../sceneContinuity";

const groups: VdSceneShotGroup[] = [
  { locationKey: "hall", shotNumbers: [1, 2, 4] },
  { locationKey: "garden", shotNumbers: [3, 5] },
];

describe("planSceneOrderedBatch", () => {
  it("creates ascending sequential lanes per scene", () => {
    expect(
      planSceneOrderedBatch({ shotNumbers: [5, 1, 4, 2, 3], groups })
    ).toEqual([
      [1, 2, 4],
      [3, 5],
    ]);
  });

  it("keeps ungrouped shots as independent lanes", () => {
    expect(
      planSceneOrderedBatch({ shotNumbers: [6, 2, 7, 1], groups })
    ).toEqual([[1, 2], [6], [7]]);
  });

  it("only includes requested shots and deduplicates duplicate input", () => {
    const lanes = planSceneOrderedBatch({
      shotNumbers: [4, 4, 2, 8, 1, 8],
      groups,
    });
    expect(lanes).toEqual([[1, 2, 4], [8]]);
    expect(lanes.flat()).toHaveLength(new Set(lanes.flat()).size);
  });

  it("is deterministic with no groups and empty input", () => {
    expect(planSceneOrderedBatch({ shotNumbers: [3, 1, 2], groups: [] })).toEqual([
      [1],
      [2],
      [3],
    ]);
    expect(planSceneOrderedBatch({ shotNumbers: [], groups })).toEqual([]);
  });
});
