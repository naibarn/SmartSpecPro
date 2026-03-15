import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for Section 10: User Controls and Deletion
 *
 * Covers deleteFromMemory and pinToMemory service functions.
 */

vi.mock("../../db", () => ({ getDb: vi.fn() }));
vi.mock("../visualStateService", () => ({
  removeAssetFromState: vi.fn(() => Promise.resolve()),
}));

import { getDb } from "../../db";
import { removeAssetFromState } from "../visualStateService";

const mockGetDb = vi.mocked(getDb);
const mockRemoveAsset = vi.mocked(removeAssetFromState);

function makeDb(overrides: Record<string, any> = {}) {
  const returning = vi.fn();
  const execute = vi.fn().mockResolvedValue({ rowCount: 1 });
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: returning.mockResolvedValue([{ id: 1, mediaAssetId: 42 }]),
    ...overrides,
  };
  return db;
}

const ASSET_ROW = {
  id: 42,
  userId: 1,
  tenantId: "tenant-abc",
  conversationId: 100,
};

const MEMORY_ITEM_ROW = {
  id: 7,
  mediaAssetId: 42,
};

describe("deleteFromMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should delete memory item, vectors, and links for the given assetId", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([ASSET_ROW]); // asset ownership check
    db.returning.mockResolvedValueOnce([MEMORY_ITEM_ROW]); // memory item delete returns
    mockGetDb.mockResolvedValue(db as any);

    const { deleteFromMemory } = await import("../visionMemoryService");
    const result = await deleteFromMemory(42, 1, "tenant-abc");

    expect(db.delete).toHaveBeenCalled();
    expect(result.deletedItemCount).toBe(1);
    expect(result.success).toBe(true);
  });

  it("should call removeAssetFromState for the target conversationId and assetId", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([ASSET_ROW]);
    db.returning.mockResolvedValueOnce([MEMORY_ITEM_ROW]);
    mockGetDb.mockResolvedValue(db as any);

    const { deleteFromMemory } = await import("../visionMemoryService");
    await deleteFromMemory(42, 1, "tenant-abc");

    expect(mockRemoveAsset).toHaveBeenCalledWith(ASSET_ROW.conversationId, 42);
  });

  it("should throw FORBIDDEN when userId/tenantId mismatch", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([{ ...ASSET_ROW, userId: 999 }]); // different user
    mockGetDb.mockResolvedValue(db as any);

    const { deleteFromMemory } = await import("../visionMemoryService");
    await expect(deleteFromMemory(42, 1, "tenant-abc")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("should return success with deleted item count", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([ASSET_ROW]);
    db.returning.mockResolvedValueOnce([MEMORY_ITEM_ROW]);
    mockGetDb.mockResolvedValue(db as any);

    const { deleteFromMemory } = await import("../visionMemoryService");
    const result = await deleteFromMemory(42, 1, "tenant-abc");

    expect(result).toEqual({ success: true, deletedItemCount: 1 });
  });

  it("should succeed silently if memory item already deleted (idempotent)", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([ASSET_ROW]);
    db.returning.mockResolvedValueOnce([]); // nothing deleted
    mockGetDb.mockResolvedValue(db as any);

    const { deleteFromMemory } = await import("../visionMemoryService");
    const result = await deleteFromMemory(42, 1, "tenant-abc");

    expect(result).toEqual({ success: true, deletedItemCount: 0 });
  });
});

describe("pinToMemory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should set salience to 1.0 for the memory item matching assetId", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([ASSET_ROW]);
    db.returning.mockResolvedValueOnce([{ id: 7 }]);
    mockGetDb.mockResolvedValue(db as any);

    const { pinToMemory } = await import("../visionMemoryService");
    await pinToMemory(42, 1, "tenant-abc");

    expect(db.update).toHaveBeenCalled();
    expect(db.set).toHaveBeenCalledWith(
      expect.objectContaining({ salience: "1.0" })
    );
  });

  it("should increment access_count when pinning", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([ASSET_ROW]);
    db.returning.mockResolvedValueOnce([{ id: 7 }]);
    mockGetDb.mockResolvedValue(db as any);

    const { pinToMemory } = await import("../visionMemoryService");
    await pinToMemory(42, 1, "tenant-abc");

    const setCall = db.set.mock.calls[0]?.[0];
    expect(setCall).toHaveProperty("lastAccessedAt");
  });

  it("should throw FORBIDDEN for unauthorized pin attempts", async () => {
    const db = makeDb();
    db.limit.mockResolvedValueOnce([{ ...ASSET_ROW, tenantId: "other-tenant" }]);
    mockGetDb.mockResolvedValue(db as any);

    const { pinToMemory } = await import("../visionMemoryService");
    await expect(pinToMemory(42, 1, "tenant-abc")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("chat command deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should detect deletion keywords in Thai and English messages", async () => {
    const { isImageDeletionCommand } = await import("../visionMemoryService");
    expect(isImageDeletionCommand("ลบรูปนี้ออกจาก memory")).toBe(true);
    expect(isImageDeletionCommand("remove this image from memory")).toBe(true);
    expect(isImageDeletionCommand("delete this image from memory")).toBe(true);
    expect(isImageDeletionCommand("forget this image")).toBe(true);
    expect(isImageDeletionCommand("สวัสดี")).toBe(false);
    expect(isImageDeletionCommand("show me this image")).toBe(false);
  });
});
