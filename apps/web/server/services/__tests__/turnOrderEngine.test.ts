import { describe, it, expect } from "vitest";
import {
  countConsecutiveTurns,
  detectLoop,
  getNextRoundRobin,
  getCoordinatorProfile,
  DEFAULT_MAX_CONSECUTIVE_TURNS,
} from "../turnOrderEngine";

describe("turnOrderEngine", () => {
  describe("countConsecutiveTurns", () => {
    it("counts consecutive turns from end", () => {
      expect(countConsecutiveTurns(["a", "b", "b", "b"], "b")).toBe(3);
    });

    it("returns 0 when agent not at end", () => {
      expect(countConsecutiveTurns(["a", "b", "a"], "b")).toBe(0);
    });

    it("handles empty array", () => {
      expect(countConsecutiveTurns([], "a")).toBe(0);
    });
  });

  describe("detectLoop", () => {
    it("detects 2-agent ping-pong loop", () => {
      const senders = Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? "a" : "b"));
      expect(detectLoop(senders, 10)).toBe(true);
    });

    it("returns false for diverse speakers", () => {
      const senders = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
      expect(detectLoop(senders, 10)).toBe(false);
    });

    it("returns false when too few messages", () => {
      expect(detectLoop(["a", "b"], 10)).toBe(false);
    });
  });

  describe("getNextRoundRobin", () => {
    const profiles = [
      { id: "a", sortOrder: 0, isActive: true },
      { id: "b", sortOrder: 1, isActive: true },
      { id: "c", sortOrder: 2, isActive: true },
    ];

    it("returns first agent when current is null", () => {
      expect(getNextRoundRobin(profiles, null)).toBe("a");
    });

    it("advances to next agent by sortOrder", () => {
      expect(getNextRoundRobin(profiles, "a")).toBe("b");
      expect(getNextRoundRobin(profiles, "b")).toBe("c");
    });

    it("wraps around to first agent after last", () => {
      expect(getNextRoundRobin(profiles, "c")).toBe("a");
    });

    it("skips inactive agents", () => {
      const withInactive = [
        { id: "a", sortOrder: 0, isActive: true },
        { id: "b", sortOrder: 1, isActive: false },
        { id: "c", sortOrder: 2, isActive: true },
      ];
      expect(getNextRoundRobin(withInactive, "a")).toBe("c");
    });

    it("throws when no active agents", () => {
      expect(() => getNextRoundRobin([], "a")).toThrow("No active agents");
    });
  });

  describe("getCoordinatorProfile", () => {
    it("prefers orchestrator over lead", () => {
      const result = getCoordinatorProfile([
        { id: "lead", isLead: true, memberRole: "specialist" },
        { id: "orch", isLead: false, memberRole: "orchestrator" },
      ]);
      expect(result?.id).toBe("orch");
    });

    it("falls back to lead when no orchestrator exists", () => {
      const result = getCoordinatorProfile([
        { id: "lead", isLead: true, memberRole: "specialist" },
        { id: "helper", isLead: false, memberRole: "researcher" },
      ]);
      expect(result?.id).toBe("lead");
    });
  });

  describe("constants", () => {
    it("DEFAULT_MAX_CONSECUTIVE_TURNS is 3", () => {
      expect(DEFAULT_MAX_CONSECUTIVE_TURNS).toBe(3);
    });
  });
});
