import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
const mockDelete = vi.fn();
const mockExecute = vi.fn();
const mockWhere = vi.fn();
const mockReturning = vi.fn();
const mockFrom = vi.fn();

vi.mock("../../db", () => ({
  getDb: () => ({
    delete: mockDelete,
    execute: mockExecute,
  }),
}));

// Mock BullMQ
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn(),
    upsertJobScheduler: vi.fn(),
    close: vi.fn(),
  })),
  Worker: vi.fn().mockImplementation(() => ({
    close: vi.fn(),
    on: vi.fn(),
  })),
}));

// Mock redisClients
vi.mock("../../services/redisClients", () => ({
  getRealtimeClient: () => ({
    duplicate: () => ({ host: "localhost", port: 6379 }),
  }),
}));

import {
  executeRetentionCleanup,
  RETENTION_AGE_DAYS,
  RETENTION_ROW_CAPS,
} from "../notificationRetentionJob";

describe("executeRetentionCleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: delete returns empty array, execute returns empty rows
    mockDelete.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ returning: mockReturning });
    mockReturning.mockResolvedValue([]);
    mockExecute.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  describe("expired notifications", () => {
    it("deletes notifications past expiresAt", async () => {
      mockReturning.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      const result = await executeRetentionCleanup();
      expect(result.expiredDeleted).toBe(2);
      expect(mockDelete).toHaveBeenCalled();
    });

    it("returns 0 when no expired notifications exist", async () => {
      mockReturning.mockResolvedValueOnce([]);
      const result = await executeRetentionCleanup();
      expect(result.expiredDeleted).toBe(0);
    });
  });

  describe("age-based cleanup", () => {
    it("runs cleanup for all priority levels", async () => {
      const result = await executeRetentionCleanup();
      // 1 for expired + 4 for age cleanup = 5 delete calls
      expect(mockDelete).toHaveBeenCalledTimes(5);
    });

    it("continues if one priority fails", async () => {
      let callCount = 0;
      mockReturning.mockImplementation(() => {
        callCount++;
        if (callCount === 2) return Promise.reject(new Error("DB error"));
        return Promise.resolve([]);
      });

      const result = await executeRetentionCleanup();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe("per-user row cap", () => {
    it("does not cap 'critical' (unlimited)", () => {
      expect(RETENTION_ROW_CAPS.critical).toBeNull();
    });

    it("caps 'high' at 1000 rows per user", () => {
      expect(RETENTION_ROW_CAPS.high).toBe(1000);
    });

    it("caps 'normal' at 500 rows per user", () => {
      expect(RETENTION_ROW_CAPS.normal).toBe(500);
    });

    it("caps 'low' at 200 rows per user", () => {
      expect(RETENTION_ROW_CAPS.low).toBe(200);
    });
  });

  describe("retention age constants", () => {
    it("critical: 365 days", () => {
      expect(RETENTION_AGE_DAYS.critical).toBe(365);
    });

    it("high: 180 days", () => {
      expect(RETENTION_AGE_DAYS.high).toBe(180);
    });

    it("normal: 90 days", () => {
      expect(RETENTION_AGE_DAYS.normal).toBe(90);
    });

    it("low: 30 days", () => {
      expect(RETENTION_AGE_DAYS.low).toBe(30);
    });
  });

  describe("error handling", () => {
    it("continues other cleanup steps if one fails", async () => {
      // Make expired cleanup fail
      mockReturning.mockRejectedValueOnce(new Error("DB timeout"));

      const result = await executeRetentionCleanup();
      expect(result.errors.length).toBeGreaterThan(0);
      // Age cleanup still ran (4 more delete calls)
      expect(mockDelete).toHaveBeenCalledTimes(5); // 1 failed + 4 age
    });

    it("logs error for failed cleanup step", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockReturning.mockRejectedValueOnce(new Error("connection lost"));

      const result = await executeRetentionCleanup();
      expect(result.errors[0]).toContain("connection lost");

      consoleSpy.mockRestore();
    });
  });

  describe("observability", () => {
    it("logs cleanup results with row counts per priority", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await executeRetentionCleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        "[RetentionJob] notification_retention_complete",
        expect.objectContaining({
          expiredDeleted: expect.any(Number),
          ageDeleted: expect.objectContaining({
            critical: expect.any(Number),
            high: expect.any(Number),
            normal: expect.any(Number),
            low: expect.any(Number),
          }),
          durationMs: expect.any(Number),
        })
      );

      consoleSpy.mockRestore();
    });
  });
});
