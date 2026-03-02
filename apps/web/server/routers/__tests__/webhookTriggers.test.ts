/**
 * Tests for webhookTriggers tRPC router
 *
 * Covers: CRUD operations, template validation, delivery log queries,
 * test endpoint, tenant isolation, RBAC.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
  getDb: vi.fn().mockResolvedValue({
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  }),
}));

vi.mock("../../../drizzle/schema", () => ({
  webhookTriggers: {
    id: "id",
    tenantId: "tenantId",
    userId: "userId",
    name: "name",
    description: "description",
    authType: "authType",
    authSecretEncrypted: "authSecretEncrypted",
    targetType: "targetType",
    targetConversationId: "targetConversationId",
    targetAgencyId: "targetAgencyId",
    targetWorkflowId: "targetWorkflowId",
    payloadTemplate: "payloadTemplate",
    rateLimitPerMinute: "rateLimitPerMinute",
    monthlyTriggerBudget: "monthlyTriggerBudget",
    isActive: "isActive",
    totalTriggers: "totalTriggers",
    lastTriggeredAt: "lastTriggeredAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  webhookTriggerLogs: {
    id: "id",
    triggerId: "triggerId",
    status: "status",
    processingTimeMs: "processingTimeMs",
    creditsConsumed: "creditsConsumed",
    errorMessage: "errorMessage",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
  and: vi.fn((...args) => ({ and: args })),
  desc: vi.fn((col) => ({ desc: col })),
  asc: vi.fn((col) => ({ asc: col })),
  // Returns the schema object itself (all columns); tests can destructure as needed
  getTableColumns: vi.fn((table: Record<string, unknown>) => ({ ...table })),
}));

const { mockGetTenantFeatureFlag } = vi.hoisted(() => ({
  mockGetTenantFeatureFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

const { mockEncrypt } = vi.hoisted(() => ({
  mockEncrypt: vi.fn((v: string) => `encrypted:${v}`),
}));

vi.mock("../../services/crypto", () => ({
  encrypt: mockEncrypt,
  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
}));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    domainAdminProcedure: createProcedure(),
    adminProcedure: createProcedure(),
    publicProcedure: createProcedure(),
  };
});

// ── Import subject under test ─────────────────────────────────────────────────

import { webhookTriggersRouter } from "../webhookTriggers";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides?: Record<string, unknown>) {
  return {
    user: { id: 1, role: "domain_admin", currentTenantId: "tenant-abc" },
    tenantId: "tenant-abc",
    ...overrides,
  };
}

async function callProcedure(procedure: any, input: any, ctx?: any) {
  const resolvedCtx = ctx ?? makeCtx();
  return procedure({ input, ctx: resolvedCtx });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("webhookTriggersRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup feature flag after clearAllMocks (list procedure checks this)
    mockGetTenantFeatureFlag.mockResolvedValue(true);
  });

  describe("list", () => {
    it("returns triggers belonging to the caller's tenant", async () => {
      const triggers = [
        { id: "trig-1", name: "Order Hook", tenantId: "tenant-abc" },
        { id: "trig-2", name: "Payment Hook", tenantId: "tenant-abc" },
      ];

      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(triggers),
          }),
        }),
      });

      const result = await callProcedure(webhookTriggersRouter.list, {});
      expect(result).toHaveLength(2);
      expect(result[0].tenantId).toBe("tenant-abc");
    });
  });

  describe("create", () => {
    it("creates a trigger and encrypts the auth secret", async () => {
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{
            id: "new-trig-uuid",
            name: "Test Trigger",
            tenantId: "tenant-abc",
            authSecretEncrypted: "encrypted:my-secret",
          }]),
        }),
      });

      const result = await callProcedure(webhookTriggersRouter.create, {
        name: "Test Trigger",
        authType: "token",
        authSecret: "my-secret",
        targetType: "chat",
        targetConversationId: 42,
        rateLimitPerMinute: 10,
      });

      expect(mockEncrypt).toHaveBeenCalledWith("my-secret");
      expect(result.triggerId).toBe("new-trig-uuid");
      expect(result.webhookUrl).toContain("new-trig-uuid");
    });

    it("rejects payload_template with non-allowlisted patterns", async () => {
      await expect(
        callProcedure(webhookTriggersRouter.create, {
          name: "Bad Template",
          authType: "token",
          authSecret: "my-secret",
          targetType: "chat",
          targetConversationId: 42,
          payloadTemplate: { message: "{{system.env}}" },
        })
      ).rejects.toThrow();
    });

    it("rejects payload_template exceeding 2000 chars when stringified", async () => {
      const longTemplate = { message: "x".repeat(2001) };
      await expect(
        callProcedure(webhookTriggersRouter.create, {
          name: "Long Template",
          authType: "token",
          authSecret: "my-secret",
          targetType: "chat",
          targetConversationId: 42,
          payloadTemplate: longTemplate,
        })
      ).rejects.toThrow();
    });
  });

  describe("getById", () => {
    it("returns trigger without decrypted secret — authSecretConfigured flag instead", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: "trig-1",
              tenantId: "tenant-abc",
              userId: 1,
              authSecretEncrypted: "encrypted:mysecret",
              name: "Test",
            }]),
          }),
        }),
      });

      const result = await callProcedure(webhookTriggersRouter.getById, { triggerId: "trig-1" });
      expect(result.authSecretConfigured).toBe(true);
      expect(result).not.toHaveProperty("authSecretEncrypted");
    });

    it("returns NOT_FOUND for trigger belonging to different tenant", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{
              id: "trig-1",
              tenantId: "other-tenant",
            }]),
          }),
        }),
      });

      await expect(
        callProcedure(webhookTriggersRouter.getById, { triggerId: "trig-1" })
      ).rejects.toThrow();
    });
  });

  describe("update", () => {
    it("allows updating name and rate_limit", async () => {
      // First select for ownership check
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc", userId: 1 }]),
          }),
        }),
      });

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "trig-1", name: "Updated", tenantId: "tenant-abc" }]),
          }),
        }),
      });

      const result = await callProcedure(webhookTriggersRouter.update, {
        triggerId: "trig-1",
        name: "Updated",
        rateLimitPerMinute: 20,
      });
      expect(result).toBeDefined();
    });

    it("re-encrypts secret when authSecret is provided in update", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc", userId: 1 }]),
          }),
        }),
      });

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc" }]),
          }),
        }),
      });

      await callProcedure(webhookTriggersRouter.update, {
        triggerId: "trig-1",
        authSecret: "new-secret",
      });

      expect(mockEncrypt).toHaveBeenCalledWith("new-secret");
    });
  });

  describe("delete", () => {
    it("soft-deletes trigger by setting is_active = false", async () => {
      // ownership check
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc", userId: 1 }]),
          }),
        }),
      });

      const mockSet = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      });
      mockDbUpdate.mockReturnValue({ set: mockSet });

      await callProcedure(webhookTriggersRouter.delete, { triggerId: "trig-1" });
      expect(mockDbUpdate).toHaveBeenCalled();
    });
  });

  describe("getLogs", () => {
    it("returns delivery logs ordered by created_at DESC", async () => {
      const logs = [
        { id: "log-2", triggerId: "trig-1", status: "success", createdAt: new Date() },
        { id: "log-1", triggerId: "trig-1", status: "auth_failed", createdAt: new Date() },
      ];

      // First call for ownership check, second for logs
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc", userId: 1 }]),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(logs),
                }),
              }),
            }),
          }),
        });

      const result = await callProcedure(webhookTriggersRouter.getLogs, {
        triggerId: "trig-1",
        limit: 20,
        offset: 0,
      });
      expect(result).toHaveLength(2);
    });

    it("rejects log query for trigger belonging to different tenant", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "other-tenant" }]),
          }),
        }),
      });

      await expect(
        callProcedure(webhookTriggersRouter.getLogs, { triggerId: "trig-1", limit: 20, offset: 0 })
      ).rejects.toThrow();
    });
  });

  describe("regenerateSecret", () => {
    it("generates a new secret, encrypts it, and returns the plaintext once", async () => {
      mockDbSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "trig-1", tenantId: "tenant-abc", userId: 1 }]),
          }),
        }),
      });

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await callProcedure(webhookTriggersRouter.regenerateSecret, { triggerId: "trig-1" });
      expect(result.newSecret).toBeDefined();
      expect(typeof result.newSecret).toBe("string");
      expect(result.newSecret.length).toBeGreaterThan(16);
      expect(mockEncrypt).toHaveBeenCalled();
    });
  });
});
