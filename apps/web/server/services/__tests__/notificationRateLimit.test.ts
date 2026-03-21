import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist the mock function so vi.mock can reference it
const mockIsAllowed = vi.hoisted(() => vi.fn().mockReturnValue(true));

// Mock dependencies
vi.mock("../../services/telegramService", () => ({
  enqueueTelegramNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/redisClients", () => ({
  getRealtimeClient: vi.fn(() => ({
    duplicate: vi.fn(() => ({})),
  })),
}));

vi.mock("../redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    del: vi.fn().mockResolvedValue(1),
  })),
}));

vi.mock("../rateLimiter", () => ({
  createRateLimiter: vi.fn(() => ({
    isAllowed: mockIsAllowed,
    getRemaining: vi.fn().mockReturnValue(100),
    getResetTime: vi.fn().mockReturnValue(0),
    reset: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({
    notificationPreferencesEnabled: false,
    notificationDedupEnabled: false,
  }),
}));

function createDbMock() {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: 42 }]),
  };
  return {
    insert: vi.fn(() => chain),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    _chain: chain,
  };
}

import { createNotification } from "../notificationService";

describe("createNotification rate limiting", () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = createDbMock();
    mockIsAllowed.mockReturnValue(true);
  });

  it("allows notification when rate limiter returns true", async () => {
    mockIsAllowed.mockReturnValue(true);

    const result = await createNotification({
      db: mockDb as any,
      userId: 1,
      type: "alert",
      title: "Test",
      content: "Test content",
    });

    expect(result).not.toBeNull();
    expect(result?.notificationId).toBe(42);
  });

  it("returns null when rate limiter returns false", async () => {
    mockIsAllowed.mockReturnValue(false);

    const result = await createNotification({
      db: mockDb as any,
      userId: 1,
      type: "alert",
      title: "Rate limited test",
      content: "Should be dropped",
    });

    expect(result).toBeNull();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("bypasses rate limit for escalated notifications", async () => {
    mockIsAllowed.mockReturnValue(false);

    const result = await createNotification({
      db: mockDb as any,
      userId: 1,
      type: "alert",
      title: "Escalated alert",
      content: "Critical escalation",
      priority: "critical",
      metadata: { isEscalated: true },
    });

    expect(mockIsAllowed).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
  });

  it("passes userId as rate limit key", async () => {
    mockIsAllowed.mockReturnValue(true);

    await createNotification({
      db: mockDb as any,
      userId: 42,
      type: "alert",
      title: "Test",
      content: "Test content",
    });

    expect(mockIsAllowed).toHaveBeenCalledWith("42");
  });
});
