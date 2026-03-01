import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for the messageCostService.getMessageCost function.
 */

const { mockGetMessageById } = vi.hoisted(() => ({
  mockGetMessageById: vi.fn(),
}));

vi.mock("../../services/chatService", () => ({
  getMessageById: mockGetMessageById,
}));

// Track db query calls
let dbQueryResults: any[] = [];
let dbQueryCallCount = 0;

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
  };
  return { mockDb };
});

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

function setupDbChain() {
  dbQueryCallCount = 0;
  mockDb.select.mockImplementation(() => {
    const idx = dbQueryCallCount++;
    const resultData = dbQueryResults[idx] ?? [];
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue(resultData),
          leftJoin: vi.fn().mockReturnValue(resultData),
        }),
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue(resultData),
            }),
          }),
        }),
      }),
    };
  });
}

import { getMessageCost } from "../../services/messageCostService";

beforeEach(() => {
  vi.clearAllMocks();
  dbQueryResults = [];
  dbQueryCallCount = 0;
});

describe("getMessageCost", () => {
  it("returns cost data for user's own message", async () => {
    mockGetMessageById.mockResolvedValue({
      id: 100,
      conversationId: 10,
      traceId: "trace123456789012345678901234",
    });

    dbQueryResults = [
      [{ id: 10, userId: 1 }],
      [{
        modelUsed: "gpt-4o",
        inputTokens: 500,
        outputTokens: 200,
        costUsd: "0.005",
        creditsCharged: 3,
        responseTimeMs: 1400,
        wasFallback: false,
        fallbackFromProviderId: null,
        providerId: 2,
        providerName: "OpenRouter",
      }],
    ];
    setupDbChain();

    const result = await getMessageCost({
      messageId: 100,
      userId: 1,
      userRole: "user",
    });

    expect(result).not.toBeNull();
    expect(result).toEqual(
      expect.objectContaining({
        model: "gpt-4o",
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
        creditsUsed: 3,
        responseTimeMs: 1400,
      })
    );
  });

  it("rejects request for another user's message (non-admin)", async () => {
    mockGetMessageById.mockResolvedValue({
      id: 100,
      conversationId: 10,
      traceId: "trace123456789012345678901234",
    });

    dbQueryResults = [
      [{ id: 10, userId: 99 }], // Different user
    ];
    setupDbChain();

    await expect(
      getMessageCost({ messageId: 100, userId: 1, userRole: "user" })
    ).rejects.toThrow("FORBIDDEN");
  });

  it("omits costUsd for non-admin users", async () => {
    mockGetMessageById.mockResolvedValue({
      id: 100,
      conversationId: 10,
      traceId: "trace123456789012345678901234",
    });

    dbQueryResults = [
      [{ id: 10, userId: 1 }],
      [{
        modelUsed: "gpt-4o",
        inputTokens: 500,
        outputTokens: 200,
        costUsd: "0.005",
        creditsCharged: 3,
        responseTimeMs: 1400,
        wasFallback: false,
        fallbackFromProviderId: null,
        providerId: 2,
        providerName: "OpenRouter",
      }],
    ];
    setupDbChain();

    const result = await getMessageCost({
      messageId: 100,
      userId: 1,
      userRole: "user",
    });

    expect(result?.costUsd).toBeUndefined();
  });

  it("includes costUsd for admin users", async () => {
    mockGetMessageById.mockResolvedValue({
      id: 100,
      conversationId: 10,
      traceId: "trace123456789012345678901234",
    });

    dbQueryResults = [
      [{ id: 10, userId: 99 }], // Different user, admin can access
      [{
        modelUsed: "gpt-4o",
        inputTokens: 500,
        outputTokens: 200,
        costUsd: "0.005",
        creditsCharged: 3,
        responseTimeMs: 1400,
        wasFallback: false,
        fallbackFromProviderId: null,
        providerId: 2,
        providerName: "OpenRouter",
      }],
    ];
    setupDbChain();

    const result = await getMessageCost({
      messageId: 100,
      userId: 1,
      userRole: "admin",
    });

    expect(result?.costUsd).toBe(0.005);
  });

  it("returns null gracefully when no providerUsageLog entry exists", async () => {
    mockGetMessageById.mockResolvedValue({
      id: 100,
      conversationId: 10,
      traceId: "trace123456789012345678901234",
    });

    dbQueryResults = [
      [{ id: 10, userId: 1 }],
      [], // No usage log entry
    ];
    setupDbChain();

    const result = await getMessageCost({
      messageId: 100,
      userId: 1,
      userRole: "user",
    });

    expect(result).toBeNull();
  });
});
