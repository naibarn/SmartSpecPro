import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockDb,
  mockTx,
  mockRedis,
  resetHarness,
  setDbSelectQueue,
  setTxSelectQueue,
} = vi.hoisted(() => {
  const dbSelectQueue: any[][] = [];
  const txSelectQueue: any[][] = [];

  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  };

  function buildQuery(rows: any[]) {
    const query: any = {};
    query.where = vi.fn().mockReturnValue(query);
    query.innerJoin = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockReturnValue(query);
    query.offset = vi.fn().mockResolvedValue(rows);
    query.then = (resolve: (value: any[]) => void, reject?: (reason: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    return query;
  }

  function createSelectMock(queue: any[][]) {
    return vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => buildQuery(queue.shift() ?? [])),
    }));
  }

  const txSelect = createSelectMock(txSelectQueue);
  const txInsertCalls: Array<{ table: unknown; values: unknown }> = [];
  const txUpdateCalls: Array<{ table: unknown; values: unknown }> = [];
  const txDeleteCalls: Array<{ table: unknown }> = [];

  const mockTx = {
    select: txSelect,
    insert: vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn().mockImplementation((values: unknown) => {
        txInsertCalls.push({ table, values });
        if (txInsertCalls.length === 1) {
          return {
            returning: vi.fn().mockResolvedValue([
              {
                id: 10,
                tenantId: "tenant-1",
                name: "Marketing",
                description: "Main group",
                ownerId: 7,
                iconUrl: null,
                settings: {
                  visibility: "private",
                  joinPolicy: "invite_only",
                },
                memberCount: 0,
                createdAt: new Date("2026-02-12T00:00:00.000Z"),
                updatedAt: new Date("2026-02-12T00:00:00.000Z"),
                deletedAt: null,
              },
            ]),
          };
        }
        return Promise.resolve(undefined);
      }),
    })),
    update: vi.fn().mockImplementation((table: unknown) => ({
      set: vi.fn().mockImplementation((values: unknown) => {
        txUpdateCalls.push({ table, values });
        return {
          where: vi.fn().mockResolvedValue(undefined),
        };
      }),
    })),
    delete: vi.fn().mockImplementation((table: unknown) => ({
      where: vi.fn().mockImplementation(() => {
        txDeleteCalls.push({ table });
        return Promise.resolve(undefined);
      }),
    })),
    __calls: {
      txInsertCalls,
      txUpdateCalls,
      txDeleteCalls,
    },
  } as any;

  const dbSelect = createSelectMock(dbSelectQueue);
  const dbDelete = vi.fn().mockImplementation(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  }));

  const db = {
    select: dbSelect,
    insert: vi.fn(),
    update: vi.fn(),
    delete: dbDelete,
    transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
  };

  return {
    mockGetDb: vi.fn().mockResolvedValue(db),
    mockDb: db,
    mockTx,
    mockRedis,
    resetHarness: () => {
      dbSelectQueue.length = 0;
      txSelectQueue.length = 0;
      txInsertCalls.length = 0;
      txUpdateCalls.length = 0;
      txDeleteCalls.length = 0;
      mockRedis.get.mockReset();
      mockRedis.setex.mockReset();
      mockRedis.del.mockReset();
      db.select.mockClear();
      db.insert.mockClear();
      db.update.mockClear();
      db.delete.mockClear();
      db.transaction.mockClear();
      mockTx.select.mockClear();
      mockTx.insert.mockClear();
      mockTx.update.mockClear();
      mockTx.delete.mockClear();
    },
    setDbSelectQueue: (rows: any[][]) => {
      dbSelectQueue.length = 0;
      dbSelectQueue.push(...rows);
    },
    setTxSelectQueue: (rows: any[][]) => {
      txSelectQueue.length = 0;
      txSelectQueue.push(...rows);
    },
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./redis", () => ({
  getRedisClient: () => mockRedis,
  isRedisAvailable: () => true,
}));

import {
  addGroupMember,
  approveJoinRequest,
  createUserGroup,
  deleteUserGroup,
  getUserGroups,
  rejectJoinRequest,
  removeGroupMember,
  searchPublicGroups,
} from "./groupsService";

