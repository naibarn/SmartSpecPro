import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetDb, mockAuditLog, mockCascadeDelete, mockStorageDelete } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockAuditLog: vi.fn(),
  mockCascadeDelete: vi.fn(),
  mockStorageDelete: vi.fn().mockResolvedValue(true),
}));

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

vi.mock("../../drizzle/schema", () => ({
  libraryItems: { id: "id", deletedAt: "deletedAt" },
  libraryLinks: { libraryItemId: "libraryItemId", linkType: "linkType", linkId: "linkId" },
}));

vi.mock("../services/libraryService", () => ({
  cascadeDeleteLibraryItem: mockCascadeDelete,
}));

vi.mock("../storage", () => ({
  storageDelete: (...args: any[]) => mockStorageDelete(...args),
}));

// Note: BullMQ is NOT mocked for executeTrashPurge (it's tested directly)

import { executeTrashPurge } from "./purgeOldTrashItems";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("purgeOldTrashItems", () => {
  describe("executeTrashPurge", () => {
    it("throws when database is not available", async () => {
      mockGetDb.mockResolvedValue(null);
      await expect(executeTrashPurge()).rejects.toThrow("Database not available");
    });
  });

  describe("cutoff date calculation", () => {
    it.todo("should identify items with deletedAt < (NOW() - 90 days)");
    it.todo("should exclude items deleted less than 90 days ago");
  });

  describe("database deletion cascade", () => {
    it.todo("should call cascadeDeleteLibraryItem for each item");
    it.todo("should wrap each delete in a transaction");
  });

  describe("batch processing", () => {
    it.todo("should process items in batches of 100");
    it.todo("should continue fetching while batch is full");
  });

  describe("error handling", () => {
    it.todo("should continue processing remaining items when one fails");
    it.todo("should return error count in result");
  });

  describe("audit logging", () => {
    it.todo("should log count of purged items via worker");
    it.todo("should log zero purges when no items meet criteria");
  });

  describe("job scheduling", () => {
    it.todo("should use upsertJobScheduler for idempotent scheduling");
    it.todo("should be registered in server startup");
    it.todo("should gracefully close worker on shutdown");
  });
});
