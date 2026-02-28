/**
 * Tests for agency data retention archival service.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the database
const mockExecute = vi.fn();
vi.mock("../../db", () => ({
  db: {
    instance: {
      execute: mockExecute,
    },
  },
}));

// Mock audit logger
vi.mock("../../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

describe("Agency Archival Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache so fresh imports get fresh mocks
    vi.resetModules();
  });

  describe("archiveOldRecords", () => {
    it("should mark conversations older than 7 days as archived", async () => {
      mockExecute.mockResolvedValueOnce({ rowCount: 3 });

      const { archiveOldRecords } = await import("../agencyArchival");
      const result = await archiveOldRecords();

      expect(result.archivedCount).toBe(3);
      expect(mockExecute).toHaveBeenCalled();
    });

    it("should return 0 when no records to archive", async () => {
      mockExecute.mockResolvedValueOnce({ rowCount: 0 });

      const { archiveOldRecords } = await import("../agencyArchival");
      const result = await archiveOldRecords();

      expect(result.archivedCount).toBe(0);
    });
  });

  describe("purgeOldRecords", () => {
    it("should delete records older than 30 days", async () => {
      // First call: delete agency_messages, second: delete agency_runs
      mockExecute.mockResolvedValueOnce({ rowCount: 10 });
      mockExecute.mockResolvedValueOnce({ rowCount: 5 });

      const { purgeOldRecords } = await import("../agencyArchival");
      const result = await purgeOldRecords();

      expect(result.purgedCount).toBe(15);
    });

    it("should respect per-tenant retention override", async () => {
      // getRetentionConfig makes 2 db.execute calls for archive/purge days
      // Return 60-day override for archive, 60-day override for purge
      mockExecute
        .mockResolvedValueOnce({ rows: [{ value: "14" }] }) // archive days query
        .mockResolvedValueOnce({ rows: [{ value: "60" }] }) // purge days query
        .mockResolvedValueOnce({ rowCount: 0 }) // delete messages
        .mockResolvedValueOnce({ rowCount: 0 }); // delete runs

      const { purgeOldRecords } = await import("../agencyArchival");
      const result = await purgeOldRecords("tenant-1");

      expect(result.purgedCount).toBe(0);
    });
  });

  describe("getRetentionConfig", () => {
    it("should return defaults when no override exists", async () => {
      // No rows returned from system_settings
      mockExecute
        .mockResolvedValueOnce({ rows: [] }) // archive days
        .mockResolvedValueOnce({ rows: [] }); // purge days

      const { getRetentionConfig } = await import("../agencyArchival");
      const config = await getRetentionConfig("tenant-1");

      expect(config.archiveDays).toBe(7);
      expect(config.purgeDays).toBe(30);
    });

    it("should use tenant override when set", async () => {
      mockExecute
        .mockResolvedValueOnce({ rows: [{ value: "14" }] }) // archive days
        .mockResolvedValueOnce({ rows: [{ value: "90" }] }); // purge days

      const { getRetentionConfig } = await import("../agencyArchival");
      const config = await getRetentionConfig("tenant-1");

      expect(config.archiveDays).toBe(14);
      expect(config.purgeDays).toBe(90);
    });
  });
});
