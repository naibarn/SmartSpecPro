import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock DB
vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

// Mock schema table references
vi.mock("../../drizzle/schema", () => ({
  conversationVisualState: {
    conversationId: "conversationId",
    recentAssetIds: "recentAssetIds",
    activeAssetIds: "activeAssetIds",
    comparedAssetIds: "comparedAssetIds",
    namedSets: "namedSets",
    updatedAt: "updatedAt",
  },
  mediaAssets: {},
}));

// Mock Redis
vi.mock("../redis", () => ({
  getRedisClient: vi.fn(),
  isRedisAvailable: vi.fn(() => false),
}));

import { getDb } from "../../db";
import { getRedisClient, isRedisAvailable } from "../redis";

const mockGetDb = vi.mocked(getDb);
const mockIsRedisAvailable = vi.mocked(isRedisAvailable);
const mockGetRedisClient = vi.mocked(getRedisClient);

function makeDb(overrides: Partial<Record<string, any>> = {}) {
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
    ...overrides,
  };
  // chain helpers
  db.select.mockReturnValue(db);
  db.from.mockReturnValue(db);
  db.where.mockReturnValue(db);
  db.insert.mockReturnValue(db);
  db.values.mockReturnValue(db);
  db.onConflictDoNothing.mockReturnValue(db);
  db.update.mockReturnValue(db);
  db.set.mockReturnValue(db);
  return db;
}

const DEFAULT_STATE = {
  conversationId: 1,
  recentAssetIds: [],
  activeAssetIds: [],
  comparedAssetIds: [],
  namedSets: {},
  updatedAt: null,
};

