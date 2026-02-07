import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createNotification } from "./notificationService";

// Mock the telegram service (not yet implemented in section-03)
vi.mock("./telegramService", () => ({
  enqueueTelegramNotification: vi.fn().mockResolvedValue(undefined),
}));

// Create chainable mock for Drizzle query builder
function createDbMock() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 42 }]),
  };
  return {
    insert: vi.fn(() => chain),
    _chain: chain,
  };
}

let mockDb: any;

describe("notificationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createDbMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createNotification", () => {
    it("inserts into user_notifications with correct fields", async () => {
      await createNotification({
        db: mockDb as any,
        userId: 1,
        type: "alert",
        title: "Test Alert",
        content: "Test content",
        priority: "high",
        conversationId: 5,
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: "alert",
          title: "Test Alert",
          content: "Test content",
          priority: "high",
          conversationId: 5,
          isRead: false,
        })
      );
    });

    it("returns the inserted notification ID", async () => {
      const result = await createNotification({
        db: mockDb as any,
        userId: 1,
        type: "alert",
        title: "Test",
        content: "Content",
      });

      expect(result).toEqual({ notificationId: 42 });
    });

    it("calls enqueueTelegramNotification after DB insert", async () => {
      const { enqueueTelegramNotification } = await import("./telegramService");

      await createNotification({
        db: mockDb as any,
        userId: 1,
        type: "alert",
        title: "Test",
        content: "Content",
        priority: "critical",
      });

      expect(enqueueTelegramNotification).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          notificationId: 42,
          title: "Test",
          content: "Content",
          priority: "critical",
        })
      );
    });

    it("does not fail if enqueueTelegramNotification throws", async () => {
      const { enqueueTelegramNotification } = await import("./telegramService");
      (enqueueTelegramNotification as any).mockRejectedValueOnce(new Error("Redis down"));

      const result = await createNotification({
        db: mockDb as any,
        userId: 1,
        type: "alert",
        title: "Test",
        content: "Content",
      });

      expect(result).toEqual({ notificationId: 42 });
    });

    it("passes priority through to Telegram enqueue", async () => {
      const { enqueueTelegramNotification } = await import("./telegramService");

      await createNotification({
        db: mockDb as any,
        userId: 1,
        type: "alert",
        title: "Test",
        content: "Content",
        priority: "critical",
      });

      expect(enqueueTelegramNotification).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ priority: "critical" })
      );
    });

    it("handles optional fields (conversationId, scheduledMessageId)", async () => {
      // Without optional fields
      await createNotification({
        db: mockDb as any,
        userId: 1,
        type: "alert",
        title: "Test",
        content: "Content",
      });

      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.not.objectContaining({
          conversationId: expect.anything(),
          scheduledMessageId: expect.anything(),
        })
      );
    });

    it("defaults priority to normal when not provided", async () => {
      await createNotification({
        db: mockDb as any,
        userId: 1,
        type: "alert",
        title: "Test",
        content: "Content",
      });

      expect(mockDb._chain.values).toHaveBeenCalledWith(
        expect.objectContaining({ priority: "normal" })
      );
    });
  });
});
