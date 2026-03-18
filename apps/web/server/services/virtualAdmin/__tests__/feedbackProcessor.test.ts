import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return { getDb: vi.fn().mockResolvedValue(mockDb) };
});

import { classifyByKeywords, processTicket } from "../feedbackProcessor";
import { getDb } from "../../../db";

describe("FeedbackProcessor", () => {
  describe("classifyByKeywords", () => {
    it("classifies bug reports correctly", () => {
      const result = classifyByKeywords("Error when uploading image", "The app crashes when I upload a large image");
      expect(result.category).toBe("bug");
      expect(result.priority).toBe("high");
    });

    it("classifies feature requests correctly", () => {
      const result = classifyByKeywords("Suggestion: add dark mode");
      expect(result.category).toBe("feature_request");
      expect(result.priority).toBe("normal");
    });

    it("classifies performance issues", () => {
      const result = classifyByKeywords("Very slow page load", "Takes 30 seconds to load");
      expect(result.category).toBe("performance");
    });

    it("classifies questions correctly", () => {
      const result = classifyByKeywords("How do I export my data?");
      expect(result.category).toBe("question");
      expect(result.priority).toBe("low");
    });

    it("returns default for unrecognized input", () => {
      const result = classifyByKeywords("Something about the product");
      expect(result.category).toBe("general");
      expect(result.priority).toBe("normal");
    });
  });

  describe("processTicket", () => {
    it("updates ticket with classification results", async () => {
      const db = await getDb() as any;
      db.limit.mockResolvedValueOnce([{
        id: 1,
        title: "Error in login page",
        description: "Login fails with error",
        tenantId: "t1",
      }]);

      const result = await processTicket(1);
      expect(result.autoCategory).toBe("bug");
      expect(result.autoPriority).toBe("high");
      expect(db.update).toHaveBeenCalled();
    });

    it("returns defaults when ticket not found", async () => {
      const db = await getDb() as any;
      db.limit.mockResolvedValue([]);

      const result = await processTicket(999);
      expect(result.autoCategory).toBeNull();
    });
  });
});
