import { describe, expect, it } from "vitest";

import {
  buildMergeCharactersPayload,
  defaultSelectedDuplicateIds,
  formatEpisodeNumbersSeenIn,
  partitionDuplicateGroups,
  toggleDuplicateSelection,
} from "@/components/verticalDramaSeries/VerticalDramaCharacterMergeReviewDialog";

describe("partitionDuplicateGroups", () => {
  it("splits a full-roster partition into actionable vs singleton groups", () => {
    const groups = [
      { isSingleton: false, id: "a" },
      { isSingleton: true, id: "b" },
      { isSingleton: false, id: "c" },
      { isSingleton: true, id: "d" },
    ];
    const { actionableGroups, singletonGroups } = partitionDuplicateGroups(groups);
    expect(actionableGroups.map((g) => g.id)).toEqual(["a", "c"]);
    expect(singletonGroups.map((g) => g.id)).toEqual(["b", "d"]);
  });

  it("renders the 'nothing to merge' outcome as an empty actionable list, not an error", () => {
    const groups = [
      { isSingleton: true, id: "70" },
      { isSingleton: true, id: "71" },
      { isSingleton: true, id: "72" },
    ];
    const { actionableGroups, singletonGroups } = partitionDuplicateGroups(groups);
    expect(actionableGroups).toHaveLength(0);
    expect(singletonGroups).toHaveLength(3);
  });

  it("returns two empty arrays for an empty roster partition", () => {
    const { actionableGroups, singletonGroups } = partitionDuplicateGroups([]);
    expect(actionableGroups).toEqual([]);
    expect(singletonGroups).toEqual([]);
  });
});

describe("defaultSelectedDuplicateIds", () => {
  it("selects every proposed duplicate id by default", () => {
    const selected = defaultSelectedDuplicateIds(["71", "72", "73"]);
    expect(selected).toEqual(new Set(["71", "72", "73"]));
  });

  it("returns an empty set for a group with no duplicates", () => {
    expect(defaultSelectedDuplicateIds([])).toEqual(new Set());
  });
});

describe("toggleDuplicateSelection", () => {
  it("deselects a currently-selected id", () => {
    const selected = new Set(["71", "72"]);
    const next = toggleDuplicateSelection(selected, "71");
    expect(next).toEqual(new Set(["72"]));
    // original set is untouched (pure)
    expect(selected).toEqual(new Set(["71", "72"]));
  });

  it("re-selects a previously-deselected id", () => {
    const selected = new Set(["72"]);
    const next = toggleDuplicateSelection(selected, "71");
    expect(next).toEqual(new Set(["71", "72"]));
  });
});

describe("buildMergeCharactersPayload", () => {
  const group = {
    canonicalCharacterId: "70",
    duplicateCharacterIds: ["71", "72", "73"],
  };

  it("sends every proposed duplicate when nothing was deselected", () => {
    const payload = buildMergeCharactersPayload(
      "18",
      group,
      defaultSelectedDuplicateIds(group.duplicateCharacterIds)
    );
    expect(payload).toEqual({
      seriesId: "18",
      keepCharacterId: "70",
      mergeCharacterIds: ["71", "72", "73"],
    });
  });

  it("excludes a manually-deselected duplicate, preserving original order", () => {
    const selected = toggleDuplicateSelection(
      defaultSelectedDuplicateIds(group.duplicateCharacterIds),
      "72"
    );
    const payload = buildMergeCharactersPayload("18", group, selected);
    expect(payload.mergeCharacterIds).toEqual(["71", "73"]);
  });

  it("produces an empty mergeCharacterIds when everything is deselected", () => {
    const payload = buildMergeCharactersPayload("18", group, new Set());
    expect(payload.mergeCharacterIds).toEqual([]);
  });
});

describe("formatEpisodeNumbersSeenIn", () => {
  it("sorts ascending and dedupes", () => {
    expect(formatEpisodeNumbersSeenIn([9, 1, 5, 1, 9])).toBe("1, 5, 9");
  });

  it("returns an empty string for no occurrences", () => {
    expect(formatEpisodeNumbersSeenIn([])).toBe("");
  });

  it("handles a single episode", () => {
    expect(formatEpisodeNumbersSeenIn([14])).toBe("14");
  });
});
