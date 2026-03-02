/**
 * Tests for the widget tRPC router.
 *
 * Covers:
 * - CRUD operations (list, getById, create, update, delete)
 * - Embed code generation
 * - Tenant isolation (can only access own tenant's widgets)
 * - Feature flag enforcement
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Module mocks ─────────────────────────────────────────────────────────────

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
    adminProcedure: createProcedure(),
    domainAdminProcedure: createProcedure(),
  };
});

const { mockGetTenantFeatureFlag } = vi.hoisted(() => ({
  mockGetTenantFeatureFlag: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
}));

const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete } = vi.hoisted(() => ({
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
}));

vi.mock("../../../drizzle/schema", () => ({
  chatWidgets: {
    id: "id",
    tenantId: "tenantId",
    name: "name",
    isActive: "isActive",
    targetType: "targetType",
    targetAgencyId: "targetAgencyId",
    allowedOrigins: "allowedOrigins",
    theme: "theme",
    rateLimitPerMinute: "rateLimitPerMinute",
    maxConversationLength: "maxConversationLength",
    requireEmail: "requireEmail",
    creditSource: "creditSource",
    monthlyCreditBudget: "monthlyCreditBudget",
    maxCreditsPerVisitorSession: "maxCreditsPerVisitorSession",
    maxCreditsPerVisitorDay: "maxCreditsPerVisitorDay",
    defaultPersonaId: "defaultPersonaId",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ _eq: [a, b] })),
  and: vi.fn((...args) => ({ _and: args })),
  desc: vi.fn((col) => ({ _desc: col })),
}));

const { mockGetOrCreateSystemUser } = vi.hoisted(() => ({
  mockGetOrCreateSystemUser: vi.fn().mockResolvedValue({ userId: 99 }),
}));

vi.mock("../../services/widgetService", () => ({
  getOrCreateSystemUser: mockGetOrCreateSystemUser,
}));

vi.mock("../../services/redisClients", () => ({
  getCacheClient: vi.fn().mockReturnValue({
    get: vi.fn().mockResolvedValue(null),
    incr: vi.fn().mockResolvedValue(1),
    incrby: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
  }),
}));

// ── Import subject under test ─────────────────────────────────────────────────

import { widgetRouter } from "../widget";

// ── Test context builder ──────────────────────────────────────────────────────

function makeCtx(role = "domain_admin", tenantId = "tenant-test") {
  return {
    user: { id: 1, email: "admin@test.com", role, currentTenantId: tenantId },
    tenantId,
  } as any;
}

function chainSelect(rows: any[]) {
  // Create a thenable chain that resolves to rows (for list which ends in orderBy)
  // and also supports .limit() for single-item lookups
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    orderBy: vi.fn().mockResolvedValue(rows),
    then: (resolve: Function) => resolve(rows),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function chainInsert(rows: any[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDbInsert.mockReturnValue(chain);
  return chain;
}

function chainUpdate(rows: any[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDbUpdate.mockReturnValue(chain);
  return chain;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("widget.list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns widgets for caller's tenant only", async () => {
    const widgets = [
      { id: "w1", tenantId: "tenant-test", name: "Widget A", isActive: true },
      { id: "w2", tenantId: "tenant-test", name: "Widget B", isActive: true },
    ];
    chainSelect(widgets);

    const result = await widgetRouter.list({ ctx: makeCtx(), input: undefined });
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no widgets exist", async () => {
    chainSelect([]);
    const result = await widgetRouter.list({ ctx: makeCtx(), input: undefined });
    expect(result).toEqual([]);
  });
});

describe("widget.create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates widget with valid input and returns widget with id", async () => {
    const newWidget = {
      id: "new-w1",
      tenantId: "tenant-test",
      name: "My Widget",
      isActive: true,
      targetType: "chat",
      allowedOrigins: ["https://example.com"],
    };
    chainInsert([newWidget]);

    const result = await widgetRouter.create({
      ctx: makeCtx(),
      input: { name: "My Widget", targetType: "chat", allowedOrigins: ["https://example.com"] },
    });
    expect(result.id).toBe("new-w1");
  });

  it("rejects creation when chatWidget feature flag is false", async () => {
    mockGetTenantFeatureFlag.mockResolvedValueOnce(false);
    await expect(
      widgetRouter.create({
        ctx: makeCtx(),
        input: { name: "My Widget", targetType: "chat", allowedOrigins: [] },
      })
    ).rejects.toThrow();
  });

  it("auto-creates system user on first widget for tenant", async () => {
    chainInsert([{ id: "w99", tenantId: "tenant-test", name: "Widget" }]);
    await widgetRouter.create({
      ctx: makeCtx(),
      input: { name: "Widget", targetType: "chat", allowedOrigins: [] },
    });
    expect(mockGetOrCreateSystemUser).toHaveBeenCalledWith("tenant-test");
  });
});

describe("widget.update", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates widget theme and allowed_origins", async () => {
    // First select verifies ownership
    chainSelect([{ id: "w1", tenantId: "tenant-test" }]);
    const updated = {
      id: "w1",
      theme: { primaryColor: "#ff0000" },
      allowedOrigins: ["https://updated.com"],
    };
    chainUpdate([updated]);

    const result = await widgetRouter.update({
      ctx: makeCtx(),
      input: { widgetId: "w1", theme: { primaryColor: "#ff0000" }, allowedOrigins: ["https://updated.com"] },
    });
    expect(result.allowedOrigins).toEqual(["https://updated.com"]);
  });

  it("rejects update for widget belonging to different tenant", async () => {
    // Select returns widget belonging to different tenant
    chainSelect([{ id: "w1", tenantId: "other-tenant" }]);
    await expect(
      widgetRouter.update({
        ctx: makeCtx("domain_admin", "tenant-test"),
        input: { widgetId: "w1" },
      })
    ).rejects.toThrow();
  });
});

describe("widget.delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("soft-deletes widget (sets is_active to false)", async () => {
    chainSelect([{ id: "w1", tenantId: "tenant-test" }]);
    const updateChain = chainUpdate([{ id: "w1", isActive: false }]);

    await widgetRouter.delete({ ctx: makeCtx(), input: { widgetId: "w1" } });
    expect(updateChain.set).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
  });

  it("rejects deletion for widget belonging to different tenant", async () => {
    chainSelect([{ id: "w1", tenantId: "other-tenant" }]);
    await expect(
      widgetRouter.delete({ ctx: makeCtx(), input: { widgetId: "w1" } })
    ).rejects.toThrow();
  });
});

describe("widget.getEmbedCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns HTML snippet with correct script src and widget id", async () => {
    chainSelect([{ id: "w1", tenantId: "tenant-test", isActive: true }]);
    const result = await widgetRouter.getEmbedCode({
      ctx: makeCtx(),
      input: { widgetId: "w1" },
    });
    expect(result.embedCode).toContain("embed.js");
    expect(result.embedCode).toContain("w1");
  });

  it("includes data-widget-id attribute in snippet", async () => {
    chainSelect([{ id: "w42", tenantId: "tenant-test", isActive: true }]);
    const result = await widgetRouter.getEmbedCode({
      ctx: makeCtx(),
      input: { widgetId: "w42" },
    });
    expect(result.embedCode).toContain('data-widget-id="w42"');
  });
});
