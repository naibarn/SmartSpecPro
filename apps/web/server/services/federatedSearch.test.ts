import { describe, it, expect } from "vitest";
import { computeRRF, type FederatedSearchResult } from "./federatedSearch";

describe("computeRRF", () => {
  it("returns merged results ranked by RRF with k=60", () => {
    const list1: FederatedSearchResult[] = [
      { id: "a", title: "Doc A", source: "library", score: 1, metadata: {}, preview: null },
      { id: "b", title: "Doc B", source: "library", score: 0.9, metadata: {}, preview: null },
    ];
    const list2: FederatedSearchResult[] = [
      { id: "c", title: "Doc C", source: "google_drive", score: 0.8, metadata: {}, preview: null },
      { id: "a", title: "Doc A", source: "library", score: 0.7, metadata: {}, preview: null },
    ];

    const merged = computeRRF([list1, list2], 60);

    // "a" appears in both lists: rank 1 in list1, rank 2 in list2
    // RRF(a) = 1/(60+1) + 1/(60+2) = 0.01639 + 0.01613 = 0.03252
    // "b" appears in list1 only at rank 2: 1/(60+2) = 0.01613
    // "c" appears in list2 only at rank 1: 1/(60+1) = 0.01639

    const ids = merged.map((r) => r.id);
    expect(ids[0]).toBe("a"); // Highest RRF score (appears in 2 lists)
    expect(ids.length).toBe(3);
    expect(merged[0].score).toBeGreaterThan(merged[1].score);
  });

  it("handles single-list items correctly", () => {
    const list1: FederatedSearchResult[] = [
      { id: "x", title: "X", source: "library", score: 1, metadata: {}, preview: null },
    ];

    const merged = computeRRF([list1], 60);

    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("x");
    // RRF = 1/(60+1) = 0.01639...
    expect(merged[0].score).toBeCloseTo(1 / 61, 5);
  });

  it("handles empty lists", () => {
    const merged = computeRRF([[], [], []], 60);
    expect(merged.length).toBe(0);
  });

  it("handles item appearing in all three lists", () => {
    const item = (id: string): FederatedSearchResult => ({
      id,
      title: id,
      source: "library",
      score: 0,
      metadata: {},
      preview: null,
    });

    const merged = computeRRF(
      [
        [item("x"), item("y")],
        [item("x")],
        [item("x"), item("z")],
      ],
      60,
    );

    // "x" appears in all 3 lists at rank 1, 1, 1
    // RRF(x) = 3 * 1/(60+1) = 3/61
    expect(merged[0].id).toBe("x");
    expect(merged[0].score).toBeCloseTo(3 / 61, 5);
  });

  it("applies source filtering after merge", () => {
    const list1: FederatedSearchResult[] = [
      { id: "a", title: "A", source: "library", score: 1, metadata: {}, preview: null },
      { id: "b", title: "B", source: "google_drive", score: 0.5, metadata: {}, preview: null },
    ];

    const merged = computeRRF([list1], 60);
    const libraryOnly = merged.filter((r) => r.source === "library");
    const driveOnly = merged.filter((r) => r.source === "google_drive");

    expect(libraryOnly.length).toBe(1);
    expect(driveOnly.length).toBe(1);
    expect(libraryOnly[0].id).toBe("a");
    expect(driveOnly[0].id).toBe("b");
  });
});