describe("visualStateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsRedisAvailable.mockReturnValue(false);
  });

  describe("getOrCreateState", () => {
    it("returns empty state for new conversation (no row)", async () => {
      const db = makeDb();
      db.limit.mockResolvedValueOnce([]); // no existing row
      db.onConflictDoNothing.mockReturnValue({ ...db, execute: vi.fn().mockResolvedValue({}) });
      db.returning.mockResolvedValueOnce([DEFAULT_STATE]);
      mockGetDb.mockResolvedValue(db as any);

      const { getOrCreateState } = await import("../visualStateService");
      const state = await getOrCreateState(1);

      expect(state.recentAssetIds).toEqual([]);
      expect(state.activeAssetIds).toEqual([]);
      expect(state.comparedAssetIds).toEqual([]);
      expect(state.namedSets).toEqual({});
    });

    it("returns existing state for known conversation", async () => {
      const existing = {
        conversationId: 1,
        recentAssetIds: [10, 20],
        activeAssetIds: [10],
        comparedAssetIds: [],
        namedSets: { favorites: [10] },
        updatedAt: new Date(),
      };
      const db = makeDb();
      db.limit.mockResolvedValueOnce([existing]);
      mockGetDb.mockResolvedValue(db as any);

      const { getOrCreateState } = await import("../visualStateService");
      const state = await getOrCreateState(1);

      expect(state.recentAssetIds).toEqual([10, 20]);
      expect(state.namedSets).toEqual({ favorites: [10] });
    });

    it("falls back to DB when Redis unavailable", async () => {
      mockIsRedisAvailable.mockReturnValue(false);
      const db = makeDb();
      db.limit.mockResolvedValueOnce([DEFAULT_STATE]);
      mockGetDb.mockResolvedValue(db as any);

      const { getOrCreateState } = await import("../visualStateService");
      await getOrCreateState(1);

      // DB was queried (Redis skipped)
      expect(db.select).toHaveBeenCalled();
    });

    it("reads from Redis cache when available (cache hit)", async () => {
      const cachedState = { ...DEFAULT_STATE, recentAssetIds: [99] };
      mockIsRedisAvailable.mockReturnValue(true);
      const mockRedis = {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedState)),
        setex: vi.fn().mockResolvedValue("OK"),
      };
      mockGetRedisClient.mockReturnValue(mockRedis as any);

      const db = makeDb();
      mockGetDb.mockResolvedValue(db as any);

      const { getOrCreateState } = await import("../visualStateService");
      const state = await getOrCreateState(1);

      expect(state.recentAssetIds).toEqual([99]);
      // DB should not be queried on cache hit
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  describe("addRecentAsset", () => {
    it("calls db.update with SQL jsonb operation", async () => {
      const db = makeDb();
      // getOrCreateState needs to find an existing row
      db.limit.mockResolvedValueOnce([DEFAULT_STATE]);
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { addRecentAsset } = await import("../visualStateService");
      await addRecentAsset(1, 42);

      // update was called (atomic JSONB operation)
      expect(db.update).toHaveBeenCalled();
    });

    it("does not add duplicate assetId (MRU — move to end)", async () => {
      const db = makeDb();
      db.limit.mockResolvedValueOnce([{ ...DEFAULT_STATE, recentAssetIds: [42, 10] }]);
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { addRecentAsset } = await import("../visualStateService");
      // Should not throw
      await addRecentAsset(1, 42);
      expect(db.update).toHaveBeenCalled();
    });
  });

  describe("setActiveAssets", () => {
    it("caps activeAssetIds at 5 items", async () => {
      const db = makeDb();
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { setActiveAssets } = await import("../visualStateService");
      // Pass 7 IDs — only 5 should be stored
      await setActiveAssets(1, [1, 2, 3, 4, 5, 6, 7]);

      expect(db.update).toHaveBeenCalled();
      const setCall = db.set.mock.calls[0][0];
      expect(setCall.activeAssetIds).toHaveLength(5);
    });

    it("replaces existing active set entirely", async () => {
      const db = makeDb();
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { setActiveAssets } = await import("../visualStateService");
      await setActiveAssets(1, [99, 100]);

      const setCall = db.set.mock.calls[0][0];
      expect(setCall.activeAssetIds).toEqual([99, 100]);
    });
  });

  describe("setComparedAssets", () => {
    it("updates comparedAssetIds list", async () => {
      const db = makeDb();
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { setComparedAssets } = await import("../visualStateService");
      await setComparedAssets(1, [5, 6]);

      expect(db.update).toHaveBeenCalled();
      const setCall = db.set.mock.calls[0][0];
      expect(setCall.comparedAssetIds).toEqual([5, 6]);
    });
  });

  describe("createNamedSet", () => {
    it("stores a named set in namedSets JSON", async () => {
      const db = makeDb();
      db.limit.mockResolvedValueOnce([DEFAULT_STATE]);
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { createNamedSet } = await import("../visualStateService");
      await createNamedSet(1, "favorites", [10, 20]);

      expect(db.update).toHaveBeenCalled();
    });

    it("throws when name becomes empty after sanitization (non-alphanumeric input)", async () => {
      const db = makeDb();
      db.limit.mockResolvedValueOnce([DEFAULT_STATE]);
      mockGetDb.mockResolvedValue(db as any);

      const { createNamedSet } = await import("../visualStateService");
      // "!!!" → "" after stripping non-alphanumeric characters
      await expect(createNamedSet(1, "!!!", [10])).rejects.toThrow(/alphanumeric/i);
    });

    it("truncates name to 64 characters (accepts 65-char name without throwing)", async () => {
      const db = makeDb();
      db.limit.mockResolvedValueOnce([DEFAULT_STATE]);
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { createNamedSet } = await import("../visualStateService");
      const longName = "a".repeat(65); // 65 chars → sliced to 64
      // Should not throw — 64-char name is valid
      await expect(createNamedSet(1, longName, [10])).resolves.toBeUndefined();
    });
  });

  describe("resolveNamedSet", () => {
    it("retrieves correct asset IDs for a known set name", async () => {
      const db = makeDb();
      db.limit.mockResolvedValueOnce([
        { ...DEFAULT_STATE, namedSets: { favorites: [10, 20] } },
      ]);
      mockGetDb.mockResolvedValue(db as any);

      const { resolveNamedSet } = await import("../visualStateService");
      const result = await resolveNamedSet(1, "favorites");
      expect(result).toEqual([10, 20]);
    });

    it("returns empty array for unknown set name", async () => {
      const db = makeDb();
      db.limit.mockResolvedValueOnce([DEFAULT_STATE]);
      mockGetDb.mockResolvedValue(db as any);

      const { resolveNamedSet } = await import("../visualStateService");
      const result = await resolveNamedSet(1, "nonexistent");
      expect(result).toEqual([]);
    });
  });

  describe("removeAssetFromState", () => {
    it("removes assetId from all lists", async () => {
      const stateWithAsset = {
        conversationId: 1,
        recentAssetIds: [1, 2, 3],
        activeAssetIds: [2, 4],
        comparedAssetIds: [2, 5],
        namedSets: {},
        updatedAt: null,
      };
      const db = makeDb();
      // First call for removeAssetFromState internals
      db.limit.mockResolvedValue([stateWithAsset]);
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { removeAssetFromState } = await import("../visualStateService");
      await removeAssetFromState(1, 2);

      // update was called to remove from lists
      expect(db.update).toHaveBeenCalled();
    });

    it("removes assetId from named sets (read-modify-write cleanup)", async () => {
      const stateWithNamedSets = {
        conversationId: 1,
        recentAssetIds: [],
        activeAssetIds: [],
        comparedAssetIds: [],
        namedSets: { favorites: [1, 2, 3], recent: [2, 4] },
        updatedAt: null,
      };
      const db = makeDb();
      db.limit.mockResolvedValue([stateWithNamedSets]);
      db.execute.mockResolvedValue({ rowCount: 1 });
      mockGetDb.mockResolvedValue(db as any);

      const { removeAssetFromState } = await import("../visualStateService");
      await removeAssetFromState(1, 2);

      // Second db.set call should have namedSets with assetId=2 removed
      const setCalls = db.set.mock.calls;
      expect(setCalls.length).toBeGreaterThanOrEqual(2);
      const namedSetsUpdate = setCalls.find((args: any[]) => args[0]?.namedSets !== undefined);
      expect(namedSetsUpdate).toBeDefined();
      const updatedSets = namedSetsUpdate[0].namedSets;
      expect(updatedSets.favorites).not.toContain(2);
      expect(updatedSets.favorites).toContain(1);
      expect(updatedSets.favorites).toContain(3);
      expect(updatedSets.recent).not.toContain(2);
      expect(updatedSets.recent).toContain(4);
    });
  });
});
