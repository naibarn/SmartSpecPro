/**
 * Tests for widgetService — system user management and credit cap logic.
 *
 * Covers:
 * - Per-tenant system user auto-creation on first widget activation
 * - System user email pattern: widget-system@{tenantId}.internal
 * - System user role is 'user'
 * - System user has random bcrypt hash password
 * - Returns existing system user if already created
 * - Rejects login attempt for widget-system@*.internal emails
 * - Per-visitor Redis cap enforcement (session, daily, monthly)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const {
  mockDbSelect,
  mockDbInsert,
  mockRedisIncrby,
  mockRedisExpire,
  mockRedisGet,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockRedisIncrby: vi.fn(),
  mockRedisExpire: vi.fn(),
  mockRedisGet: vi.fn(),
}));

vi.mock("../../../drizzle/schema", () => ({
  users: {
    id: "id",
    email: "email",
    username: "username",
    password: "password",
    role: "role",
    currentTenantId: "currentTenantId",
    isActive: "isActive",
  },
  tenants: { id: "id", ownerId: "ownerId" },
}));

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: mockDbSelect,
    insert: mockDbInsert,
  }),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn().mockReturnValue({
    incrby: mockRedisIncrby,
    expire: mockRedisExpire,
    get: mockRedisGet,
  }),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ col, val })),
}));

const { mockBcryptHash } = vi.hoisted(() => ({
  mockBcryptHash: vi.fn().mockResolvedValue("$2b$12$hashedpassword"),
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: mockBcryptHash,
    compare: vi.fn().mockResolvedValue(false),
  },
  hash: mockBcryptHash,
  compare: vi.fn().mockResolvedValue(false),
}));

// ── Import subject under test ─────────────────────────────────────────────────

import {
  getOrCreateSystemUser,
  isWidgetSystemEmail,
  checkVisitorCaps,
  WIDGET_SESSION_CAP_TTL,
  WIDGET_DAILY_CAP_TTL,
  WIDGET_MONTHLY_CAP_TTL,
} from "../widgetService";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("System User Management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing system user if already created for tenant", async () => {
    // First select returns existing user
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{ id: 42, email: "widget-system@tenant-1.internal" }]),
        }),
      }),
    });

    const result = await getOrCreateSystemUser("tenant-1");
    expect(result.userId).toBe(42);
    // Should not insert
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("auto-creates system user on first widget activation for tenant", async () => {
    // First select returns no user
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    // Insert returns new user
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 99, email: "widget-system@tenant-2.internal" }]),
      }),
    });

    const result = await getOrCreateSystemUser("tenant-2");
    expect(result.userId).toBe(99);
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it("system user email matches pattern widget-system@{tenantId}.internal", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    let insertedEmail = "";
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockImplementation((vals: any) => {
        insertedEmail = vals.email;
        return {
          returning: vi.fn().mockResolvedValue([{ id: 100, email: vals.email }]),
        };
      }),
    });

    await getOrCreateSystemUser("my-tenant-id");
    expect(insertedEmail).toBe("widget-system@my-tenant-id.internal");
  });

  it("system user role is 'user'", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    let insertedRole = "";
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockImplementation((vals: any) => {
        insertedRole = vals.role;
        return { returning: vi.fn().mockResolvedValue([{ id: 101, email: vals.email }]) };
      }),
    });

    await getOrCreateSystemUser("tenant-3");
    expect(insertedRole).toBe("user");
  });

  it("system user password is a bcrypt hash (not empty string)", async () => {
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    });
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 102, email: "widget-system@t.internal" }]),
      }),
    });

    await getOrCreateSystemUser("t");
    expect(mockBcryptHash).toHaveBeenCalled();
    const [, rounds] = mockBcryptHash.mock.calls[0];
    expect(rounds).toBeGreaterThanOrEqual(10); // secure rounds
  });
});

describe("isWidgetSystemEmail — login prevention", () => {
  it("returns true for widget-system@*.internal emails", () => {
    expect(isWidgetSystemEmail("widget-system@tenant-abc.internal")).toBe(true);
    expect(isWidgetSystemEmail("widget-system@12345.internal")).toBe(true);
  });

  it("returns false for normal emails", () => {
    expect(isWidgetSystemEmail("user@example.com")).toBe(false);
    expect(isWidgetSystemEmail("admin@smartaihub.app")).toBe(false);
    expect(isWidgetSystemEmail("widget-system@external.com")).toBe(false);
  });
});

describe("Per-Visitor Rate Caps (Redis)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("session cap key format: widget:session:{visitorSessionId}", async () => {
    mockRedisIncrby.mockResolvedValue(1); // under cap
    await checkVisitorCaps({
      widgetId: "w1",
      visitorSessionId: "sess-123",
      visitorIp: "1.2.3.4",
      creditCost: 1,
      maxPerSession: 50,
      maxPerDay: 100,
      monthlyBudget: null,
    });
    const sessionCall = mockRedisIncrby.mock.calls.find(
      (c: string[]) => (c[0] as string).includes("widget:session:")
    );
    expect(sessionCall?.[0]).toContain("sess-123");
  });

  it("daily cap key format: widget:daily:{widgetId}:{hashedIp}:{YYYY-MM-DD}", async () => {
    mockRedisIncrby.mockResolvedValue(1);
    await checkVisitorCaps({
      widgetId: "w2",
      visitorSessionId: "sess-456",
      visitorIp: "5.6.7.8",
      creditCost: 1,
      maxPerSession: 50,
      maxPerDay: 100,
      monthlyBudget: null,
    });
    const dailyCall = mockRedisIncrby.mock.calls.find(
      (c: string[]) => (c[0] as string).includes("widget:daily:")
    );
    expect(dailyCall?.[0]).toContain("w2");
    // Should contain date pattern
    expect(dailyCall?.[0]).toMatch(/widget:daily:w2:.+:\d{4}-\d{2}-\d{2}/);
  });

  it("monthly cap key format: widget:monthly:{widgetId}:{YYYY-MM}", async () => {
    mockRedisIncrby.mockResolvedValue(1);
    await checkVisitorCaps({
      widgetId: "w3",
      visitorSessionId: "sess-789",
      visitorIp: "9.10.11.12",
      creditCost: 1,
      maxPerSession: 50,
      maxPerDay: 100,
      monthlyBudget: 500,
    });
    const monthlyCall = mockRedisIncrby.mock.calls.find(
      (c: string[]) => (c[0] as string).includes("widget:monthly:")
    );
    expect(monthlyCall?.[0]).toMatch(/widget:monthly:w3:\d{4}-\d{2}/);
  });

  it("daily cap key expires after 24 hours", async () => {
    mockRedisIncrby.mockResolvedValue(1);
    await checkVisitorCaps({
      widgetId: "w4",
      visitorSessionId: "sess-daily",
      visitorIp: "1.1.1.1",
      creditCost: 1,
      maxPerSession: 50,
      maxPerDay: 100,
      monthlyBudget: null,
    });
    // Find the expire call for the daily key
    const dailyExpireCall = mockRedisExpire.mock.calls.find(
      (c: any[]) => (c[0] as string).includes("widget:daily:")
    );
    expect(dailyExpireCall?.[1]).toBe(WIDGET_DAILY_CAP_TTL);
    expect(WIDGET_DAILY_CAP_TTL).toBe(86400);
  });

  it("monthly cap key expires after 32 days", async () => {
    mockRedisIncrby.mockResolvedValue(1);
    await checkVisitorCaps({
      widgetId: "w5",
      visitorSessionId: "sess-monthly",
      visitorIp: "2.2.2.2",
      creditCost: 1,
      maxPerSession: 50,
      maxPerDay: 100,
      monthlyBudget: 1000,
    });
    const monthlyExpireCall = mockRedisExpire.mock.calls.find(
      (c: any[]) => (c[0] as string).includes("widget:monthly:")
    );
    expect(monthlyExpireCall?.[1]).toBe(WIDGET_MONTHLY_CAP_TTL);
    expect(WIDGET_MONTHLY_CAP_TTL).toBe(32 * 86400);
  });

  it("enforces session cap — throws when session credits exhausted", async () => {
    // GET returns current value at cap limit; adding creditCost=1 would exceed maxPerSession=50
    mockRedisGet.mockResolvedValueOnce("50"); // session already at 50/50
    await expect(
      checkVisitorCaps({
        widgetId: "w6",
        visitorSessionId: "sess-exceeded",
        visitorIp: "3.3.3.3",
        creditCost: 1,
        maxPerSession: 50,
        maxPerDay: 100,
        monthlyBudget: null,
      })
    ).rejects.toThrow(/session/i);
  });

  it("enforces daily cap — throws when daily credits exhausted", async () => {
    // Session GET returns 0 (OK), daily GET returns 100 (at limit)
    mockRedisGet
      .mockResolvedValueOnce("0")   // session: 0+1 <= 50 → OK
      .mockResolvedValueOnce("100"); // daily: 100+1 > 100 → throw
    mockRedisIncrby.mockResolvedValue(1); // session INCRBY (first creation)
    await expect(
      checkVisitorCaps({
        widgetId: "w7",
        visitorSessionId: "sess-daily-exceeded",
        visitorIp: "4.4.4.4",
        creditCost: 1,
        maxPerSession: 50,
        maxPerDay: 100,
        monthlyBudget: null,
      })
    ).rejects.toThrow(/daily/i);
  });

  it("enforces monthly budget — throws when monthly budget exhausted", async () => {
    // Session OK, daily OK, monthly at limit
    mockRedisGet
      .mockResolvedValueOnce("0")   // session: 0+1 <= 50 → OK
      .mockResolvedValueOnce("0")   // daily: 0+1 <= 100 → OK
      .mockResolvedValueOnce("500"); // monthly: 500+1 > 500 → throw
    mockRedisIncrby.mockResolvedValue(1); // session and daily INCRBY (first creation)
    await expect(
      checkVisitorCaps({
        widgetId: "w8",
        visitorSessionId: "sess-monthly-exceeded",
        visitorIp: "5.5.5.5",
        creditCost: 1,
        maxPerSession: 50,
        maxPerDay: 100,
        monthlyBudget: 500,
      })
    ).rejects.toThrow(/monthly|budget/i);
  });

  it("session cap TTL is set", () => {
    expect(WIDGET_SESSION_CAP_TTL).toBe(3600); // 1 hour
  });
});
