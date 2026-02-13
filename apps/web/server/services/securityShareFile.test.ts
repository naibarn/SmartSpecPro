import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Section 11: Security Tests for ShareFile feature.
 *
 * Tests are organized by security concern:
 * 1. Tenant isolation — cross-tenant access denied
 * 2. Permission hierarchy — read < write < delete < owner
 * 3. Group admin authorization — only admin/owner can manage
 * 4. Rate limiting — max groups/members enforced
 * 5. Permission bypass prevention — canRead/canManage checks
 */

// ─── DB & Redis Mocks ─────────────────────────────────────────────────────
const { mockGetDb, mockDb, mockTx, resetHarness, setDbSelectQueue, setTxSelectQueue } =
  vi.hoisted(() => {
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
      query.then = (resolve: (v: any[]) => void, reject?: (r: unknown) => void) =>
        Promise.resolve(rows).then(resolve, reject);
      return query;
    }

    function createSelectMock(queue: any[][]) {
      return vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => buildQuery(queue.shift() ?? [])),
      }));
    }

    const txInsertCalls: Array<{ table: unknown; values: unknown }> = [];
    const txUpdateCalls: Array<{ table: unknown; values: unknown }> = [];
    const txDeleteCalls: Array<{ table: unknown }> = [];

    const mockTx = {
      select: createSelectMock(txSelectQueue),
      insert: vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn().mockImplementation((values: unknown) => {
          txInsertCalls.push({ table, values });
          return {
            returning: vi.fn().mockResolvedValue([
              {
                id: 10,
                tenantId: "tenant-a",
                name: "Test Group",
                description: null,
                ownerId: 1,
                iconUrl: null,
                settings: { visibility: "private", joinPolicy: "invite_only" },
                memberCount: 0,
                createdAt: new Date("2026-02-12T00:00:00.000Z"),
                updatedAt: new Date("2026-02-12T00:00:00.000Z"),
                deletedAt: null,
              },
            ]),
          };
        }),
      })),
      update: vi.fn().mockImplementation((table: unknown) => ({
        set: vi.fn().mockImplementation((values: unknown) => {
          txUpdateCalls.push({ table, values });
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
      delete: vi.fn().mockImplementation((table: unknown) => {
        txDeleteCalls.push({ table });
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    };

    const mockDb = {
      select: createSelectMock(dbSelectQueue),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<any>) => {
        return fn(mockTx);
      }),
    };

    return {
      mockGetDb: vi.fn().mockResolvedValue(mockDb),
      mockDb,
      mockTx,
      mockRedis,
      setDbSelectQueue(queues: any[][]) {
        dbSelectQueue.length = 0;
        dbSelectQueue.push(...queues);
      },
      setTxSelectQueue(queues: any[][]) {
        txSelectQueue.length = 0;
        txSelectQueue.push(...queues);
      },
      resetHarness() {
        dbSelectQueue.length = 0;
        txSelectQueue.length = 0;
        txInsertCalls.length = 0;
        txUpdateCalls.length = 0;
        txDeleteCalls.length = 0;
        vi.clearAllMocks();
        mockDb.transaction.mockImplementation(
          async (fn: (tx: typeof mockTx) => Promise<any>) => fn(mockTx),
        );
      },
    };
  });

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../redis", () => ({
  getRedisOrNull: vi.fn().mockResolvedValue({
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
    del: vi.fn(),
  }),
}));

const mockGetUserGroups = vi.fn().mockResolvedValue([]);

vi.mock("./groupsService", async (importOriginal) => {
  const orig = await importOriginal<typeof import("./groupsService")>();
  return {
    ...orig,
    getUserGroups: (...args: any[]) => mockGetUserGroups(...args),
  };
});

import {
  canManageLibraryItem,
  canReadLibraryItem,
  getUserEffectivePermission,
} from "./libraryService";

import {
  createUserGroup,
  addGroupMember,
  removeGroupMember,
  deleteUserGroup,
} from "./groupsService";

