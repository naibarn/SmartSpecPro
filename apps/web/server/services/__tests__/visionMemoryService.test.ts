import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for visionMemoryService.ts — Section 09 + 10 pure utility functions.
 *
 * Covers:
 *   - checkSafety(): NSFW label inspection and threshold boundary
 *   - buildSearchableText(): structured text building with PII filtering
 */

// Mock piiFilter to isolate PII redaction behavior
vi.mock("../piiFilter", () => ({
  detectAndRedactPII: vi.fn((text: string) => ({
    sanitizedText: text,
    piiFound: false,
  })),
}));

// Mock DB — required because visionMemoryService imports db for user controls
vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../visualStateService", () => ({
  removeAssetFromState: vi.fn(() => Promise.resolve()),
}));

import { detectAndRedactPII } from "../piiFilter";
const mockDetectAndRedactPII = vi.mocked(detectAndRedactPII);

import {
  checkSafety,
  buildSearchableText,
  NSFW_BLOCKED_CATEGORIES,
  NSFW_SCORE_THRESHOLD,
} from "../visionMemoryService";

describe("visionMemoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: pass-through (no redaction)
    mockDetectAndRedactPII.mockImplementation((text: string) => ({
      sanitizedText: text,
      piiFound: false,
    }));
  });

  describe("NSFW constants", () => {
    it("NSFW_SCORE_THRESHOLD is 0.5 to match Python vision_tasks.py", () => {
      expect(NSFW_SCORE_THRESHOLD).toBe(0.5);
    });

    it("NSFW_BLOCKED_CATEGORIES contains sexually_explicit", () => {
      expect(NSFW_BLOCKED_CATEGORIES.has("sexually_explicit")).toBe(true);
    });

    it("NSFW_BLOCKED_CATEGORIES contains violence", () => {
      expect(NSFW_BLOCKED_CATEGORIES.has("violence")).toBe(true);
    });

    it("NSFW_BLOCKED_CATEGORIES contains hate_speech", () => {
      expect(NSFW_BLOCKED_CATEGORIES.has("hate_speech")).toBe(true);
    });

    it("NSFW_BLOCKED_CATEGORIES contains dangerous", () => {
      expect(NSFW_BLOCKED_CATEGORIES.has("dangerous")).toBe(true);
    });
  });

  describe("checkSafety", () => {
    it("returns blocked:false for null labels", () => {
      expect(checkSafety(null)).toEqual({ blocked: false });
    });

    it("returns blocked:false for undefined labels", () => {
      expect(checkSafety(undefined)).toEqual({ blocked: false });
    });

    it("returns blocked:false for empty array", () => {
      expect(checkSafety([])).toEqual({ blocked: false });
    });

    it("returns blocked:true when score is exactly at threshold (>= semantics)", () => {
      const result = checkSafety([{ category: "sexually_explicit", score: NSFW_SCORE_THRESHOLD }]);
      expect(result.blocked).toBe(true);
    });

    it("returns blocked:true when score is above threshold", () => {
      const result = checkSafety([{ category: "violence", score: NSFW_SCORE_THRESHOLD + 0.1 }]);
      expect(result.blocked).toBe(true);
    });

    it("returns blocked:false when score is just below threshold", () => {
      const result = checkSafety([
        { category: "sexually_explicit", score: NSFW_SCORE_THRESHOLD - 0.01 },
      ]);
      expect(result.blocked).toBe(false);
    });

    it("returns blocked:false for unknown category even with score 1.0", () => {
      const result = checkSafety([{ category: "safe_content", score: 1.0 }]);
      expect(result.blocked).toBe(false);
    });

    it("blocks on 'violence' category", () => {
      expect(checkSafety([{ category: "violence", score: 0.8 }]).blocked).toBe(true);
    });

    it("blocks on 'hate_speech' category", () => {
      expect(checkSafety([{ category: "hate_speech", score: 0.6 }]).blocked).toBe(true);
    });

    it("blocks on 'dangerous' category", () => {
      expect(checkSafety([{ category: "dangerous", score: 0.9 }]).blocked).toBe(true);
    });

    it("includes category name and formatted score in reason string", () => {
      const result = checkSafety([{ category: "sexually_explicit", score: 0.85 }]);
      expect(result.reason).toContain("sexually_explicit");
      expect(result.reason).toContain("0.85");
    });

    it("returns blocked:false when no label exceeds threshold", () => {
      const labels = [
        { category: "sexually_explicit", score: 0.1 },
        { category: "violence", score: 0.3 },
      ];
      expect(checkSafety(labels).blocked).toBe(false);
    });

    it("blocks on first failing label (short-circuit) when multiple labels present", () => {
      const labels = [
        { category: "safe_content", score: 0.9 },
        { category: "violence", score: 0.7 },
        { category: "dangerous", score: 0.9 },
      ];
      const result = checkSafety(labels);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("violence");
    });
  });

  describe("buildSearchableText", () => {
    it("returns caption only when no other fields present", () => {
      const result = buildSearchableText({ shortCaption: "A modern house" });
      expect(result).toBe("A modern house");
    });

    it("returns empty string when all fields are empty or null", () => {
      const result = buildSearchableText({
        shortCaption: null,
        objects: [],
        styles: null,
        materials: [],
        colors: null,
        ocrText: null,
      });
      expect(result).toBe("");
    });

    it("joins parts with ' | ' separator", () => {
      const result = buildSearchableText({
        shortCaption: "House",
        objects: ["sofa", "table"],
        styles: ["modern"],
      });
      const parts = result.split(" | ");
      expect(parts).toHaveLength(3);
    });

    it("formats objects with 'objects:' prefix and comma-separated values", () => {
      const result = buildSearchableText({
        shortCaption: "Room",
        objects: ["chair", "lamp"],
      });
      expect(result).toContain("objects: chair, lamp");
    });

    it("formats styles with 'style:' prefix", () => {
      const result = buildSearchableText({
        shortCaption: "Room",
        styles: ["minimalist"],
      });
      expect(result).toContain("style: minimalist");
    });

    it("formats materials with 'materials:' prefix", () => {
      const result = buildSearchableText({
        shortCaption: "Room",
        materials: ["wood", "steel"],
      });
      expect(result).toContain("materials: wood, steel");
    });

    it("formats colors with 'colors:' prefix", () => {
      const result = buildSearchableText({
        shortCaption: "Room",
        colors: ["white", "beige"],
      });
      expect(result).toContain("colors: white, beige");
    });

    it("passes ocrText through detectAndRedactPII before including", () => {
      mockDetectAndRedactPII.mockReturnValueOnce({
        sanitizedText: "[PHONE REDACTED]",
        piiFound: true,
      });
      const result = buildSearchableText({
        shortCaption: "Sign",
        ocrText: "Call 0812345678",
      });
      expect(mockDetectAndRedactPII).toHaveBeenCalledWith("Call 0812345678");
      expect(result).toContain("ocr: [PHONE REDACTED]");
    });

    it("does NOT pass caption or tag fields through PII filter", () => {
      buildSearchableText({
        shortCaption: "House with pool",
        objects: ["chair"],
        styles: ["modern"],
        ocrText: null,
      });
      expect(mockDetectAndRedactPII).not.toHaveBeenCalled();
    });

    it("skips ocrText section when ocrText is null", () => {
      const result = buildSearchableText({ shortCaption: "House", ocrText: null });
      expect(result).not.toContain("ocr:");
      expect(mockDetectAndRedactPII).not.toHaveBeenCalled();
    });

    it("produces full output with all fields in correct order", () => {
      mockDetectAndRedactPII.mockReturnValueOnce({ sanitizedText: "SALE", piiFound: false });
      const result = buildSearchableText({
        shortCaption: "Modern house",
        objects: ["sofa"],
        styles: ["minimalist"],
        materials: ["wood"],
        colors: ["white"],
        ocrText: "SALE",
      });
      expect(result).toBe(
        "Modern house | objects: sofa | style: minimalist | materials: wood | colors: white | ocr: SALE"
      );
    });
  });
});
