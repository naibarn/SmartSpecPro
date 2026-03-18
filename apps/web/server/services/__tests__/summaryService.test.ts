import { describe, it, expect } from "vitest";
import { extractKeyPoints, calculateDuration } from "../summaryService";

describe("summaryService", () => {
  describe("extractKeyPoints", () => {
    it("extracts decisions from decision turnType messages", () => {
      const msgs = [
        { turnType: "decision", content: "We decided to use approach A", artifactRefsJson: null },
        { turnType: "discussion", content: "Some discussion", artifactRefsJson: null },
        { turnType: "summary", content: "Summary of findings", artifactRefsJson: null },
      ] as any[];

      const result = extractKeyPoints(msgs);
      expect(result.decisions).toHaveLength(1);
      expect(result.decisions[0]).toContain("approach A");
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]).toContain("Summary of findings");
    });

    it("extracts artifact names from artifactRefsJson", () => {
      const msgs = [
        {
          turnType: "execution_update",
          content: "Created report",
          artifactRefsJson: [{ name: "Final Report", type: "document" }],
        },
      ] as any[];

      const result = extractKeyPoints(msgs);
      expect(result.artifacts).toEqual(["Final Report"]);
    });

    it("handles empty messages", () => {
      const result = extractKeyPoints([]);
      expect(result.decisions).toEqual([]);
      expect(result.findings).toEqual([]);
      expect(result.artifacts).toEqual([]);
    });

    it("truncates long content to 500 chars", () => {
      const longContent = "A".repeat(1000);
      const msgs = [{ turnType: "decision", content: longContent, artifactRefsJson: null }] as any[];
      const result = extractKeyPoints(msgs);
      expect(result.decisions[0].length).toBe(500);
    });
  });

  describe("calculateDuration", () => {
    it("returns duration in milliseconds", () => {
      const start = new Date("2026-01-01T00:00:00Z");
      const end = new Date("2026-01-01T00:30:00Z");
      expect(calculateDuration(start, end)).toBe(30 * 60 * 1000);
    });

    it("returns 0 when startedAt is null", () => {
      expect(calculateDuration(null, new Date())).toBe(0);
    });

    it("uses current time when endedAt is null", () => {
      const start = new Date(Date.now() - 5000);
      const duration = calculateDuration(start, null);
      expect(duration).toBeGreaterThanOrEqual(4900);
      expect(duration).toBeLessThan(6000);
    });
  });
});