beforeEach(() => {
  resetHarness();
  mockGetDb.mockResolvedValue(mockDb);
});

// ─── Category 1: Tenant Isolation ──────────────────────────────────────────

describe("Tenant Isolation", () => {
  describe("canReadLibraryItem — cross-tenant blocked", () => {
    it("denies access when item tenant differs from actor tenant", () => {
      const item = { tenantId: "tenant-a", ownerUserId: 1, visibility: "private" as const };
      const actor = { userId: 99, tenantId: "tenant-b", role: "user" as const };

      expect(canReadLibraryItem(item, actor, "read")).toBe(false);
    });

    it("denies access even with admin role across tenants", () => {
      const item = { tenantId: "tenant-a", ownerUserId: 1, visibility: "private" as const };
      const actor = { userId: 99, tenantId: "tenant-b", role: "admin" as const };

      expect(canReadLibraryItem(item, actor, "read")).toBe(false);
    });

    it("denies access to public items across tenants", () => {
      const item = { tenantId: "tenant-a", ownerUserId: 1, visibility: "public" as const };
      const actor = { userId: 99, tenantId: "tenant-b", role: "user" as const };

      expect(canReadLibraryItem(item, actor, "read")).toBe(false);
    });

    it("denies access even with owner permission level across tenants", () => {
      const item = { tenantId: "tenant-a", ownerUserId: 1, visibility: "private" as const };
      const actor = { userId: 99, tenantId: "tenant-b", role: "user" as const };

      expect(canReadLibraryItem(item, actor, "owner")).toBe(false);
    });
  });

  describe("canManageLibraryItem — cross-tenant blocked", () => {
    it("denies management when item tenant differs from actor tenant", () => {
      const item = { tenantId: "tenant-a", ownerUserId: 1 };
      const actor = { userId: 99, tenantId: "tenant-b", role: "user" as const };

      expect(canManageLibraryItem(item, actor, "write")).toBe(false);
    });

    it("denies management even with admin role across tenants", () => {
      const item = { tenantId: "tenant-a", ownerUserId: 1 };
      const actor = { userId: 99, tenantId: "tenant-b", role: "admin" as const };

      expect(canManageLibraryItem(item, actor, "owner")).toBe(false);
    });
  });

  describe("createUserGroup — tenant isolation via actor context", () => {
    it("creates group scoped to actor tenant only", async () => {
      // ownedCount query
      setTxSelectQueue([[{ count: 0 }]]);

      const result = await createUserGroup(
        { name: "Tenant A Only", description: "" },
        { userId: 1, tenantId: "tenant-a", role: "user" },
      );

      expect(result.tenantId).toBe("tenant-a");
    });
  });

  describe("addGroupMember — cross-tenant member addition blocked", () => {
    it("rejects adding member to group in different tenant", async () => {
      // getGroupForTenant returns null for wrong tenant
      setDbSelectQueue([
        [], // group not found in actor's tenant
      ]);

      await expect(
        addGroupMember(
          { groupId: 10, userId: 99 },
          { userId: 1, tenantId: "tenant-b", role: "user" },
        ),
      ).rejects.toThrow(TRPCError);
    });
  });
});

// ─── Category 2: Permission Hierarchy ──────────────────────────────────────

