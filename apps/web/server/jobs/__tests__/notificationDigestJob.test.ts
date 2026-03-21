import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSendDigest = vi.fn().mockResolvedValue(true);
const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisClient = {
  get: mockRedisGet,
  set: mockRedisSet,
};
const mockSelect = vi.fn();
const mockFrom = vi.fn();
const mockWhere = vi.fn();
const mockInnerJoin = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();

vi.mock("../../services/notificationEmailService", () => ({
  sendNotificationDigest: (...args: any[]) => mockSendDigest(...args),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: () => mockRedisClient,
}));

const mockDb = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: mockWhere,
      }),
      where: () => ({
        orderBy: () => ({
          limit: mockLimit,
        }),
      }),
    }),
  }),
};

vi.mock("../../db", () => ({
  getDb: () => mockDb,
}));

// Import the function under test after mocks
import { executeDigestRun } from "../notificationDigestJob";

describe("notificationDigestJob", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue("OK");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queries users with email=true in notificationPreferences", async () => {
    mockWhere.mockResolvedValue([]);
    await executeDigestRun();
    expect(mockWhere).toHaveBeenCalled();
  });

  it("sends digest for 'hourly' users on every execution", async () => {
    mockWhere.mockResolvedValue([
      {
        userId: 1,
        emailDigestFrequency: "hourly",
        emailDigestHour: null,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([
      {
        id: 1,
        title: "Test",
        content: "Body",
        priority: "normal",
        createdAt: new Date(),
      },
    ]);
    await executeDigestRun();
    expect(mockSendDigest).toHaveBeenCalledOnce();
  });

  it("skips 'daily' users when current UTC hour does not match digestHour", async () => {
    vi.setSystemTime(new Date("2026-03-20T10:00:00Z")); // UTC hour 10
    mockWhere.mockResolvedValue([
      {
        userId: 2,
        emailDigestFrequency: "daily",
        emailDigestHour: 8, // wants digest at 8 UTC
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    await executeDigestRun();
    expect(mockSendDigest).not.toHaveBeenCalled();
  });

  it("sends digest for 'daily' users when current UTC hour matches digestHour", async () => {
    vi.setSystemTime(new Date("2026-03-20T08:00:00Z")); // UTC hour 8
    mockWhere.mockResolvedValue([
      {
        userId: 3,
        emailDigestFrequency: "daily",
        emailDigestHour: 8,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([
      {
        id: 1,
        title: "Test",
        content: "Body",
        priority: "normal",
        createdAt: new Date(),
      },
    ]);
    await executeDigestRun();
    expect(mockSendDigest).toHaveBeenCalledOnce();
  });

  it("updates last digest time in Redis after successful send", async () => {
    mockWhere.mockResolvedValue([
      {
        userId: 4,
        emailDigestFrequency: "hourly",
        emailDigestHour: null,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([
      {
        id: 1,
        title: "Test",
        content: "Body",
        priority: "normal",
        createdAt: new Date(),
      },
    ]);
    await executeDigestRun();
    expect(mockRedisSet).toHaveBeenCalledWith(
      "notification:digest:last:4",
      expect.any(String),
      "EX",
      604800,
    );
  });

  it("reads last digest time from Redis key", async () => {
    mockWhere.mockResolvedValue([
      {
        userId: 5,
        emailDigestFrequency: "hourly",
        emailDigestHour: null,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([]);
    await executeDigestRun();
    expect(mockRedisGet).toHaveBeenCalledWith("notification:digest:last:5");
  });

  it("sets Redis key with 7-day TTL after updating last digest time", async () => {
    mockWhere.mockResolvedValue([
      {
        userId: 6,
        emailDigestFrequency: "hourly",
        emailDigestHour: null,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([
      {
        id: 1,
        title: "Test",
        content: "Body",
        priority: "normal",
        createdAt: new Date(),
      },
    ]);
    await executeDigestRun();
    // 604800 = 7 * 24 * 60 * 60 seconds
    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringContaining("notification:digest:last:"),
      expect.any(String),
      "EX",
      604800,
    );
  });

  it("skips users with zero unread notifications since last digest", async () => {
    mockWhere.mockResolvedValue([
      {
        userId: 7,
        emailDigestFrequency: "hourly",
        emailDigestHour: null,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([]);
    await executeDigestRun();
    expect(mockSendDigest).not.toHaveBeenCalled();
  });

  it("handles Redis unavailability gracefully (falls back to 1 hour ago)", async () => {
    mockRedisGet.mockRejectedValueOnce(new Error("Redis down"));
    mockWhere.mockResolvedValue([
      {
        userId: 8,
        emailDigestFrequency: "hourly",
        emailDigestHour: null,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([
      {
        id: 1,
        title: "Test",
        content: "Body",
        priority: "normal",
        createdAt: new Date(),
      },
    ]);
    // Should not throw
    await expect(executeDigestRun()).resolves.not.toThrow();
    expect(mockSendDigest).toHaveBeenCalledOnce();
  });

  it("does not throw if sendNotificationDigest fails for one user", async () => {
    mockSendDigest.mockRejectedValueOnce(new Error("Email failed"));
    mockWhere.mockResolvedValue([
      {
        userId: 9,
        emailDigestFrequency: "hourly",
        emailDigestHour: null,
        email: "user@test.com",
        name: "Test",
        locale: "en",
      },
    ]);
    mockLimit.mockResolvedValue([
      {
        id: 1,
        title: "Test",
        content: "Body",
        priority: "normal",
        createdAt: new Date(),
      },
    ]);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(executeDigestRun()).resolves.not.toThrow();
    consoleSpy.mockRestore();
  });
});
