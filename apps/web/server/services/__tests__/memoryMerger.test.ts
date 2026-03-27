import { describe, expect, it } from "vitest";
import { mergeAndDedup, mergeMemories } from "../memoryMerger";

describe("memoryMerger", () => {
  it("keeps rules first and preserves the token budget", () => {
    const result = mergeAndDedup(
      [{ id: "rule-1", source: "rule", content: "Always verify dates", tokenCount: 4 }],
      [{ id: "fact-1", source: "fact", content: "User likes TypeScript", tokenCount: 4 }],
      [{ id: "chunk-1", source: "chunk", content: "Older conversation chunk", tokenCount: 4 }],
      [{ id: "legacy-1", source: "legacy", content: "legacy memory", tokenCount: 4 }],
      { totalBudget: 32 },
    );

    expect(result.items[0]?.source).toBe("rule");
    expect(result.contextText).toContain("[MEMORY_START]");
    expect(result.contextText).toContain("[RULE]");
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });

  it("skips L2 chunks when enough L1 facts are present", () => {
    const result = mergeAndDedup(
      [],
      [
        { id: "fact-1", source: "fact", content: "Fact one", tokenCount: 1 },
        { id: "fact-2", source: "fact", content: "Fact two", tokenCount: 1 },
        { id: "fact-3", source: "fact", content: "Fact three", tokenCount: 1 },
      ],
      [{ id: "chunk-1", source: "chunk", content: "Chunk", tokenCount: 1 }],
      [],
      { totalBudget: 32 },
    );

    expect(result.l1Count).toBeGreaterThanOrEqual(3);
    expect(result.l2Triggered).toBe(false);
    expect(result.items.some((item) => item.source === "l2_chunk")).toBe(false);
  });

  it("deduplicates by item id and source", () => {
    const result = mergeMemories(
      [
        { id: "1", source: "rule", content: "repeat" },
        { id: "1", source: "rule", content: "repeat" },
        { id: "2", source: "fact", content: "unique" },
      ],
      10,
    );

    expect(result.merged).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
  });
});