describe("Permission Hierarchy", () => {
  const item = { tenantId: "50", ownerUserId: 999, visibility: "private" as const };
  const actor = { userId: 5, tenantId: 50, role: "user" as const };

  describe("canReadLibraryItem — permission levels", () => {
    it("grants read with 'read' permission", () => {
      expect(canReadLibraryItem(item, actor, "read")).toBe(true);
    });

    it("grants read with 'write' permission", () => {
      expect(canReadLibraryItem(item, actor, "write")).toBe(true);
    });

    it("grants read with 'delete' permission", () => {
      expect(canReadLibraryItem(item, actor, "delete")).toBe(true);
    });

    it("grants read with 'owner' permission", () => {
      expect(canReadLibraryItem(item, actor, "owner")).toBe(true);
    });

    it("denies read with null permission", () => {
      expect(canReadLibraryItem(item, actor, null)).toBe(false);
    });
  });

  describe("canManageLibraryItem — permission levels", () => {
    it("denies management with 'read' permission", () => {
      const mgmtItem = { tenantId: "50", ownerUserId: 999 };
      expect(canManageLibraryItem(mgmtItem, actor, "read")).toBe(false);
    });

    it("grants management with 'write' permission", () => {
      const mgmtItem = { tenantId: "50", ownerUserId: 999 };
      expect(canManageLibraryItem(mgmtItem, actor, "write")).toBe(true);
    });

    it("grants management with 'delete' permission", () => {
      const mgmtItem = { tenantId: "50", ownerUserId: 999 };
      expect(canManageLibraryItem(mgmtItem, actor, "delete")).toBe(true);
    });

    it("grants management with 'owner' permission", () => {
      const mgmtItem = { tenantId: "50", ownerUserId: 999 };
      expect(canManageLibraryItem(mgmtItem, actor, "owner")).toBe(true);
    });

    it("denies management with null permission", () => {
      const mgmtItem = { tenantId: "50", ownerUserId: 999 };
      expect(canManageLibraryItem(mgmtItem, actor, null)).toBe(false);
    });
  });

  describe("special roles", () => {
    it("admin can always read within same tenant", () => {
      const adminActor = { userId: 5, tenantId: 50, role: "admin" as const };
      expect(canReadLibraryItem(item, adminActor, null)).toBe(true);
    });

    it("admin can always manage within same tenant", () => {
      const adminActor = { userId: 5, tenantId: 50, role: "admin" as const };
      const mgmtItem = { tenantId: "50", ownerUserId: 999 };
      expect(canManageLibraryItem(mgmtItem, adminActor, null)).toBe(true);
    });

    it("owner can always read their own items", () => {
      const ownerItem = { tenantId: "50", ownerUserId: 5, visibility: "private" as const };
      expect(canReadLibraryItem(ownerItem, actor, null)).toBe(true);
    });

    it("owner can always manage their own items", () => {
      const ownerItem = { tenantId: "50", ownerUserId: 5 };
      expect(canManageLibraryItem(ownerItem, actor, null)).toBe(true);
    });
  });

  describe("visibility", () => {
    it("public items are readable by any tenant member", () => {
      const publicItem = { tenantId: "50", ownerUserId: 999, visibility: "public" as const };
      expect(canReadLibraryItem(publicItem, actor, null)).toBe(true);
    });

    it("team items are readable by any tenant member", () => {
      const teamItem = { tenantId: "50", ownerUserId: 999, visibility: "team" as const };
      expect(canReadLibraryItem(teamItem, actor, null)).toBe(true);
    });

    it("private items require explicit permission", () => {
      const privateItem = { tenantId: "50", ownerUserId: 999, visibility: "private" as const };
      expect(canReadLibraryItem(privateItem, actor, null)).toBe(false);
    });
  });

  describe("permission hierarchy merge (getUserEffectivePermission)", () => {
    it("returns highest level when user has direct:read and group:write", async () => {
      // Mock user's groups: user is in group 20
      mockGetUserGroups.mockResolvedValueOnce([{ id: 20, name: "Editors", role: "member" }]);

      setDbSelectQueue([
        // 1. libraryItems query — item exists, owned by someone else
        [
          {
            id: 100,
            tenantId: "50",
            ownerUserId: 999,
            visibility: "private",
            itemType: "md",
          },
        ],
        // 2. libraryPermissions query — direct:read + group:write
        [
          {
            subjectType: "user",
            subjectId: "5",
            permissionLevel: "read",
            expiresAt: null,
            libraryItemId: 100,
          },
          {
            subjectType: "group",
            subjectId: "20",
            permissionLevel: "write",
            expiresAt: null,
            libraryItemId: 100,
          },
        ],
      ]);

      const result = await getUserEffectivePermission(100, {
        userId: 5,
        tenantId: 50,
        role: "user",
      });

      expect(result.effectivePermissionLevel).toBe("write");
      expect(result.sources).toHaveLength(2);
      expect(result.sources.map((s) => s.type).sort()).toEqual(["direct", "group"]);
    });

    it("returns null when item not found (cross-tenant defense)", async () => {
      setDbSelectQueue([
        // item not found in actor's tenant
        [],
      ]);

      const result = await getUserEffectivePermission(100, {
        userId: 5,
        tenantId: 50,
        role: "user",
      });

      expect(result.effectivePermissionLevel).toBe(null);
      expect(result.sources).toHaveLength(0);
    });
  });
});

