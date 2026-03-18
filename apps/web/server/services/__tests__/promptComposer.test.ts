import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  truncateToTokenBudget,
  compressHistory,
} from "../promptComposer";

describe("promptComposer", () => {
  describe("estimateTokens", () => {
    it("estimates ~1 token per 4 chars", () => {
      expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
    });

    it("returns 0 for empty string", () => {
      expect(estimateTokens("")).toBe(0);
    });
  });

  describe("truncateToTokenBudget", () => {
    it("returns text unchanged when within budget", () => {
      const text = "Short text";
      expect(truncateToTokenBudget(text, 100)).toBe(text);
    });

    it("truncates and adds indicator when over budget", () => {
      const text = "A".repeat(1000);
      const result = truncateToTokenBudget(text, 10); // 10 tokens = 40 chars
      expect(result.length).toBeLessThan(text.length);
      expect(result).toContain("...(truncated)");
    });
  });

  describe("compressHistory", () => {
    const makeMsg = (turnType: string, content: string, createdAt: Date) => ({
      turnType,
      content,
      createdAt,
      visibility: "transparent",
      id: "m-" + Math.random(),
      roomId: "r1",
      senderType: "assistant",
    }) as any;

    it("preserves handoff/decision/summary messages during compression", () => {
      const now = Date.now();
      const msgs = [
        makeMsg("discussion", "A".repeat(100), new Date(now - 5000)),
        makeMsg("handoff", "Handoff msg", new Date(now - 4000)),
        makeMsg("discussion", "B".repeat(100), new Date(now - 3000)),
        makeMsg("decision", "Decision msg", new Date(now - 2000)),
        makeMsg("discussion", "C".repeat(100), new Date(now - 1000)),
        makeMsg("summary", "Summary msg", new Date(now)),
      ];

      // Very tight budget — only room for preserved types
      const result = compressHistory(msgs, 30); // ~30 tokens = 120 chars
      const types = result.map((m: any) => m.turnType);
      expect(types).toContain("handoff");
      expect(types).toContain("decision");
      expect(types).toContain("summary");
    });

    it("keeps most recent discussion messages when budget allows", () => {
      const now = Date.now();
      const msgs = [
        makeMsg("discussion", "Old message", new Date(now - 3000)),
        makeMsg("discussion", "Recent message", new Date(now - 1000)),
      ];

      const result = compressHistory(msgs, 1000);
      expect(result).toHaveLength(2);
    });
  });
});