describe("groupsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mockGetDb.mockResolvedValue(mockDb);
  });

  describe("createUserGroup", () => {
    it("creates group + owner membership and invalidates owner cache", async () => {
      setDbSelectQueue([[{ count: 0 }]]);

      const result = await createUserGroup(
        {
          name: "  Marketing  ",
          description: " Main group ",
        },
        {
          userId: 7,
          tenantId: "tenant-1",
          role: "user",
        },
      );

      expect(result.id).toBe(10);
      expect(result.memberCount).toBe(1);
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.insert).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith("user:7:groups:tenant-1");
    });

    it("rejects when owner already reached max groups", async () => {
      setDbSelectQueue([[{ count: 50 }]]);

      await expect(
        createUserGroup(
          { name: "Overflow" },
          { userId: 7, tenantId: "tenant-1", role: "user" },
        ),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      } satisfies Partial<TRPCError>);

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it("maps duplicate key errors to CONFLICT", async () => {
      setDbSelectQueue([[{ count: 0 }]]);
      mockDb.transaction.mockRejectedValueOnce(new Error("duplicate key value violates unique constraint"));

      await expect(
        createUserGroup(
          { name: "Marketing" },
          { userId: 7, tenantId: "tenant-1", role: "user" },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      } satisfies Partial<TRPCError>);
    });
  });

  describe("getUserGroups", () => {
    it("serves cached groups without hitting database", async () => {
      const cached = [
        {
          id: 22,
          tenantId: "tenant-1",
          name: "Cached",
          role: "admin",
        },
      ];
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(cached));

      const result = await getUserGroups({
        userId: 7,
        tenantId: "tenant-1",
      });

      expect(result).toEqual(cached);
      expect(mockDb.select).not.toHaveBeenCalled();
    });

    it("queries db and stores cache on miss", async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      setDbSelectQueue([
        [
          {
            group: {
              id: 1,
              tenantId: "tenant-1",
              name: "Writers",
              description: null,
              ownerId: 7,
              iconUrl: null,
              settings: { visibility: "private", joinPolicy: "invite_only" },
              memberCount: 2,
              createdAt: new Date("2026-02-12T00:00:00.000Z"),
              updatedAt: new Date("2026-02-12T00:00:00.000Z"),
              deletedAt: null,
            },
            role: "member",
          },
        ],
      ]);

      const result = await getUserGroups({
        userId: 7,
        tenantId: "tenant-1",
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("member");
      expect(mockRedis.setex).toHaveBeenCalledTimes(1);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "user:7:groups:tenant-1",
        60,
        expect.any(String),
      );
    });
  });

  describe("addGroupMember", () => {
    it("rejects cross-tenant target user", async () => {
      setDbSelectQueue([
        [
          {
            id: 10,
            tenantId: "tenant-1",
            ownerId: 7,
            name: "Marketing",
            deletedAt: null,
          },
        ],
        [{ id: 9, currentTenantId: "tenant-2" }],
      ]);

      await expect(
        addGroupMember(
          { groupId: 10, userId: 9, role: "member" },
          { userId: 7, tenantId: "tenant-1", role: "user" },
        ),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      } satisfies Partial<TRPCError>);

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it("rejects when target is already active member", async () => {
      setDbSelectQueue([
        [
          {
            id: 10,
            tenantId: "tenant-1",
            ownerId: 7,
            name: "Marketing",
            deletedAt: null,
          },
        ],
        [{ id: 9, currentTenantId: "tenant-1" }],
        [{ count: 5 }],
      ]);
      setTxSelectQueue([
        [
          {
            id: 77,
            groupId: 10,
            userId: 9,
            status: "active",
            role: "member",
          },
        ],
      ]);

      await expect(
        addGroupMember(
          { groupId: 10, userId: 9, role: "member" },
          { userId: 7, tenantId: "tenant-1", role: "user" },
        ),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      } satisfies Partial<TRPCError>);
    });
  });

  describe("removeGroupMember", () => {
    it("prevents owner from removing self", async () => {
      setDbSelectQueue([
        [
          {
            id: 10,
            tenantId: "tenant-1",
            ownerId: 7,
            name: "Marketing",
            deletedAt: null,
          },
        ],
      ]);

      await expect(
        removeGroupMember(
          { groupId: 10, userId: 7 },
          { userId: 7, tenantId: "tenant-1", role: "user" },
        ),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      } satisfies Partial<TRPCError>);

      expect(mockDb.transaction).not.toHaveBeenCalled();
    });
  });

  describe("deleteUserGroup", () => {
    it("soft deletes group, cascades permissions, and invalidates all member caches", async () => {
      setDbSelectQueue([
        [
          {
            id: 10,
            tenantId: "tenant-1",
            ownerId: 7,
            name: "Marketing",
            deletedAt: null,
          },
        ],
        [{ userId: 7 }, { userId: 9 }],
      ]);

      const result = await deleteUserGroup(10, {
        userId: 7,
        tenantId: "tenant-1",
        role: "user",
      });

      expect(result).toEqual({ success: true });
      expect(mockTx.update).toHaveBeenCalledTimes(1);
      expect(mockTx.delete).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith("user:7:groups:tenant-1");
      expect(mockRedis.del).toHaveBeenCalledWith("user:9:groups:tenant-1");
    });
  });

  describe("approveJoinRequest", () => {
    it("approves pending request and invalidates target cache", async () => {
      setDbSelectQueue([
        [
          {
            id: 10,
            tenantId: "tenant-1",
            ownerId: 7,
            name: "Marketing",
            deletedAt: null,
          },
        ],
        [
          {
            id: 300,
            groupId: 10,
            userId: 9,
            status: "pending",
          },
        ],
      ]);

      const result = await approveJoinRequest(
        { groupId: 10, userId: 9 },
        { userId: 7, tenantId: "tenant-1", role: "user" },
      );

      expect(result).toEqual({ success: true });
      expect(mockTx.update).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledWith("user:9:groups:tenant-1");
    });
  });

  describe("rejectJoinRequest", () => {
    it("deletes pending join request after admin check", async () => {
      setDbSelectQueue([
        [
          {
            id: 10,
            tenantId: "tenant-1",
            ownerId: 7,
            name: "Marketing",
            deletedAt: null,
          },
        ],
      ]);

      const result = await rejectJoinRequest(
        { groupId: 10, userId: 9 },
        { userId: 7, tenantId: "tenant-1", role: "user" },
      );

      expect(result).toEqual({ success: true });
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe("searchPublicGroups", () => {
    it("returns paginated rows for same tenant", async () => {
      const rows = [
        { id: 1, name: "Marketing Public", tenantId: "tenant-1" },
        { id: 2, name: "Engineering Public", tenantId: "tenant-1" },
      ];
      setDbSelectQueue([rows]);

      const result = await searchPublicGroups(
        {
          query: "public",
          limit: 10,
          offset: 0,
        },
        {
          userId: 7,
          tenantId: "tenant-1",
        },
      );

      expect(result).toEqual(rows);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });
  });
});
