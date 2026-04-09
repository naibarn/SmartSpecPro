import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetDb,
  mockAuditLog,
  mockCascadeDelete,
  mockCollectVectorTargets,
  mockCleanupVectorArtifacts,
  mockStorageDelete,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockAuditLog: vi.fn(),
  mockCascadeDelete: vi.fn(),
  mockCollectVectorTargets: vi.fn().mockResolvedValue({ vectorRefIds: [], indexNames: [] }),
  mockCleanupVectorArtifacts: vi.fn().mockResolvedValue(undefined),
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
  collectLibraryVectorCleanupTargets: mockCollectVectorTargets,
  cleanupLibraryVectorArtifacts: mockCleanupVectorArtifacts,
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

  describe("vector cleanup", () => {
    it("best-effort cleans vector artifacts after purge", async () => {
      const selectResults = [
        [{ id: 1, tenantId: "tenant-1", deletedAt: new Date("2025-01-01T00:00:00.000Z") }],
        [{ linkId: "upload-key-1" }],
      ];

      const selectRunner: any = {
        where: vi.fn(() => selectRunner),
        limit: vi.fn(() => selectRunner),
        then: (resolve: (value: any) => void, reject?: (reason: unknown) => void) =>
          Promise.resolve(selectResults.shift() ?? []).then(resolve, reject),
      };

      const db = {
        select: vi.fn(() => ({
          from: vi.fn(() => selectRunner),
        })),
        transaction: vi.fn(async (callback: (tx: any) => Promise<any>) => callback({} as any)),
      };

      mockGetDb.mockResolvedValue(db as any);
      mockCollectVectorTargets.mockResolvedValue({
        vectorRefIds: ["vec-1", "vec-2"],
        indexNames: ["library-index"],
      });

      const result = await executeTrashPurge();

      expect(result).toMatchObject({
        purgedCount: 1,
        totalFound: 1,
        errors: 0,
      });
      expect(mockCascadeDelete).toHaveBeenCalledTimes(1);
      expect(mockCollectVectorTargets).toHaveBeenCalledWith(1, "tenant-1", db);
      expect(mockCleanupVectorArtifacts).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        vectorRefIds: ["vec-1", "vec-2"],
        indexNames: ["library-index"],
      });
      expect(mockStorageDelete).toHaveBeenCalledWith("upload-key-1");
    });
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