// ─── Category 3: Group Admin Authorization ─────────────────────────────────

describe("Group Admin Authorization", () => {
  describe("addGroupMember — only admin/owner can add", () => {
    it("throws FORBIDDEN when regular member tries to add", async () => {
      // 1. getGroupForTenant
      setDbSelectQueue([
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Marketing", deletedAt: null }],
        // 2. requireAdminOrOwner → getGroupForTenant
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Marketing", deletedAt: null }],
        // 3. requireAdminOrOwner → hasAdminMembership → returns member (not admin)
        [{ role: "member" }],
      ]);

      await expect(
        addGroupMember(
          { groupId: 10, userId: 5 },
          { userId: 3, tenantId: "tenant-a", role: "user" },
        ),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("removeGroupMember — only admin/owner can remove", () => {
    it("throws FORBIDDEN when regular member tries to remove", async () => {
      // 1. getGroupForTenant
      setDbSelectQueue([
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Marketing", deletedAt: null }],
        // 2. requireAdminOrOwner → getGroupForTenant
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Marketing", deletedAt: null }],
        // 3. requireAdminOrOwner → hasAdminMembership → returns member (not admin)
        [{ role: "member" }],
      ]);

      await expect(
        removeGroupMember(
          { groupId: 10, userId: 5 },
          { userId: 3, tenantId: "tenant-a", role: "user" },
        ),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("deleteUserGroup — only owner can delete", () => {
    it("throws FORBIDDEN when non-owner admin tries to delete", async () => {
      // 1. getGroupForTenant
      setDbSelectQueue([
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Marketing", deletedAt: null }],
      ]);

      await expect(
        deleteUserGroup(
          10,
          { userId: 3, tenantId: "tenant-a", role: "user" },
        ),
      ).rejects.toThrow(TRPCError);
    });
  });

  describe("removeGroupMember (self-removal / leave)", () => {
    it("allows member to leave group voluntarily", async () => {
      setDbSelectQueue([
        // 1. getGroupForTenant
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Marketing", deletedAt: null }],
        // 2. membership query (self-removal skips requireAdminOrOwner)
        [{ id: 88, groupId: 10, userId: 5, status: "active", role: "member" }],
      ]);

      const result = await removeGroupMember(
        { groupId: 10, userId: 5 },
        { userId: 5, tenantId: "tenant-a", role: "user" },
      );

      expect(result.success).toBe(true);
    });

    it("throws BAD_REQUEST when owner tries to leave", async () => {
      setDbSelectQueue([
        // 1. getGroupForTenant
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Marketing", deletedAt: null }],
      ]);

      await expect(
        removeGroupMember(
          { groupId: 10, userId: 1 },
          { userId: 1, tenantId: "tenant-a", role: "user" },
        ),
      ).rejects.toThrow(/Owner cannot leave/);
    });
  });
});

// ─── Category 4: Rate Limiting ─────────────────────────────────────────────

describe("Rate Limiting", () => {
  describe("createUserGroup — max 50 groups per user", () => {
    it("throws when user has reached max group count", async () => {
      // ownedCount query runs on db (not tx)
      setDbSelectQueue([[{ count: 50 }]]);

      await expect(
        createUserGroup(
          { name: "Group 51", description: "" },
          { userId: 1, tenantId: "tenant-a", role: "user" },
        ),
      ).rejects.toThrow(/Maximum 50 groups/);
    });
  });

  describe("addGroupMember — max 100 members per group", () => {
    it("throws when group has reached max member count", async () => {
      // Call chain on db:
      // 1. requireAdminOrOwner → getGroupForTenant
      // 2. requireAdminOrOwner → getGroupForTenant (inner)
      // 3. requireAdminOrOwner → hasAdminMembership (actor is owner, so skipped)
      // Note: actor.userId === group.ownerId so requireAdminOrOwner short-circuits
      // 4. requireTargetUserInTenant
      // 5. activeMemberCount
      setDbSelectQueue([
        // 1. getGroupForTenant (inside requireAdminOrOwner)
        [{ id: 10, tenantId: "tenant-a", ownerId: 1, name: "Full Group", deletedAt: null }],
        // 2. requireTargetUserInTenant
        [{ id: 99, currentTenantId: "tenant-a" }],
        // 3. activeMemberCount
        [{ count: 100 }],
      ]);

      await expect(
        addGroupMember(
          { groupId: 10, userId: 99 },
          { userId: 1, tenantId: "tenant-a", role: "user" },
        ),
      ).rejects.toThrow(/Maximum 100 members/);
    });
  });
});

// ─── Category 5: Permission Bypass Prevention ──────────────────────────────

describe("Permission Bypass Prevention", () => {
  describe("read-only user cannot manage items", () => {
    it("canManageLibraryItem denies read-only permission", () => {
      const item = { tenantId: "50", ownerUserId: 999 };
      const actor = { userId: 5, tenantId: 50, role: "user" as const };

      // Even though user has read permission, they cannot manage
      expect(canManageLibraryItem(item, actor, "read")).toBe(false);
    });
  });

  describe("null permission denies all access to private items", () => {
    it("canReadLibraryItem denies null permission on private item", () => {
      const item = { tenantId: "50", ownerUserId: 999, visibility: "private" as const };
      const actor = { userId: 5, tenantId: 50, role: "user" as const };

      expect(canReadLibraryItem(item, actor, null)).toBe(false);
    });

    it("canManageLibraryItem denies null permission on any item", () => {
      const item = { tenantId: "50", ownerUserId: 999 };
      const actor = { userId: 5, tenantId: 50, role: "user" as const };

      expect(canManageLibraryItem(item, actor, null)).toBe(false);
    });
  });

  describe("non-owner non-admin cannot circumvent permission checks", () => {
    it("regular user with no permission cannot read private item", () => {
      const item = { tenantId: "50", ownerUserId: 999, visibility: "private" as const };
      const actor = { userId: 5, tenantId: 50, role: "user" as const };

      expect(canReadLibraryItem(item, actor, null)).toBe(false);
    });

    it("regular user with no permission cannot manage any item", () => {
      const item = { tenantId: "50", ownerUserId: 999 };
      const actor = { userId: 5, tenantId: 50, role: "user" as const };

      expect(canManageLibraryItem(item, actor, null)).toBe(false);
    });
  });
});

// ─── Category 6: Integration Test Stubs (require real DB) ──────────────────

describe("Integration Tests (stubs for real DB environment)", () => {
  describe("End-to-End Group Management", () => {
    it.todo("group creation flow: create → initial membership → appears in list");
    it.todo("member management flow: add → count increases → remove → count decreases");
    it.todo("group deletion cascades to permissions");
    it.todo("public group search and join flow");
  });

  describe("Group Permission Integration", () => {
    it.todo("share file with group → members gain access");
    it.todo("remove member from group → loses file access");
    it.todo("delete group → all members lose file access");
    it.todo("move to trash → file excluded from search for sharees");
  });

  describe("Audit Logging", () => {
    it.todo("all group mutations are logged");
    it.todo("all share mutations are logged");
    it.todo("permission denial events are logged");
  });
});
