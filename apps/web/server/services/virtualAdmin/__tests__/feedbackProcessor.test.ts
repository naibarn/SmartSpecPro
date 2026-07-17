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

import { classifyByKeywords, processTicket, adminNotificationGroupKey } from "../feedbackProcessor";
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

  describe("adminNotificationGroupKey", () => {
    it("returns undefined for human tickets so each one notifies fresh", () => {
      expect(
        adminNotificationGroupKey({ submittedByType: "human", title: "Bug in editor" }),
      ).toBeUndefined();
    });

    it("groups system tickets by 50-char title prefix", () => {
      const key = adminNotificationGroupKey({
        submittedByType: "system",
        title: "[Auto][2997db0c] tRPC verticalDramaEpisodes.generateShotVideo failed",
      });
      expect(key).toBe(
        `feedback-auto:${"[Auto][2997db0c] tRPC verticalDramaEpisodes.generateShotVideo failed".slice(0, 50).toLowerCase()}`,
      );
    });

    it("produces the same key for repeats of the same error", () => {
      const a = adminNotificationGroupKey({ submittedByType: "system", title: "[Auto][x] same error" });
      const b = adminNotificationGroupKey({ submittedByType: "system", title: "[Auto][x] same error" });
      expect(a).toBe(b);
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

    it("keeps human-submitted tickets in 'new' status (admin triages manually)", async () => {
      const db = await getDb() as any;
      db.set.mockClear();
      db.limit.mockResolvedValueOnce([{
        id: 2,
        title: "Error in media studio",
        description: "Upload fails with error",
        tenantId: "t1",
        submittedByType: "human",
      }]);

      await processTicket(2);
      expect(db.set).toHaveBeenCalled();
      const setArg = db.set.mock.calls[0][0];
      expect(setArg.status).toBeUndefined();
      expect(setArg.triagedAt).toBeUndefined();
      expect(setArg.autoCategory).toBe("bug");
    });

    it("auto-triages system-submitted tickets", async () => {
      const db = await getDb() as any;
      db.set.mockClear();
      db.limit.mockResolvedValueOnce([{
        id: 3,
        title: "[Auto] tRPC failure",
        description: "error stack",
        tenantId: "t1",
        submittedByType: "system",
      }]);

      await processTicket(3);
      const setArg = db.set.mock.calls[0][0];
      expect(setArg.status).toBe("triaged");
      expect(setArg.triagedAt).toBeInstanceOf(Date);
    });

    it("returns defaults when ticket not found", async () => {
      const db = await getDb() as any;
      db.limit.mockResolvedValue([]);

      const result = await processTicket(999);
      expect(result.autoCategory).toBeNull();
    });
  });
});
